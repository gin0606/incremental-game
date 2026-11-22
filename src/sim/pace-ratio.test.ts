import { expect, test } from "vitest";

import type { Num } from "../core/num.ts";
import { ZERO, add, atLeast, mul, num, sub } from "../core/num.ts";
import type { Model } from "./model.ts";
import { evaluate, stepGuard } from "./pace-check.ts";
import type { Measurement, PlayMeasure } from "./pace.ts";
import { measure } from "./pace.ts";
import type { Settings, Targets } from "./pace-targets.ts";
import type { Trial } from "./sets.ts";
import { TargetsError, parseTargets } from "./pace-targets.ts";

// 2 つの時刻の毎秒の生産量の比の下限（目標値の `growth.rateRatios`）の読み込み、測定、帯との比較。

const settings: Settings = {
  duration: 100,
  step: 10,
  sampleEvery: 10,
  reasonable: ["efficiency"],
  growth: { bounds: [0, 100] },
  walls: { window: 50, below: 0 },
  choice: { best: "efficiency", restricted: ["cheapest"] },
  idle: { phases: [0, 50], window: 50, cycles: 1, away: [5, 50] },
};

const targets: Targets = {
  milestones: { levels: [0, 0.1], ratio: { min: 0 } },
  growth: {
    speed: { min: 0 },
    change: { min: 0 },
    rateRatios: [
      { from: 0, to: 100, min: 10 },
      { from: 20, to: 100, min: 1.5 },
    ],
  },
  purchases: { median: { min: 0 }, longest: { min: 0 } },
  novelty: { perDay: { min: 0 }, longestGap: { min: 0 } },
  walls: { longest: { min: 0 } },
  choice: { lead: { min: 0 } },
  idle: { efficiency: 0.99, reach: [{ by: 0, tolerance: 1 }] },
};

test("parseTargets は毎秒の生産量の比の下限をそのまま返す", () => {
  expect(parseTargets(targets, settings)).toStrictEqual(targets);
});

const withRatios = (value: unknown): unknown => ({
  ...targets,
  growth: { ...targets.growth, rateRatios: value },
});

test.each([
  { value: [], message: "targets.growth.rateRatios: 空でない配列で書く" },
  { value: { from: 0, to: 1, min: 1 }, message: "targets.growth.rateRatios: 空でない配列で書く" },
  { value: [1], message: "targets.growth.rateRatios[0]: オブジェクトで書く" },
  {
    value: [{ from: 0, to: 1, min: 1, max: 2 }],
    message: "targets.growth.rateRatios[0].max: 知らない項目",
  },
  { value: [{ to: 1, min: 1 }], message: "targets.growth.rateRatios[0].from: 有限の数で書く" },
  { value: [{ from: 0, min: 1 }], message: "targets.growth.rateRatios[0].to: 有限の数で書く" },
  {
    value: [{ from: 0, to: 1, min: 0 }],
    message: "targets.growth.rateRatios[0].min: 正の数で書く",
  },
  {
    value: [{ from: -1, to: 1, min: 1 }],
    message: "targets.growth.rateRatios[0].from: 0 以上にする",
  },
  {
    value: [{ from: 50, to: 50, min: 1 }],
    message: "targets.growth.rateRatios[0].to: from より後の時刻にする",
  },
  {
    value: [
      { from: 0, to: 100, min: 1 },
      { from: 0, to: 101, min: 1 },
    ],
    message: "targets.growth.rateRatios[1].to: 測り方の遊ぶ時間（settings.duration）以下にする",
  },
] as const)("parseTargets は $message で失敗する", ({ value, message }) => {
  const parse = (): unknown => parseTargets(withRatios(value), settings);
  expect(parse).toThrow(TargetsError);
  expect(parse).toThrow(message);
});

/** 毎秒 5 + 45 × 台数 のコインを生む。生成器は値段 10 の 1 台だけ。 */
interface Toy {
  readonly coins: Num;
  readonly gens: number;
}

const rateOf = (state: Toy): Num => num(5 + 45 * state.gens);

const offersOf = (
  state: Toy,
): { readonly id: string; readonly cost: Num; readonly rateGain: Num }[] =>
  state.gens === 0 ? [{ id: "gen", cost: num(10), rateGain: num(45) }] : [];

const toy: Model<Toy> = {
  initial: { coins: ZERO, gens: 0 },
  advance: (state, seconds) => ({
    ...state,
    coins: add(state.coins, mul(rateOf(state), num(seconds))),
  }),
  offers: offersOf,
  buy: (state, id) =>
    id === "gen" && state.gens === 0 && atLeast(state.coins, num(10), 0)
      ? { coins: sub(state.coins, num(10)), gens: 1 }
      : undefined,
  resource: (state) => state.coins,
  rate: rateOf,
  unlocked: () => ["gen"],
};

const alwaysOpen: readonly Trial[] = [
  { bot: { purchase: "efficiency", checkIn: { kind: "always" }, prestige: "never" }, seed: 1 },
];

test("measure は妥当なボットごとに、目標値の時刻の組の毎秒の生産量の比を測る", () => {
  const { plays } = measure(toy, settings, targets, alwaysOpen, 10);
  // 時刻 2 に買い、生産量が 5 から 50 になる。時刻 20 と 100 はどちらも 50。
  expect(plays.map((play) => play.rateRatios)).toStrictEqual([[10, 1]]);
});

test("measure は目標値に比の下限が無ければ比を測らない", () => {
  const { growth } = targets;
  const without = { ...targets, growth: { speed: growth.speed, change: growth.change } };
  const { plays } = measure(toy, settings, without, alwaysOpen, 10);
  expect(plays.map((play) => play.rateRatios)).toStrictEqual([[]]);
});

const play = (bot: string, rateRatios: readonly number[]): PlayMeasure => ({
  bot,
  milestones: [10, 20],
  ratios: [2],
  speeds: [1],
  changes: [],
  rateRatios,
  purchaseMedian: 10,
  purchaseLongest: 10,
  perDay: 1,
  noveltyGap: 10,
  wall: 0,
});

const measurement = (plays: readonly PlayMeasure[]): Measurement => ({
  plays,
  choices: [],
  idles: [],
});

/** 比の項目の名前と問題。 */
const problemsOf = (measured: Measurement): readonly (readonly [string, readonly string[]])[] =>
  evaluate(settings, targets, measured)
    .filter((check) => check.name.includes("毎秒の生産量"))
    .map((check) => [check.name, check.problems] as const);

const ratioProblems = (
  plays: readonly PlayMeasure[],
): readonly (readonly [string, readonly string[]])[] => problemsOf(measurement(plays));

test("measure で測った比を evaluate が比べ、下限ちょうどなら通し、下回れば問題にする", () => {
  // 50 / 5 は下限 10 ちょうど。50 / 50 は下限 1.5 を下回る。
  expect(problemsOf(measure(toy, settings, targets, alwaysOpen, 10))).toStrictEqual([
    ["100 秒の毎秒の生産量が 0 秒の何倍か（10〜∞）", []],
    ["100 秒の毎秒の生産量が 20 秒の何倍か（1.5〜∞）", ["efficiency@always: 1"]],
  ]);
});

test("evaluate は比の下限ごとに、妥当なボットのどれか 1 つでも下回れば問題にする", () => {
  // 下限の値ちょうどは通す。
  expect(
    ratioProblems([play("efficiency@always", [10, 1.5]), play("roi@always", [11, 2])]),
  ).toStrictEqual([
    ["100 秒の毎秒の生産量が 0 秒の何倍か（10〜∞）", []],
    ["100 秒の毎秒の生産量が 20 秒の何倍か（1.5〜∞）", []],
  ]);
  expect(
    ratioProblems([play("efficiency@always", [10, 1.49]), play("roi@always", [9.9, Number.NaN])]),
  ).toStrictEqual([
    ["100 秒の毎秒の生産量が 0 秒の何倍か（10〜∞）", ["roi@always: 9.9"]],
    [
      "100 秒の毎秒の生産量が 20 秒の何倍か（1.5〜∞）",
      ["efficiency@always: 1.49", "roi@always: NaN"],
    ],
  ]);
});

test("evaluate は測った比が足りないボットと、測るボットが無いことを問題にする", () => {
  expect(ratioProblems([play("efficiency@always", [10])])).toStrictEqual([
    ["100 秒の毎秒の生産量が 0 秒の何倍か（10〜∞）", []],
    ["100 秒の毎秒の生産量が 20 秒の何倍か（1.5〜∞）", ["efficiency@always: undefined"]],
  ]);
  expect(ratioProblems([])).toStrictEqual([
    ["100 秒の毎秒の生産量が 0 秒の何倍か（10〜∞）", ["測るボットが組に無い"]],
    ["100 秒の毎秒の生産量が 20 秒の何倍か（1.5〜∞）", ["測るボットが組に無い"]],
  ]);
});

test("stepGuard は 2 つの刻み幅で測った毎秒の生産量の比を比べる", () => {
  const first = measurement([play("efficiency@always", [2, 1.5])]);
  const second = measurement([play("efficiency@always", [2, 1.6])]);
  expect(stepGuard([10, 70], first, first).problems).toStrictEqual([]);
  expect(stepGuard([10, 70], first, second).problems).toContain(
    "efficiency@always の毎秒の生産量の比 1: 1.5 と 1.6",
  );
});
