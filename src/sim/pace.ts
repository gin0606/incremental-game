// ボットの組に遊ばせてペースの指標を測る。目標値との比較は pace-check.ts。指標の定義と理由は docs/design/README.md に
// ある。
import type { PurchaseRule } from "./bot.ts";
import { botName } from "./bot.ts";
import { efficiencies, idleViolations, phaseStart, returnLevels, tolerance } from "./idle.ts";
import {
  gaps,
  largest,
  largestLead,
  longestWall,
  median,
  milestoneRatios,
  milestoneTimes,
  segmentSpeeds,
  speedChanges,
} from "./metrics.ts";
import type { Model } from "./model.ts";
import type { Settings, Targets } from "./pace-targets.ts";
import type { Trial } from "./sets.ts";
import type { Run } from "./simulate.ts";
import { simulate } from "./simulate.ts";

/** 妥当なボットのうち常に開いているもの 1 回分の指標。 */
export interface PlayMeasure {
  readonly bot: string;
  readonly milestones: readonly (number | undefined)[];
  readonly ratios: readonly number[];
  readonly speeds: readonly number[];
  readonly changes: readonly number[];
  readonly purchaseMedian: number | undefined;
  readonly purchaseLongest: number | undefined;
  readonly perDay: number;
  readonly noveltyGap: number;
  readonly wall: number;
}

/** 購入規則 1 つの、局面 1 つの放置の指標。 */
export interface IdleMeasure {
  readonly rule: PurchaseRule;
  readonly bots: readonly string[];
  readonly phase: number;
  readonly efficiency: readonly number[];
  readonly tolerance: number;
  readonly returns: readonly number[];
  readonly violations: readonly string[];
}

export interface Measurement {
  readonly plays: readonly PlayMeasure[];
  readonly choices: readonly { readonly bots: readonly string[]; readonly lead: number }[];
  readonly idles: readonly IdleMeasure[];
}

const DAY = 86_400;

const always = (trial: Trial): boolean => trial.bot.checkIn.kind === "always";

const play = <S>(model: Model<S>, settings: Settings, step: number, trial: Trial): Run<S> =>
  simulate(model, trial.bot, {
    duration: settings.duration,
    step,
    sampleEvery: settings.sampleEvery,
    seed: trial.seed,
  });

/** `initial` は最初から解放されている要素。新要素に数えない。 */
const playMeasure = <S>(
  settings: Settings,
  targets: Targets,
  initial: readonly string[],
  run: Run<S>,
): PlayMeasure => {
  const { timeline } = run;
  const { duration, sampleEvery, growth, walls } = settings;
  const times = milestoneTimes(timeline, targets.milestones.levels);
  const speeds = segmentSpeeds(timeline, growth.bounds);
  const purchases = gaps(
    timeline.filter((entry) => entry.kind === "purchase").map((entry) => entry.t),
  );
  const unlocks = timeline.filter(
    (entry) => entry.kind === "unlock" && !initial.includes(entry.id),
  );
  return {
    bot: botName(run.bot),
    milestones: times,
    ratios: milestoneRatios(times),
    speeds,
    changes: speedChanges(speeds),
    purchaseMedian: median(purchases),
    purchaseLongest: purchases.length === 0 ? undefined : largest(purchases),
    perDay: unlocks.length / (duration / DAY),
    // 時刻 0 から最初の解放までも空白に含める（解放が無ければ遊ぶ時間全体が空白）。
    noveltyGap: largest(gaps([0, ...unlocks.map((entry) => entry.t)], duration)),
    wall: longestWall(timeline, { ...walls, every: sampleEvery, duration }),
  };
};

/**
 * 購入規則 `rule` の放置の指標を局面ごとに測る。`every` の予定で開くボットが組に無い規則は測らない。乱数のシードは、
 * 組でその規則を最初に遊ばせるボットのものを使う。
 */
const idleMeasures = <S>(
  model: Model<S>,
  settings: Settings,
  targets: Targets,
  step: number,
  rule: PurchaseRule,
  trials: readonly Trial[],
): IdleMeasure[] => {
  const own = trials.filter((trial) => trial.bot.purchase === rule);
  const intervals = [
    ...new Set(
      own.flatMap(({ bot: { checkIn } }) => (checkIn.kind === "every" ? [checkIn.seconds] : [])),
    ),
  ].toSorted((a, b) => a - b);
  const [first] = own;
  if (first === undefined || intervals.length === 0) {
    return [];
  }
  const { idle, sampleEvery } = settings;
  const timing = { step, sampleEvery, seed: first.seed };
  const bots = ["always", ...intervals.map((seconds) => `${seconds}s`)].map(
    (at) => `${rule}@${at}`,
  );
  return idle.phases.map((phase) => {
    const start = phaseStart(model, rule, phase, timing);
    const efficiency = efficiencies(model, start, rule, intervals, idle, timing);
    return {
      rule,
      bots,
      phase,
      efficiency,
      tolerance: tolerance(intervals, efficiency, targets.idle.efficiency),
      returns: returnLevels(model, start, rule, idle.away, timing),
      violations: idleViolations(model, start, idle.away),
    };
  });
};

/** `trials` の組に `model` のゲームを、測り方 `settings` と刻み幅 `step` 秒で遊ばせ、指標を測る。 */
export function measure<S>(
  model: Model<S>,
  settings: Settings,
  targets: Targets,
  trials: readonly Trial[],
  step: number,
): Measurement {
  const active = trials.filter((trial) => always(trial));
  const runs = active.map((trial) => play(model, settings, step, trial));
  const reasonable = (run: Run<S>): boolean => settings.reasonable.includes(run.bot.purchase);
  const best = runs.find((run) => run.bot.purchase === settings.choice.best);
  const initial = model.unlocked(model.initial);
  return {
    plays: runs
      .filter((run) => reasonable(run))
      .map((run) => playMeasure(settings, targets, initial, run)),
    choices:
      best === undefined
        ? []
        : runs
            .filter((run) => settings.choice.restricted.includes(run.bot.purchase))
            .map((run) => ({
              bots: [botName(best.bot), botName(run.bot)],
              lead: largestLead(
                best.timeline,
                run.timeline,
                settings.sampleEvery,
                settings.duration,
              ),
            })),
    idles: settings.reasonable.flatMap((rule) =>
      idleMeasures(model, settings, targets, step, rule, trials),
    ),
  };
}
