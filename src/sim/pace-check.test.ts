import { expect, test } from "vitest";

import type { Check } from "./pace-check.ts";
import { GUARD_TOLERANCE, evaluate, stepGuard } from "./pace-check.ts";
import type { IdleMeasure, Measurement, PlayMeasure } from "./pace.ts";
import type { Settings, Targets } from "./pace-targets.ts";

const settings: Settings = {
  duration: 100,
  step: 10,
  sampleEvery: 10,
  reasonable: ["efficiency"],
  walls: { window: 50, below: 0.01 },
  choice: { best: "efficiency", restricted: ["cheapest"] },
  idle: { phases: [0, 50], window: 50, away: [5, 50] },
};

const targets: Targets = {
  milestones: { levels: [1, 2], ratio: { min: 1, max: 10 } },
  growth: { bounds: [0, 50, 100], speed: { min: 0.1 }, change: { max: 2 } },
  purchases: { median: { max: 20 }, longest: { max: 50 } },
  novelty: { perDay: { min: 1 }, longestGap: { max: 90 } },
  walls: { longest: { max: 30 } },
  choice: { lead: { min: 0.01, max: 1 } },
  idle: { efficiency: 0.99, reachBy: 50, reach: 600 },
};

const play: PlayMeasure = {
  bot: "efficiency@always",
  milestones: [10, 40],
  // 帯の端の値（節目の時刻の比の 1 と 10）は範囲に含める。
  ratios: [1, 10],
  speeds: [1, 0.5],
  changes: [0.5],
  purchaseMedian: 10,
  purchaseLongest: 30,
  perDay: 2,
  noveltyGap: 60,
  wall: 20,
};

const idle = (phase: number, tolerance: number): IdleMeasure => ({
  rule: "efficiency",
  bots: ["efficiency@always", "efficiency@60s", "efficiency@600s"],
  phase,
  efficiency: [1, 0.995],
  tolerance,
  returns: [1, 2],
  violations: [],
});

const passing: Measurement = {
  plays: [play],
  choices: [{ bots: ["efficiency@always", "cheapest@always"], lead: 0.1 }],
  idles: [idle(0, 60), idle(50, 600)],
};

const problemsOf = (checks: readonly Check[]): readonly (readonly [string, readonly string[]])[] =>
  checks.flatMap((check) =>
    check.problems.length === 0 ? [] : [[check.name, check.problems] as const],
  );

test("evaluate は目標値を満たす指標で、すべての項目を問題なしにする", () => {
  const checks = evaluate(settings, targets, passing);
  expect(checks.map((check) => [check.kind, check.name])).toStrictEqual([
    ["帯", "節目に達した時刻（秒）。すべての節目に達する（0〜∞）"],
    ["帯", "節目の時刻の比（1〜10）"],
    ["帯", "区間ごとの対数成長速度（桁/時）（0.1〜∞）"],
    ["帯", "隣り合う区間の成長速度の比（-∞〜2）"],
    ["帯", "購入の間隔の中央値（秒）（-∞〜20）"],
    ["帯", "購入の間隔の最長（秒）（-∞〜50）"],
    ["帯", "1 日あたりの新要素の数（1〜∞）"],
    ["帯", "新要素の空白の最長（秒）（-∞〜90）"],
    ["帯", "壁（0.01 桁/時を下回る）の最長（秒）（-∞〜30）"],
    ["帯", "選択の重み（最良の規則が先行した最大の桁数）（0.01〜1）"],
    ["傾向", "放置の許容間隔が局面とともに縮まない"],
    ["傾向", "放置の許容間隔が 50 秒以降の局面で 600 秒以上"],
    ["傾向", "戻ったときの報酬が頭打ちにならない（5・50 秒のうち最も長く離れたときが最も伸びる）"],
    ["不変条件", "放置で資源と生産量が失われず、一度に進めても刻んで進めても同じ"],
    ["不変条件", "長く離れたほうが短く離れたとき以上の状態で戻れる"],
  ]);
  expect(problemsOf(checks)).toStrictEqual([]);
});

test("evaluate は各項目に測ったボットの名前を、放置の項目では重なりを除いて付ける", () => {
  const roi = { ...idle(0, 60), rule: "roi", bots: ["roi@always", "roi@60s"] } as const;
  const bots = evaluate(settings, targets, { ...passing, idles: [...passing.idles, roi] }).map(
    (check) => check.bots,
  );
  expect(bots.slice(0, 9)).toStrictEqual(Array.from({ length: 9 }, () => ["efficiency@always"]));
  expect(bots[9]).toStrictEqual(["efficiency@always と cheapest@always"]);
  expect(bots.slice(10)).toStrictEqual(
    Array.from({ length: 5 }, () => [...idle(0, 0).bots, "roi@always", "roi@60s"]),
  );
});

test("evaluate は帯を外れた値を、ボットと値の一覧で挙げる", () => {
  const failing: Measurement = {
    ...passing,
    plays: [
      {
        ...play,
        milestones: [10, undefined],
        ratios: [11],
        speeds: [1, 0.05],
        changes: [3],
        purchaseMedian: 21,
        purchaseLongest: undefined,
        perDay: 0.5,
        noveltyGap: Number.NaN,
        wall: 31,
      },
      { ...play, bot: "roi@always" },
    ],
    choices: [{ bots: ["efficiency@always", "cheapest@always"], lead: 1.5 }],
  };
  expect(problemsOf(evaluate(settings, targets, failing))).toStrictEqual([
    ["節目に達した時刻（秒）。すべての節目に達する（0〜∞）", ["efficiency@always: 10, undefined"]],
    ["節目の時刻の比（1〜10）", ["efficiency@always: 11"]],
    ["区間ごとの対数成長速度（桁/時）（0.1〜∞）", ["efficiency@always: 1, 0.05"]],
    ["隣り合う区間の成長速度の比（-∞〜2）", ["efficiency@always: 3"]],
    ["購入の間隔の中央値（秒）（-∞〜20）", ["efficiency@always: 21"]],
    ["購入の間隔の最長（秒）（-∞〜50）", ["efficiency@always: undefined"]],
    ["1 日あたりの新要素の数（1〜∞）", ["efficiency@always: 0.5"]],
    ["新要素の空白の最長（秒）（-∞〜90）", ["efficiency@always: NaN"]],
    ["壁（0.01 桁/時を下回る）の最長（秒）（-∞〜30）", ["efficiency@always: 31"]],
    [
      "選択の重み（最良の規則が先行した最大の桁数）（0.01〜1）",
      ["efficiency@always と cheapest@always: 1.5"],
    ],
  ]);
});

test("evaluate は測るボットが組に無い項目を問題にする", () => {
  const empty: Measurement = { plays: [], choices: [], idles: [] };
  const checks = evaluate(settings, targets, empty);
  expect(checks.map((check) => check.problems)).toStrictEqual(
    Array.from({ length: 15 }, () => ["測るボットが組に無い"]),
  );
  expect(checks.map((check) => check.bots)).toStrictEqual(Array.from({ length: 15 }, () => []));
});

test("evaluate はボットに比べる値が無い帯の項目を問題にする", () => {
  const nothing: Measurement = { ...passing, plays: [{ ...play, ratios: [], changes: [] }] };
  expect(problemsOf(evaluate(settings, targets, nothing))).toStrictEqual([
    ["節目の時刻の比（1〜10）", ["efficiency@always: 比べる値が無い"]],
    ["隣り合う区間の成長速度の比（-∞〜2）", ["efficiency@always: 比べる値が無い"]],
  ]);
});

test("evaluate は放置の許容間隔が局面とともに縮む組を、購入規則ごとに挙げる", () => {
  const shrinking: Measurement = {
    ...passing,
    idles: [
      idle(0, 600),
      idle(50, 60),
      { ...idle(0, 60), rule: "roi" },
      { ...idle(50, 600), rule: "roi" },
    ],
  };
  expect(problemsOf(evaluate(settings, targets, shrinking))).toStrictEqual([
    [
      "放置の許容間隔が局面とともに縮まない",
      ["efficiency: 局面 0 秒の 600 秒から、局面 50 秒で 60 秒に縮む"],
    ],
    ["放置の許容間隔が 50 秒以降の局面で 600 秒以上", ["efficiency、局面 50 秒: 許容間隔 60 秒"]],
  ]);
});

test("evaluate は reachBy より前の局面の許容間隔を reach と比べない", () => {
  const early: Measurement = { ...passing, idles: [idle(0, 0), idle(49, 0), idle(50, 600)] };
  expect(problemsOf(evaluate(settings, targets, early))).toStrictEqual([]);
});

test("evaluate は戻ったときの報酬の頭打ちと低下、不在を罰する違反を局面ごとに挙げる", () => {
  const violating: Measurement = {
    ...passing,
    idles: [{ ...idle(0, 60), returns: [2, 1], violations: ["資源が減る"] }, idle(50, 600)],
  };
  expect(problemsOf(evaluate(settings, targets, violating))).toStrictEqual([
    [
      "戻ったときの報酬が頭打ちにならない（5・50 秒のうち最も長く離れたときが最も伸びる）",
      ["efficiency、局面 0 秒: 50 秒離れて戻っても、5 秒のときより伸びない"],
    ],
    [
      "放置で資源と生産量が失われず、一度に進めても刻んで進めても同じ",
      ["efficiency、局面 0 秒: 資源が減る"],
    ],
    [
      "長く離れたほうが短く離れたとき以上の状態で戻れる",
      ["efficiency、局面 0 秒: 50 秒離れて戻ると、5 秒離れたときより生産量が低い"],
    ],
  ]);
});

test("stepGuard は 2 つの刻み幅の指標が相対誤差の範囲で一致すれば問題なしにする", () => {
  const close: Measurement = {
    ...passing,
    plays: [{ ...play, purchaseMedian: 10 * (1 + GUARD_TOLERANCE) }],
  };
  const guard = stepGuard([60, 420], passing, close);
  expect(guard).toStrictEqual({
    kind: "刻み幅",
    name: "刻み幅 60 秒と 420 秒で指標が相対誤差 0.001 の範囲で一致する",
    bots: ["efficiency@always", "efficiency@60s", "efficiency@600s"],
    problems: [],
  });
});

test("stepGuard は有限でない値（undefined、NaN、Infinity）を同じ値どうしだけ一致とみなす", () => {
  const special: Measurement = {
    ...passing,
    plays: [{ ...play, milestones: [undefined, Number.POSITIVE_INFINITY], noveltyGap: Number.NaN }],
  };
  expect(stepGuard([60, 420], special, special).problems).toStrictEqual([]);
  const finite: Measurement = { ...passing, plays: [{ ...play, milestones: [undefined, 1e300] }] };
  const negative: Measurement = {
    ...passing,
    plays: [{ ...play, milestones: [undefined, Number.NEGATIVE_INFINITY] }],
  };
  // 差も許容誤差も Infinity になる組を一致とみなさない。
  expect(stepGuard([60, 420], special, finite).problems).toHaveLength(3);
  expect(stepGuard([60, 420], special, negative).problems).toHaveLength(3);
});

const LIMITATION =
  "シミュレーターの結果は、購入なしに生産量や資源が変わるゲーム（自動購入、時間で伸びる生産量、時限で切れる効果など）では刻み幅に左右されうる（既知の制限。src/sim/simulate.ts の Settings.step の説明と、.axon の未判断の Issue「シミュレーターの結果が、購入なしに生産量や資源が変わるゲームでは刻み幅に左右される」）。指標を目標値と比べる前に、この制限への対処を決める。";

test("stepGuard は違う指標を、刻み幅の制限の説明に続けて名前と 2 つの値で挙げる", () => {
  const moved: Measurement = {
    plays: [
      {
        ...play,
        milestones: [11, undefined],
        speeds: [1, 0.6],
        purchaseMedian: 10 * (1 + 2 * GUARD_TOLERANCE),
        purchaseLongest: 31,
        perDay: 3,
        noveltyGap: 61,
        wall: 21,
      },
    ],
    choices: [{ bots: ["efficiency@always", "cheapest@always"], lead: 0.2 }],
    idles: [{ ...idle(0, 60), efficiency: [1, 0.9], returns: [1, 3] }, idle(50, 600)],
  };
  expect(stepGuard([60, 420], passing, moved).problems).toStrictEqual([
    LIMITATION,
    "efficiency@always の節目 0 の時刻: 10 と 11",
    "efficiency@always の節目 1 の時刻: 40 と undefined",
    "efficiency@always の区間 1 の成長速度: 0.5 と 0.6",
    `efficiency@always の購入の間隔の中央値: 10 と ${10 * (1 + 2 * GUARD_TOLERANCE)}`,
    "efficiency@always の購入の間隔の最長: 30 と 31",
    "efficiency@always の新要素の数: 2 と 3",
    "efficiency@always の新要素の空白の最長: 60 と 61",
    "efficiency@always の壁の最長: 20 と 21",
    "efficiency@always と cheapest@always の選択の重み: 0.1 と 0.2",
    "efficiency、局面 0 秒の間隔 1 の効率: 0.995 と 0.9",
    "efficiency、局面 0 秒の戻った後 1: 2 と 3",
  ]);
});

const withLead = (lead: number): Measurement => ({
  ...passing,
  choices: [{ bots: ["efficiency@always", "cheapest@always"], lead }],
});

test("stepGuard は相対誤差を絶対値の大きいほうに対して測り、ちょうど相対誤差の差を一致とみなす", () => {
  // 差 1 は 1000 の相対 0.001 ちょうど（999 に対しては超える）。
  expect(stepGuard([60, 420], withLead(999), withLead(1000)).problems).toStrictEqual([]);
  expect(stepGuard([60, 420], withLead(1000), withLead(999)).problems).toStrictEqual([]);
});

test("stepGuard は負の値も絶対値で相対誤差を測る", () => {
  expect(
    stepGuard([60, 420], withLead(-1), withLead(-1 - GUARD_TOLERANCE / 2)).problems,
  ).toStrictEqual([]);
  expect(
    stepGuard([60, 420], withLead(-1), withLead(-1 - 2 * GUARD_TOLERANCE)).problems,
  ).toHaveLength(2);
});

test("stepGuard は測った指標の数が違うことを挙げる", () => {
  const fewer: Measurement = { ...passing, idles: [idle(0, 60)] };
  expect(stepGuard([60, 420], passing, fewer).problems).toStrictEqual([
    LIMITATION,
    "測った指標の数が違う",
  ]);
});
