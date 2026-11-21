// 放置の指標（放置の許容間隔、戻ったときの報酬曲線）と、不在を罰しない不変条件を、局面の状態から遊ばせて求める。
// 定義と理由は docs/design/README.md にある。
import type { Num } from "../core/num.ts";
import { ZERO, add, approxEqual, atLeast, div, log10, mul, num, toNumber } from "../core/num.ts";
import type { CheckIn, PurchaseRule } from "./bot.ts";
import { consecutive, zip } from "./metrics.ts";
import type { Model } from "./model.ts";
import type { Run } from "./simulate.ts";
import { simulate } from "./simulate.ts";

/** 遊ばせるときの時間の設定（{@link Settings} から遊ぶ時間を除いたもの）。 */
export interface Timing {
  readonly step: number;
  readonly sampleEvery: number;
  readonly seed: number;
}

const play = <S>(
  model: Model<S>,
  purchase: PurchaseRule,
  checkIn: CheckIn,
  duration: number,
  timing: Timing,
): Run<S> => simulate(model, { purchase, checkIn, prestige: "never" }, { duration, ...timing });

const from = <S>(model: Model<S>, initial: S): Model<S> => ({ ...model, initial });

/** 常に開いている `purchase` のボットが、時刻 `phase` 秒まで遊んだ状態（局面の始まり）。 */
export function phaseStart<S>(
  model: Model<S>,
  purchase: PurchaseRule,
  phase: number,
  timing: Timing,
): S {
  return play(model, purchase, { kind: "always" }, phase, timing).final;
}

/** 遊んだ間に生産した資源の量。記録の生産量が次の記録まで続いたとみなす。 */
export function produced<S>(run: Run<S>): Num {
  const ends = [...run.timeline.slice(1).map((entry) => entry.t), run.settings.duration];
  return zip(run.timeline, ends).reduce(
    (sum, [entry, end]) => add(sum, mul(entry.rate, num(end - entry.t))),
    ZERO,
  );
}

/**
 * 状態 `start` から `window` 秒遊ばせたとき、`intervals` 秒ごとにしか開かないボットそれぞれが、常に開いている
 * ボットの何割を生産したか（効率）。どちらも購入規則は `purchase`。
 */
export function efficiencies<S>(
  model: Model<S>,
  start: S,
  purchase: PurchaseRule,
  intervals: readonly number[],
  window: number,
  timing: Timing,
): number[] {
  const game = from(model, start);
  const always = produced(play(game, purchase, { kind: "always" }, window, timing));
  return intervals.map((seconds) =>
    toNumber(
      div(produced(play(game, purchase, { kind: "every", seconds }, window, timing)), always),
    ),
  );
}

/**
 * 放置の許容間隔（秒）。昇順の `intervals` のうち、それ以下の間隔すべての効率が `threshold` 以上である最大の間隔。
 * 最も短い間隔の効率が届かなければ 0。
 */
export function tolerance(
  intervals: readonly number[],
  efficiency: readonly number[],
  threshold: number,
): number {
  let longest = 0;
  for (const [seconds, value] of zip(intervals, efficiency)) {
    if (!(value >= threshold)) {
      return longest;
    }
    longest = seconds;
  }
  return longest;
}

/** 戻った直後とみなす時間（秒）。ボットは遊ぶ時間の終わりには行動しないため、0 より長くする。 */
const RETURN_SECONDS = 1e-6;

/**
 * 状態 `start` から `away` 秒それぞれ何もせずに離れ、戻った直後に `purchase` の規則で買えるだけ買った後の、生産量の
 * 常用対数。
 */
export function returnLevels<S>(
  model: Model<S>,
  start: S,
  purchase: PurchaseRule,
  away: readonly number[],
  timing: Timing,
): number[] {
  return away.map((seconds) => {
    // 時刻 0 に一度だけ開いて買い、RETURN_SECONDS 秒で終える。
    const run = play(
      from(model, model.advance(start, seconds)),
      purchase,
      { kind: "every", seconds: 1 },
      RETURN_SECONDS,
      timing,
    );
    return log10(model.rate(run.final));
  });
}

/** 離れた時間と、そのときの状態。 */
interface Away<S> {
  readonly seconds: number;
  readonly state: S;
}

/** 不変条件で、資源・生産量の比較に許す相対誤差。 */
const INVARIANT_TOLERANCE = 1e-6;

/** 不変条件「一度に進めても刻んで進めても同じ」で、離れた時間を刻む数。 */
const PIECES = 7;

/**
 * 状態 `start` から `away` 秒（昇順）離れたときの、不在を罰しない不変条件の違反の説明。
 *
 * - 放置で資源と生産量が失われない: 長く離れたほうが生産量が下がらず、生産量が変わらなければ、資源が生産量 × 延びた
 *   時間以上に増える。
 * - 一度に進めても刻んで進めても同じ: `advance` を一度に呼んだ結果と、`PIECES` 回に分けて呼んだ結果の資源と生産量が
 *   許容誤差の範囲で一致する。資源は購入の直後に 0 近くまで減るため、離れた間の生産量の目安を足して比べる。
 */
export function idleViolations<S>(model: Model<S>, start: S, away: readonly number[]): string[] {
  const states: readonly Away<S>[] = away.map((seconds) => ({
    seconds,
    state: model.advance(start, seconds),
  }));
  const losses = consecutive<Away<S>>([{ seconds: 0, state: start }, ...states]).flatMap(
    ([shorter, longer]) => {
      const before = model.rate(shorter.state);
      const after = model.rate(longer.state);
      if (!atLeast(after, before, INVARIANT_TOLERANCE)) {
        return [`${shorter.seconds} 秒から ${longer.seconds} 秒離れると生産量が下がる`];
      }
      const expected = add(
        model.resource(shorter.state),
        mul(before, num(longer.seconds - shorter.seconds)),
      );
      return approxEqual(after, before, INVARIANT_TOLERANCE) &&
        !atLeast(model.resource(longer.state), expected, INVARIANT_TOLERANCE)
        ? [
            `${shorter.seconds} 秒から ${longer.seconds} 秒離れると、生産量が同じなのに資源が生産した分より少ない`,
          ]
        : [];
    },
  );
  const splits = states.flatMap(({ seconds, state }) => {
    const piece = seconds / PIECES;
    let split = start;
    for (let count = 0; count < PIECES; count += 1) {
      split = model.advance(split, piece);
    }
    const scale = mul(model.rate(state), num(seconds));
    return approxEqual(model.rate(split), model.rate(state), INVARIANT_TOLERANCE) &&
      approxEqual(
        add(model.resource(split), scale),
        add(model.resource(state), scale),
        INVARIANT_TOLERANCE,
      )
      ? []
      : [`${seconds} 秒を一度に進めた結果と ${PIECES} 回に分けて進めた結果が違う`];
  });
  return [...losses, ...splits];
}

/** 戻った後の生産量の常用対数 `levels` が、離れた時間 `away` について下がる組の説明（不変条件の違反）。 */
export function returnDrops(away: readonly number[], levels: readonly number[]): string[] {
  return consecutive(zip(away, levels)).flatMap(([[shorter, low], [longer, high]]) =>
    high >= low - INVARIANT_TOLERANCE
      ? []
      : [`${longer} 秒離れて戻ると、${shorter} 秒離れたときより生産量が低い`],
  );
}

/**
 * 戻った後の生産量の常用対数 `levels` が頭打ちになる点の説明（報酬曲線の傾向）。最も長く離れたときが、ほかのどの時間
 * より多く伸びなければ頭打ちとみなす。短い間隔どうしで伸びが同じなのは、次の購入に届かないためで、頭打ちではない。
 */
export function returnStalls(away: readonly number[], levels: readonly number[]): string[] {
  const pairs = zip(away, levels);
  const last = pairs.at(-1);
  return last === undefined
    ? []
    : pairs
        .slice(0, -1)
        .flatMap(([seconds, level]) =>
          last[1] > level ? [] : [`${last[0]} 秒離れて戻っても、${seconds} 秒のときより伸びない`],
        );
}
