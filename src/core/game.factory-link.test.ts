import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  FACTORY_LINK_UNLOCK_EARNED,
  advance,
  factoryLinkCost,
  factoryProduction,
  initialState,
  isFactoryLinkUnlocked,
  perform,
  priceOf,
  production,
  withPurchase,
} from "./game.ts";
import { mul, num, toNumber } from "./num.ts";

// 交易所より後に解放される工場の連携の値段、生産への効き方、解放の条件と、自動購入がそれを買う規則。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { factoryLinks: 0, expected: 3.6e7 },
  { factoryLinks: 1, expected: 2.88e8 },
  { factoryLinks: 3, expected: 3.6e7 * 8 ** 3 },
] as const)("工場の連携の値段は 3.6e7 × 8^数（$factoryLinks）", ({ factoryLinks, expected }) => {
  expect(factoryLinkCost(state({ factoryLinks }))).toBeApprox(num(expected));
});

test.each([
  { factories: 5, factoryLinks: 0, expected: 10 },
  { factories: 5, factoryLinks: 1, expected: 10.5 },
  { factories: 50, factoryLinks: 2, expected: 20 },
  { factories: 0, factoryLinks: 3, expected: 10 },
] as const)(
  "工場 1 台の、改良の倍率を掛ける前の毎秒の生産は 10 × (1 + 0.01 × 連携の数 × 工場の台数)（工場 $factories、連携 $factoryLinks）",
  ({ factories, factoryLinks, expected }) => {
    expect(factoryProduction(state({ factories, factoryLinks, upgrades: 3 }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { collectors: 3, factories: 2, factoryLinks: 0, upgrades: 0, expected: 23 },
  { collectors: 3, factories: 2, factoryLinks: 1, upgrades: 0, expected: 3 + 2 * 10.2 },
  { collectors: 3, factories: 50, factoryLinks: 2, upgrades: 0, expected: 3 + 50 * 20 },
  { collectors: 3, factories: 50, factoryLinks: 2, upgrades: 2, expected: 1003 * 1.25 ** 2 },
  { collectors: 3, factories: 0, factoryLinks: 2, upgrades: 0, expected: 3 },
] as const)(
  "工場の連携は工場の生産だけを増やし、その上に改良の倍率が掛かる（採集機 $collectors、工場 $factories、連携 $factoryLinks、改良 $upgrades）",
  ({ collectors, factories, factoryLinks, upgrades, expected }) => {
    expect(production(state({ collectors, factories, factoryLinks, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { factoryLinks: 2, expected: [62, 51] },
  { factoryLinks: 0, expected: [73, 50] },
] as const)(
  "自動購入は、工場の連携を持てば、工場の増分に、足した 1 台が持っている工場それぞれに足す生産を含めて採集機と比べる（連携 $factoryLinks）",
  ({ factoryLinks, expected }) => {
    // 工場 51 台目は 150 × 1.2^50 ≈ 1.37e6 で、連携 2 つなら増分 10 × (1 + 0.02 × 101) = 30.2（値段あたり約 2.2e-5）、
    // 連携が無ければ 10（約 7.3e-6）。採集機 63 台目は 10 × 1.15^62 ≈ 5.80e4 で増分 1（約 1.7e-5）。1.42e6 コインでは、
    // 工場を先に買うと採集機に届かず、採集機を先に買うと工場に届かないので、連携が無ければ採集機を買えるだけ買う。
    const start = state({
      coins: num(1.42e6),
      totalEarned: num(1.42e6),
      collectors: 62,
      factories: 50,
      factoryLinks,
      autoBuyer: true,
    });
    const after = advance(start, 0);

    expect([after.collectors, after.factories]).toStrictEqual(expected);
  },
);

test("工場の連携は累計の生産量が解放の条件に達するまで解放されず、達すると解放される", () => {
  const below = state({ totalEarned: mul(FACTORY_LINK_UNLOCK_EARNED, num(0.9999)) });

  expect(isFactoryLinkUnlocked(below)).toBe(false);
  expect(isFactoryLinkUnlocked({ ...below, totalEarned: FACTORY_LINK_UNLOCK_EARNED })).toBe(true);
});

test("工場の連携は解放の前は値段が無く買えず、解放の後は値段を払って買える", () => {
  const locked = state({
    coins: num(5e7),
    totalEarned: mul(FACTORY_LINK_UNLOCK_EARNED, num(0.9999)),
  });
  const unlocked = { ...locked, totalEarned: FACTORY_LINK_UNLOCK_EARNED };

  expect(priceOf(locked, { type: "buyFactoryLink" })).toBeUndefined();
  expect(perform(locked, { type: "buyFactoryLink" })).toBeUndefined();
  expect(priceOf(unlocked, { type: "buyFactoryLink" })).toBeApprox(num(3.6e7));
  expect(withPurchase(unlocked, { type: "buyFactoryLink" })).toStrictEqual({
    ...unlocked,
    factoryLinks: 1,
  });
  const after = perform(unlocked, { type: "buyFactoryLink" });
  expect(after?.factoryLinks).toBe(1);
  expect(after?.coins).toBeApprox(num(1.4e7));
});

/**
 * 工場 80 台（次は約 3.2e8）、造幣所 30 台（約 1.7e8）、精錬所 30 台（約 3.0e8）、交易所 20 台（約 1.3e8）、改良 12 個
 * （約 1.5e8）、採集機の改修 3 つ（約 2.6e9）、採集機 200 台（約 1.4e13）。工場の連携（3.6e7）のほかは、テストの間に
 * 値段に届かない。工場の連携を 1 つ買うと、工場 80 台の生産がそれぞれ 8 割増える。
 */
const trial = (short: number, automation: Partial<GameState>): GameState =>
  state({
    totalEarned: num(toNumber(FACTORY_LINK_UNLOCK_EARNED) - short),
    collectors: 200,
    factories: 80,
    mints: 30,
    refineries: 30,
    exchanges: 20,
    upgrades: 12,
    collectorUpgrades: 3,
    ...automation,
  });

test("自動購入は、工場の連携の値段に届いても、累計の生産量が解放の条件に届くまで買わず、届いた時刻に買う", () => {
  const start = trial(1e8, { autoBuyer: true });
  const rate = toNumber(production(start));
  const rateAfter = toNumber(production({ ...start, factoryLinks: 1 }));
  // コインは 3.6e7 / 毎秒の生産で値段に届くが、累計の生産量は 1e8 / 毎秒の生産で解放の条件に届く。
  const unlockedAt = 1e8 / rate;

  expect(advance(start, unlockedAt - 5).factoryLinks).toBe(0);
  const after = advance(start, unlockedAt + 5);
  expect(after.factoryLinks).toBe(1);
  // 解放の時刻のコイン 1e8 から 3.6e7 を払う。
  expect(after.coins).toBeApprox(num(6.4e7 + 5 * rateAfter), 1e-6);
});

test("工場の連携の解放の前後で区切っても、一度に進めたときと同じ時刻に工場の連携を買う", () => {
  const start = trial(1e8, { autoBuyer: true });
  const unlockedAt = 1e8 / toNumber(production(start));
  const once = advance(start, unlockedAt + 60);
  const split = advance(advance(start, unlockedAt - 60), 120);

  expect(split.factoryLinks).toBe(1);
  expect(split.factoryLinks).toBe(once.factoryLinks);
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

test("控えめな自動購入は、払った後も 600 秒分のコインが残るときに工場の連携を買う", () => {
  const start = trial(0, { cautiousAutoBuyer: true });
  const rate = toNumber(production(start));
  const rateAfter = toNumber(production({ ...start, factoryLinks: 1 }));
  const reachedAt = (3.6e7 + 600 * rate) / rate;

  expect(advance(start, reachedAt - 5).factoryLinks).toBe(0);
  const after = advance(start, reachedAt + 5);
  expect(after.factoryLinks).toBe(1);
  expect(after.coins).toBeApprox(num(600 * rate + 5 * rateAfter), 1e-6);
});

test("自動購入は、工場の連携の増分を、持っている工場それぞれが増える分で見積もり、交易所より先に買う", () => {
  // 工場の連携は 3.6e7 で増分 10 × 0.01 × 80 × 80 = 640（値段あたり約 1.8e-5）、交易所 21 台目は 4e7 × 1.06^20 ≈ 1.28e8
  // で増分 300（約 2.3e-6）。1.3e8 コインで工場の連携を買うと、残りの 9.4e7 では交易所に届かない。
  const after = advance(trial(0, { coins: num(1.3e8), autoBuyer: true }), 0);

  expect([after.factoryLinks, after.exchanges]).toStrictEqual([1, 20]);
  expect(after.coins).toBeApprox(num(9.4e7));
});
