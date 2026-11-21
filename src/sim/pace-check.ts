// 測った指標を目標値（帯・傾向）と不在を罰しない不変条件と比べ、2 つの刻み幅で測った指標の違いを刻み幅の守りとして
// 確かめる。指標の定義と理由は docs/design/README.md にある。
import { consecutive, zip } from "./metrics.ts";
import type { Model } from "./model.ts";
import type { IdleMeasure, Measurement } from "./pace.ts";
import { measure } from "./pace.ts";
import type { Band, Settings, Targets } from "./pace-targets.ts";
import { returnDrops, returnStalls } from "./idle.ts";
import type { Trial } from "./sets.ts";

/** 目標値などと比べた結果の 1 件。 */
export interface Check {
  /** 帯（目標値の範囲）、傾向、不変条件、刻み幅の守りのどれか。 */
  readonly kind: "帯" | "傾向" | "不変条件" | "刻み幅";
  readonly name: string;
  /** 測ったボットの名前。 */
  readonly bots: readonly string[];
  /** 満たさなかった点の説明。空なら満たした。 */
  readonly problems: readonly string[];
}

const outside = (value: number | undefined, band: Band): boolean =>
  value === undefined ||
  Number.isNaN(value) ||
  (band.min !== undefined && value < band.min) ||
  (band.max !== undefined && value > band.max);

const NO_BOTS = "測るボットが組に無い";

const range = (band: Band): string => `${band.min ?? "-∞"}〜${band.max ?? "∞"}`;

interface Item {
  readonly bot: string;
  readonly values: readonly (number | undefined)[];
}

/**
 * `items` の値がすべて `band` の範囲にあるか。測るボットが無いことと、ボットに比べる値が無いこと（節目の比を求める組が
 * 無い、など）も問題にする。何も比べずに通さないため。
 */
const bandCheck = (name: string, band: Band, items: readonly Item[]): Check => ({
  kind: "帯",
  name: `${name}（${range(band)}）`,
  bots: items.map((item) => item.bot),
  problems:
    items.length === 0
      ? [NO_BOTS]
      : items.flatMap(({ bot, values }) => {
          if (values.length === 0) {
            return [`${bot}: 比べる値が無い`];
          }
          return values.some((value) => outside(value, band))
            ? [`${bot}: ${values.map(String).join(", ")}`]
            : [];
        }),
});

const botsOf = (idles: readonly IdleMeasure[]): string[] => [
  ...new Set(idles.flatMap((idle) => idle.bots)),
];

/** 局面ごとの放置の指標から、局面ごとの問題を集める。 */
const idleCheck = (
  kind: Check["kind"],
  name: string,
  idles: readonly IdleMeasure[],
  problems: (idle: IdleMeasure) => readonly string[],
): Check => ({
  kind,
  name,
  bots: botsOf(idles),
  problems:
    idles.length === 0
      ? [NO_BOTS]
      : idles.flatMap((idle) =>
          problems(idle).map((problem) => `${idle.rule}、局面 ${idle.phase} 秒: ${problem}`),
        ),
});

/** 購入規則ごとに、局面の順で放置の許容間隔が縮む組を集める。 */
const toleranceShrinks = (idles: readonly IdleMeasure[]): Check => ({
  kind: "傾向",
  name: "放置の許容間隔が局面とともに縮まない",
  bots: botsOf(idles),
  problems:
    idles.length === 0
      ? [NO_BOTS]
      : [...new Set(idles.map((idle) => idle.rule))].flatMap((rule) =>
          consecutive(idles.filter((idle) => idle.rule === rule)).flatMap(([earlier, later]) =>
            later.tolerance < earlier.tolerance
              ? [
                  `${rule}: 局面 ${earlier.phase} 秒の ${earlier.tolerance} 秒から、局面 ${later.phase} 秒で ${later.tolerance} 秒に縮む`,
                ]
              : [],
          ),
        ),
});

type PlayMeasure = Measurement["plays"][number];

/** 遊ばせた結果の指標を目標値の帯と比べる。帯の名前、帯、ボットごとの値の組。 */
const bandChecks = (settings: Settings, targets: Targets, measurement: Measurement): Check[] => {
  const { milestones, growth, purchases, novelty, walls } = targets;
  const table: readonly (readonly [
    string,
    Band,
    (play: PlayMeasure) => readonly (number | undefined)[],
  ])[] = [
    ["節目に達した時刻（秒）。すべての節目に達する", { min: 0 }, (play) => play.milestones],
    ["節目の時刻の比", milestones.ratio, (play) => play.ratios],
    ["区間ごとの対数成長速度（桁/時）", growth.speed, (play) => play.speeds],
    ["隣り合う区間の成長速度の比", growth.change, (play) => play.changes],
    ["購入の間隔の中央値（秒）", purchases.median, (play) => [play.purchaseMedian]],
    ["購入の間隔の最長（秒）", purchases.longest, (play) => [play.purchaseLongest]],
    ["1 日あたりの新要素の数", novelty.perDay, (play) => [play.perDay]],
    ["新要素の空白の最長（秒）", novelty.longestGap, (play) => [play.noveltyGap]],
    [
      `壁（${settings.walls.below} 桁/時を下回る）の最長（秒）`,
      walls.longest,
      (play) => [play.wall],
    ],
  ];
  return table.map(([name, band, values]) =>
    bandCheck(
      name,
      band,
      measurement.plays.map((play) => ({ bot: play.bot, values: values(play) })),
    ),
  );
};

/** 局面ごとの放置の指標を、傾向と不変条件と比べる。 */
const idleChecks = (
  settings: Settings,
  targets: Targets,
  idles: readonly IdleMeasure[],
): Check[] => {
  const { reachBy, reach } = targets.idle;
  const { away } = settings.idle;
  return [
    toleranceShrinks(idles),
    idleCheck("傾向", `放置の許容間隔が ${reachBy} 秒以降の局面で ${reach} 秒以上`, idles, (each) =>
      each.phase >= reachBy && each.tolerance < reach ? [`許容間隔 ${each.tolerance} 秒`] : [],
    ),
    idleCheck(
      "傾向",
      `戻ったときの報酬が頭打ちにならない（${away.join("・")} 秒のうち最も長く離れたときが最も伸びる）`,
      idles,
      (each) => returnStalls(away, each.returns),
    ),
    idleCheck(
      "不変条件",
      "放置で資源と生産量が失われず、一度に進めても刻んで進めても同じ",
      idles,
      (each) => each.violations,
    ),
    idleCheck("不変条件", "長く離れたほうが短く離れたとき以上の状態で戻れる", idles, (each) =>
      returnDrops(away, each.returns),
    ),
  ];
};

/** 測り方 `settings` で測った指標を目標値と不変条件と比べる。 */
export function evaluate(settings: Settings, targets: Targets, measurement: Measurement): Check[] {
  return [
    ...bandChecks(settings, targets, measurement),
    bandCheck(
      "選択の重み（最良の規則が先行した最大の桁数）",
      targets.choice.lead,
      measurement.choices.map((each) => ({ bot: each.bots.join(" と "), values: [each.lead] })),
    ),
    ...idleChecks(settings, targets, measurement.idles),
  ];
}

/** 刻み幅の守りで、2 つ目の刻み幅を 1 つ目の何倍にするか。 */
export const GUARD_FACTOR = 7;

/** 刻み幅の守りで、同じとみなす指標の相対誤差。 */
export const GUARD_TOLERANCE = 1e-3;

/** 刻み幅の守りで比べる指標の名前と値。比や許容間隔など、ほかの指標から求める値は除く。 */
const numbersOf = (measurement: Measurement): (readonly [string, number | undefined])[] => [
  ...measurement.plays.flatMap((play) => [
    ...play.milestones.map(
      (value, index) => [`${play.bot} の節目 ${index} の時刻`, value] as const,
    ),
    ...play.speeds.map(
      (value, index) => [`${play.bot} の区間 ${index} の成長速度`, value] as const,
    ),
    [`${play.bot} の購入の間隔の中央値`, play.purchaseMedian] as const,
    [`${play.bot} の購入の間隔の最長`, play.purchaseLongest] as const,
    [`${play.bot} の新要素の数`, play.perDay] as const,
    [`${play.bot} の新要素の空白の最長`, play.noveltyGap] as const,
    [`${play.bot} の壁の最長`, play.wall] as const,
  ]),
  ...measurement.choices.map(
    (each) => [`${each.bots.join(" と ")} の選択の重み`, each.lead] as const,
  ),
  ...measurement.idles.flatMap((each) => [
    ...each.efficiency.map(
      (value, index) =>
        [`${each.rule}、局面 ${each.phase} 秒の間隔 ${index} の効率`, value] as const,
    ),
    ...each.returns.map(
      (value, index) => [`${each.rule}、局面 ${each.phase} 秒の戻った後 ${index}`, value] as const,
    ),
  ]),
];

/** 2 つの値が違うか。有限でない値（undefined、NaN、±Infinity）は、同じ値どうしだけを一致とみなす。 */
const differ = (a: number | undefined, b: number | undefined): boolean =>
  a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)
    ? !Object.is(a, b)
    : !(Math.abs(a - b) <= GUARD_TOLERANCE * Math.max(Math.abs(a), Math.abs(b)));

/** 2 つの刻み幅で測った指標を比べる。 */
export function stepGuard(
  steps: readonly [number, number],
  first: Measurement,
  second: Measurement,
): Check {
  const left = numbersOf(first);
  const right = numbersOf(second);
  const differences = zip(left, right).flatMap(([[name, a], [, b]]) =>
    differ(a, b) ? [`${name}: ${String(a)} と ${String(b)}`] : [],
  );
  const problems =
    left.length === right.length ? differences : ["測った指標の数が違う", ...differences];
  return {
    kind: "刻み幅",
    name: `刻み幅 ${steps[0]} 秒と ${steps[1]} 秒で指標が相対誤差 ${GUARD_TOLERANCE} の範囲で一致する`,
    bots: [...new Set([...first.plays.map((play) => play.bot), ...botsOf(first.idles)])],
    problems:
      problems.length === 0
        ? []
        : [
            "シミュレーターの結果は、購入なしに生産量や資源が変わるゲーム（自動購入、時間で伸びる生産量、時限で切れる効果など）では刻み幅に左右されうる（既知の制限。src/sim/simulate.ts の Settings.step の説明と、.axon の未判断の Issue「シミュレーターの結果が、購入なしに生産量や資源が変わるゲームでは刻み幅に左右される」）。指標を目標値と比べる前に、この制限への対処を決める。",
            ...problems,
          ],
  };
}

/**
 * `trials` の組に `model` のゲームを測り方 `settings` で遊ばせ、指標を目標値と不変条件と比べ、刻み幅の守りを足した
 * 結果を返す。指標は測り方の刻み幅と、その {@link GUARD_FACTOR} 倍の刻み幅で測る。
 */
export function checkPace<S>(
  model: Model<S>,
  settings: Settings,
  targets: Targets,
  trials: readonly Trial[],
): Check[] {
  const steps = [settings.step, settings.step * GUARD_FACTOR] as const;
  const first = measure(model, settings, targets, trials, steps[0]);
  return [
    ...evaluate(settings, targets, first),
    stepGuard(steps, first, measure(model, settings, targets, trials, steps[1])),
  ];
}
