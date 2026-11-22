import { expect, test } from "vitest";

import type { Num } from "../core/num.ts";
import { ZERO, add, atLeast, log10, mul, num, sub } from "../core/num.ts";
import {
  efficiencies,
  idleViolations,
  phaseStart,
  produced,
  returnDrops,
  returnLevels,
  returnStalls,
  tolerance,
} from "./idle.ts";
import type { Model } from "./model.ts";
import type { Run } from "./simulate.ts";

/**
 * 手で追える小さなゲーム。毎秒 1 + 台数 のコインを生む。生成器は `prices` の順の値段で、それぞれ 1 台だけ買える。
 * `advance` は `change` で差し替えられる（不変条件を破る版を作るため）。
 */
interface Toy {
  readonly coins: Num;
  readonly gens: number;
}

const rateOf = (state: Toy): Num => num(1 + state.gens);

const toy = (
  prices: readonly number[],
  change: (state: Toy, seconds: number) => Toy = (state, seconds) => ({
    ...state,
    coins: add(state.coins, mul(rateOf(state), num(seconds))),
  }),
): Model<Toy> => {
  const price = (state: Toy): number | undefined => prices[state.gens];
  return {
    initial: { coins: ZERO, gens: 0 },
    advance: change,
    offers: (state) => {
      const cost = price(state);
      return cost === undefined ? [] : [{ id: "gen", cost: num(cost), rateGain: num(1) }];
    },
    buy: (state, id) => {
      const cost = price(state);
      return id !== "gen" || cost === undefined || !atLeast(state.coins, num(cost), 0)
        ? undefined
        : { coins: sub(state.coins, num(cost)), gens: state.gens + 1 };
    },
    resource: (state) => state.coins,
    rate: rateOf,
    unlocked: () => ["gen"],
  };
};

const timing = { step: 60, sampleEvery: 600, seed: 1 };

const produce = (state: Toy, seconds: number): Num =>
  add(state.coins, mul(rateOf(state), num(seconds)));

/** 手元のコインが 10 を超えると生成器を失う。 */
const losing = toy([], (state, seconds) => {
  const coins = produce(state, seconds);
  return { coins, gens: atLeast(num(10), coins) ? state.gens : 0 };
});

/** 一度に 10 秒以上進めたときだけ生成器が増える。 */
const jumpy = toy([], (state, seconds) => ({
  coins: produce(state, seconds),
  gens: state.gens + Math.floor(Math.min(seconds, 10) / 10),
}));

test("phaseStart は時刻 0 なら最初の状態を、それ以外は常に開いているボットがその時刻まで遊んだ状態を返す", () => {
  const game = toy([10, 40]);
  expect(phaseStart(game, "efficiency", 0, timing)).toBe(game.initial);
  // 10 秒で 1 台目を買い、残り 5 秒で 2 × 5 = 10 コイン。
  expect(phaseStart(game, "efficiency", 15, timing)).toStrictEqual({ coins: num(10), gens: 1 });
});

test("produced は記録の生産量が次の記録まで続いたとみなし、終わりの時刻までの生産を足す", () => {
  const run: Run<Toy> = {
    bot: { purchase: "efficiency", checkIn: { kind: "always" }, prestige: "never" },
    settings: { duration: 30, step: 1, sampleEvery: 10, seed: 1 },
    timeline: [
      { kind: "sample", t: 0, resource: ZERO, rate: num(1) },
      { kind: "purchase", id: "gen", t: 10, resource: ZERO, rate: num(2) },
      { kind: "sample", t: 20, resource: ZERO, rate: num(3) },
    ],
    final: { coins: ZERO, gens: 0 },
  };
  expect(produced(run)).toBeApprox(num(1 * 10 + 2 * 10 + 3 * 10));
});

test("efficiencies は間隔ごとに、常に開いているボットに対する生産の割合を返す", () => {
  // 常に開いていると 10 秒で買い、30 秒で 10 + 2 × 20 = 50。20 秒ごとなら 20 秒で買い 20 + 2 × 10 = 40。
  // 60 秒ごとなら時刻 0 にしか開かず 30。
  const game = toy([10]);
  const [every20, every60] = efficiencies(
    game,
    game.initial,
    "efficiency",
    [20, 60],
    { window: 30, cycles: 0.5 },
    timing,
  );
  expect(every20).toBeCloseTo(40 / 50, 12);
  expect(every60).toBeCloseTo(30 / 50, 12);
});

test("efficiencies は、間隔の cycles 倍が window より長い間隔を、その長さで測る", () => {
  // 20 秒ごとは window の 30 秒（20 × 1.5）で 40 / 50。60 秒ごとは 90 秒で測る: 常に開いていると 10 + 2 × 80 = 170、
  // 60 秒ごとなら 60 秒で買い 60 + 2 × 30 = 120。
  const game = toy([10]);
  const [every20, every60] = efficiencies(
    game,
    game.initial,
    "efficiency",
    [20, 60],
    { window: 30, cycles: 1.5 },
    timing,
  );
  expect(every20).toBeCloseTo(40 / 50, 12);
  expect(every60).toBeCloseTo(120 / 170, 12);
});

test("efficiencies は渡した状態から遊ばせる", () => {
  const game = toy([10]);
  const start = { coins: num(10), gens: 0 };
  // どちらも時刻 0 に買い、差が出ない。
  expect(
    efficiencies(game, start, "efficiency", [60], { window: 30, cycles: 0.5 }, timing),
  ).toStrictEqual([1]);
});

test.each([
  { efficiency: [1, 0.99, 0.95], threshold: 0.99, expected: 600 },
  { efficiency: [1, 1, 1], threshold: 0.99, expected: 3600 },
  { efficiency: [0.98, 1, 1], threshold: 0.99, expected: 0 },
  { efficiency: [1, 0.9, 1], threshold: 0.99, expected: 60 },
  { efficiency: [1, Number.NaN, 1], threshold: 0.99, expected: 60 },
] as const)(
  "tolerance は、それ以下の間隔すべてが threshold 以上の最大の間隔（$efficiency → $expected）",
  ({ efficiency, threshold, expected }) => {
    expect(tolerance([60, 600, 3600], efficiency, threshold)).toBe(expected);
  },
);

test("returnLevels は離れた後に買えるだけ買った生産量の常用対数を返す", () => {
  // 値段 10 と 15。5 秒では買えず、10 秒で 1 台、25 秒で 2 台（10 + 15）。
  const game = toy([10, 15]);
  expect(returnLevels(game, game.initial, "efficiency", [5, 10, 25, 100], timing)).toStrictEqual([
    0,
    log10(num(2)),
    log10(num(3)),
    log10(num(3)),
  ]);
});

test("returnLevels は渡した状態から離れる", () => {
  const game = toy([10, 15]);
  expect(
    returnLevels(game, { coins: num(10), gens: 0 }, "efficiency", [0.5], timing),
  ).toStrictEqual([log10(num(2))]);
});

test("idleViolations は、不在を罰しないゲームでは空", () => {
  const game = toy([10, 40, 160]);
  expect(idleViolations(game, game.initial, [5, 60, 600])).toStrictEqual([]);
});

test("idleViolations は、生産量が同じなのに資源が生産した分より少ないことを、離れた時間の組ごとに挙げる", () => {
  // 手元のコインが毎秒 1% 減る。
  const decay = toy([], (state, seconds) => ({
    ...state,
    coins: add(mul(state.coins, num(0.99 ** seconds)), num(seconds)),
  }));
  expect(idleViolations(decay, { coins: num(100), gens: 0 }, [10, 20])).toStrictEqual([
    "0 秒から 10 秒離れると、生産量が同じなのに資源が生産した分より少ない",
    "10 秒から 20 秒離れると、生産量が同じなのに資源が生産した分より少ない",
    "10 秒を一度に進めた結果と 7 回に分けて進めた結果が違う",
    "20 秒を一度に進めた結果と 7 回に分けて進めた結果が違う",
  ]);
});

test("idleViolations は、資源が生産した分ちょうどなら違反にしない", () => {
  const game = toy([]);
  expect(idleViolations(game, { coins: num(5), gens: 0 }, [10])).toStrictEqual([]);
});

test("idleViolations は、長く離れると生産量が下がることを挙げる", () => {
  expect(idleViolations(losing, { coins: ZERO, gens: 1 }, [5, 20])).toStrictEqual([
    "5 秒から 20 秒離れると生産量が下がる",
    // 刻んで進めると、失った後の生産が少ない。
    "20 秒を一度に進めた結果と 7 回に分けて進めた結果が違う",
  ]);
});

test("idleViolations は、一度に進めた結果と刻んで進めた結果の生産量が違うことを挙げる", () => {
  expect(idleViolations(jumpy, jumpy.initial, [20])).toContain(
    "20 秒を一度に進めた結果と 7 回に分けて進めた結果が違う",
  );
});

test("idleViolations は、刻んで進めた結果の資源の違いを、離れた間の生産量の目安に比べて小さければ許す", () => {
  // 刻むたびに 1e-9 だけ資源が増える。目安 100 × 1 に比べて相対 1e-6 より小さい。
  const tiny = toy([], (state, seconds) => ({
    ...state,
    coins: add(state.coins, num(seconds + 1e-9)),
  }));
  expect(idleViolations(tiny, tiny.initial, [100])).toStrictEqual([]);
  // 刻むたびに 1 増えると、目安に比べて大きい。
  const coarse = toy([], (state, seconds) => ({
    ...state,
    coins: add(state.coins, num(seconds + 1)),
  }));
  expect(idleViolations(coarse, coarse.initial, [100])).toStrictEqual([
    "100 秒を一度に進めた結果と 7 回に分けて進めた結果が違う",
  ]);
});

test("returnDrops は、長く離れたほうが戻った後の生産量が低い組を挙げ、許容誤差の範囲の差は許す", () => {
  expect(returnDrops([10, 20, 30], [1, 0.5, 0.5 - 1e-7])).toStrictEqual([
    "20 秒離れて戻ると、10 秒離れたときより生産量が低い",
  ]);
  expect(returnDrops([10, 20], [1, 1])).toStrictEqual([]);
  expect(returnDrops([10, 20], [1, 1 - 1e-6])).toStrictEqual([]);
});

test("returnStalls は、最も長く離れたときがほかのどの時間より多く伸びなければ挙げる", () => {
  expect(returnStalls([10, 20, 30], [1, 1, 2])).toStrictEqual([]);
  expect(returnStalls([10, 20, 30], [1, 2, 2])).toStrictEqual([
    "30 秒離れて戻っても、20 秒のときより伸びない",
  ]);
  expect(returnStalls([10, 20, 30], [3, 2, 2])).toStrictEqual([
    "30 秒離れて戻っても、10 秒のときより伸びない",
    "30 秒離れて戻っても、20 秒のときより伸びない",
  ]);
  expect(returnStalls([], [])).toStrictEqual([]);
});
