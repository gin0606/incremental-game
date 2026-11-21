import { expect, test } from "vitest";

import type { Num } from "../core/num.ts";
import { ZERO, add, atLeast, mul, num, sub } from "../core/num.ts";
import type { CheckIn, PurchaseRule } from "./bot.ts";
import type { Model } from "./model.ts";
import type { IdleMeasure } from "./pace.ts";
import { measure } from "./pace.ts";
import { checkPace } from "./pace-check.ts";
import type { Targets } from "./pace-targets.ts";
import type { Trial } from "./sets.ts";

/**
 * 手で追える小さなゲーム。毎秒 1 + 生成器の台数 + 0.1 × 小物の数 のコインを生む。生成器 gen は値段 10、30 の 2 台
 * だけ、小物 tiny は値段 5 の 1 つだけ買える。生成器を 1 台買うと more が解放される。
 */
interface Toy {
  readonly coins: Num;
  readonly gens: number;
  readonly tiny: boolean;
}

const GEN_PRICES: readonly number[] = [10, 30];

const rateOf = (state: Toy): Num => num(1 + state.gens + (state.tiny ? 0.1 : 0));

const offersOf = (
  state: Toy,
): { readonly id: string; readonly cost: Num; readonly rateGain: Num }[] => {
  const price = GEN_PRICES.at(state.gens);
  return [
    ...(price === undefined ? [] : [{ id: "gen", cost: num(price), rateGain: num(1) }]),
    ...(state.tiny ? [] : [{ id: "tiny", cost: num(5), rateGain: num(0.1) }]),
  ];
};

const toy: Model<Toy> = {
  initial: { coins: ZERO, gens: 0, tiny: false },
  advance: (state, seconds) => ({
    ...state,
    coins: add(state.coins, mul(rateOf(state), num(seconds))),
  }),
  offers: offersOf,
  buy: (state, id) => {
    const offer = offersOf(state).find((candidate) => candidate.id === id);
    const paid =
      offer === undefined || !atLeast(state.coins, offer.cost, 0)
        ? undefined
        : { ...state, coins: sub(state.coins, offer.cost) };
    return paid && (id === "gen" ? { ...paid, gens: paid.gens + 1 } : { ...paid, tiny: true });
  },
  resource: (state) => state.coins,
  rate: rateOf,
  unlocked: (state) => (state.gens >= 1 ? ["gen", "tiny", "more"] : ["gen", "tiny"]),
};

const targets: Targets = {
  duration: 100,
  step: 10,
  sampleEvery: 10,
  reasonable: ["efficiency"],
  milestones: { levels: [0.2, 0.4, 1], ratio: { min: 0 } },
  growth: { bounds: [0, 50, 100], speed: { min: 0 }, change: { min: 0 } },
  purchases: { median: { min: 0 }, longest: { min: 0 } },
  novelty: { perDay: { min: 0 }, longestGap: { min: 0 } },
  walls: { window: 50, below: 1, longest: { min: 0 } },
  choice: { best: "efficiency", restricted: ["cheapest"], lead: { min: 0 } },
  idle: { phases: [0, 50], window: 50, efficiency: 0.99, reachBy: 0, reach: 1, away: [5, 50] },
};

const trial = (purchase: PurchaseRule, checkIn: CheckIn, seed = 1): Trial => ({
  bot: { purchase, checkIn, prestige: "never" },
  seed,
});

const always: CheckIn = { kind: "always" };

test("measure は妥当な規則の常に開いているボットだけで、遊んだ結果の指標を測る", () => {
  // efficiency は 10 秒で gen（10）、25 秒で gen（30）、80 / 3 秒で tiny（5）を買う。
  const { plays } = measure(
    toy,
    targets,
    [
      trial("efficiency", always),
      trial("efficiency", { kind: "every", seconds: 20 }),
      trial("cheapest", always),
    ],
    10,
  );
  expect(plays.map((play) => play.bot)).toStrictEqual(["efficiency@always"]);
  const [play] = plays;
  expect(play?.milestones).toStrictEqual([10, 25, undefined]);
  expect(play?.ratios).toStrictEqual([2.5]);
  expect(play?.speeds[0]).toBeCloseTo(Math.log10(3.1) * 72, 10);
  expect(play?.speeds[1]).toBe(0);
  expect(play?.changes).toStrictEqual([0]);
  expect(play?.purchaseMedian).toBeCloseTo((15 + 5 / 3) / 2, 10);
  expect(play?.purchaseLongest).toBe(15);
  expect(play?.perDay).toBe(3 / (100 / 86_400));
  expect(play?.noveltyGap).toBe(90);
  // 30 秒から始まる区間（30〜80 秒）以降は伸びない。最後の区間は 50〜100 秒。
  expect(play?.wall).toBe(70);
});

test("measure は解放が無ければ、遊ぶ時間全体を新要素の空白にする", () => {
  const { plays } = measure(
    { ...toy, unlocked: () => [] },
    targets,
    [trial("efficiency", always)],
    10,
  );
  expect(plays[0]?.perDay).toBe(0);
  expect(plays[0]?.noveltyGap).toBe(100);
});

test("measure は購入が無ければ購入の間隔を測らない", () => {
  const { plays } = measure(
    { ...toy, initial: { coins: ZERO, gens: 2, tiny: true } },
    targets,
    [trial("efficiency", always)],
    10,
  );
  expect(plays[0]?.purchaseMedian).toBeUndefined();
  expect(plays[0]?.purchaseLongest).toBeUndefined();
});

test("measure は最良の規則と選び方を制限した規則の組ごとに、最良の規則が先行した最大の桁数を測る", () => {
  const { choices } = measure(
    toy,
    { ...targets, choice: { ...targets.choice, restricted: ["cheapest", "newest"] } },
    [trial("efficiency", always), trial("cheapest", always), trial("roi", always)],
    10,
  );
  expect(choices.map((each) => each.bots)).toStrictEqual([
    ["efficiency@always", "cheapest@always"],
  ]);
  // cheapest は 5 秒で tiny を先に買い、gen が遅れる。
  expect(choices[0]?.lead).toBeGreaterThan(0);
});

test("measure は最良の規則のボットが組に無ければ選択の重みを測らない", () => {
  const { choices } = measure(toy, targets, [trial("cheapest", always)], 10);
  expect(choices).toStrictEqual([]);
});

test("measure は妥当な規則ごとに、組の間隔（重なりを除いて昇順）で局面ごとの放置の指標を測る", () => {
  const { idles } = measure(
    toy,
    { ...targets, reasonable: ["efficiency", "roi"] },
    [
      trial("efficiency", { kind: "every", seconds: 60 }),
      trial("efficiency", { kind: "every", seconds: 20 }),
      trial("efficiency", { kind: "every", seconds: 60 }),
      trial("roi", always),
    ],
    10,
  );
  expect(idles.map((idle) => [idle.rule, idle.phase, idle.bots])).toStrictEqual([
    ["efficiency", 0, ["efficiency@always", "efficiency@20s", "efficiency@60s"]],
    ["efficiency", 50, ["efficiency@always", "efficiency@20s", "efficiency@60s"]],
  ]);
  const [first, second] = idles;
  // 時刻 0 から: 常に開いていると 50 秒で 10 + 2 × 15 + 3 × 5 / 3 + 3.1 × 70 / 3 = 352 / 3。20 秒ごとなら 20 秒で
  // gen、40 秒で gen と tiny を買い 20 + 2 × 20 + 3.1 × 10 = 91。60 秒ごとなら時刻 0 だけ開き 50。
  expect(first?.efficiency[0]).toBeCloseTo(91 / (352 / 3), 10);
  expect(first?.efficiency[1]).toBeCloseTo(50 / (352 / 3), 10);
  expect(first?.tolerance).toBe(0);
  // 5 秒離れても gen に届かず（狙う候補は gen）、50 秒なら gen 2 台と tiny を買える。
  expect(first?.returns[0]).toBe(0);
  expect(first?.returns[1]).toBeCloseTo(Math.log10(3.1), 10);
  expect(first?.violations).toStrictEqual([]);
  // 時刻 50 にはすべて買い終えていて、差が出ない。
  expect(second?.efficiency).toStrictEqual([1, 1]);
  expect(second?.tolerance).toBe(60);
});

/** 生成器 2 台と小物をそろえると、手元のコインが毎秒 1% 減っていくようになる版（不在を罰する）。 */
const decaying: Model<Toy> = {
  ...toy,
  advance: (state, seconds) =>
    state.gens >= 2 && state.tiny
      ? {
          ...state,
          coins: add(mul(state.coins, num(0.99 ** seconds)), mul(rateOf(state), num(seconds))),
        }
      : toy.advance(state, seconds),
};

test("measure は局面の始まりの状態から、不在を罰しない不変条件の違反を測る", () => {
  const { idles } = measure(
    decaying,
    targets,
    [trial("efficiency", { kind: "every", seconds: 20 })],
    10,
  );
  // 時刻 0 の状態からは、離れても 50 秒ではそろわず減らない。時刻 50 にはそろっている。
  expect(idles[0]?.violations).toStrictEqual([]);
  expect(idles[1]?.violations).toContain(
    "5 秒から 50 秒離れると、生産量が同じなのに資源が生産した分より少ない",
  );
});

const randomEvery20 = (seed: number): Trial =>
  trial("random", { kind: "every", seconds: 20 }, seed);

/** random の規則を `seeds` の順に遊ばせる組で、時刻 7 の局面の始まりからの放置の指標。 */
const randomIdles = (seeds: readonly number[]): readonly IdleMeasure[] =>
  measure(
    toy,
    { ...targets, reasonable: ["random"], idle: { ...targets.idle, phases: [7] } },
    seeds.map((seed) => randomEvery20(seed)),
    10,
  ).idles;

test("measure は放置の指標に、組でその規則を最初に遊ばせるボットのシードを使う", () => {
  // 常に開いている random のボットが時刻 7 までに tiny を買っているか（5 秒）はシードで変わる。
  // シード 1 は先に tiny を、シード 7 は先に gen を狙う。
  expect(randomIdles([1])).not.toStrictEqual(randomIdles([7]));
  expect(randomIdles([7, 1])).toStrictEqual(randomIdles([7]));
  expect(randomIdles([1, 7])).toStrictEqual(randomIdles([1]));
});

test("measure は every の予定のボットが組に無い規則の放置の指標を測らない", () => {
  expect(measure(toy, targets, [trial("efficiency", always)], 10).idles).toStrictEqual([]);
});

test("measure は渡した刻み幅で遊ばせる", () => {
  // 刻み幅が遊ぶ時間より短すぎると、シミュレーターが受け付けない。
  expect(() => measure(toy, targets, [trial("efficiency", always)], 1e-20)).toThrow(RangeError);
  expect(() =>
    measure(toy, targets, [trial("efficiency", { kind: "every", seconds: 20 })], 1e-20),
  ).toThrow(RangeError);
});

/** 生産量 1 で、何も買えないゲーム（候補が無い）。 */
const flat: Model<number> = {
  initial: 0,
  advance: (coins, seconds) => coins + seconds,
  offers: () => [],
  buy: (coins, id) => (id === "coin" ? undefined : coins),
  resource: (coins) => num(coins),
  rate: () => num(1),
  unlocked: () => ["coin"],
};

test("checkPace は目標値の刻み幅と、その GUARD_FACTOR 倍の刻み幅で測り、比較の結果に刻み幅の守りを足す", () => {
  const checks = checkPace(
    flat,
    { ...targets, growth: { ...targets.growth, speed: { min: 0.1 } } },
    [
      { bot: { purchase: "efficiency", checkIn: { kind: "always" }, prestige: "never" }, seed: 1 },
      {
        bot: { purchase: "efficiency", checkIn: { kind: "every", seconds: 60 }, prestige: "never" },
        seed: 1,
      },
    ],
  );
  // evaluate の 15 項目の後に刻み幅の守りが並ぶ。
  expect(checks).toHaveLength(16);
  expect(checks.at(-1)).toStrictEqual({
    kind: "刻み幅",
    name: "刻み幅 10 秒と 70 秒で指標が相対誤差 0.001 の範囲で一致する",
    bots: ["efficiency@always", "efficiency@60s"],
    problems: [],
  });
  // 生産量が伸びないため、成長速度の帯を外れる。
  expect(
    checks.find((check) => check.name.startsWith("区間ごとの対数成長速度"))?.problems,
  ).toStrictEqual(["efficiency@always: 0, 0"]);
});

test("checkPace は 2 つ目の測定を GUARD_FACTOR 倍の刻み幅で遊ばせる", () => {
  // 何も買えないゲームを、記録の間隔より長い刻み幅で遊ばせると、刻み幅ごとに進める。
  const advanced: number[] = [];
  const spy: Model<number> = {
    ...flat,
    advance: (coins, seconds) => {
      advanced.push(seconds);
      return flat.advance(coins, seconds);
    },
  };
  checkPace(spy, { ...targets, sampleEvery: 100 }, [trial("efficiency", always)]);
  expect(new Set(advanced)).toStrictEqual(new Set([10, 70, 30]));
});
