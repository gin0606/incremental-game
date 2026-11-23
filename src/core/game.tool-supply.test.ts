import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  TOOL_SUPPLY_UNLOCK_EARNED,
  advance,
  collectorProduction,
  initialState,
  isToolSupplyUnlocked,
  perform,
  priceOf,
  production,
  toolSupplyCost,
  withPurchase,
} from "./game.ts";
import { mul, num, toNumber } from "./num.ts";

// 改良と採集機の改修の間に解放される工具の支給の値段、生産への効き方、解放の条件と、自動購入がそれを買う規則。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { toolSupplies: 0, expected: 2.2e6 },
  { toolSupplies: 1, expected: 2.2e7 },
  { toolSupplies: 3, expected: 2.2e9 },
] as const)("工具の支給の値段は 2.2e6 × 10^数（$toolSupplies）", ({ toolSupplies, expected }) => {
  expect(toolSupplyCost(state({ toolSupplies }))).toBeApprox(num(expected));
});

test.each([
  { factories: 40, toolSupplies: 0, collectorUpgrades: 0, expected: 1 },
  { factories: 40, toolSupplies: 1, collectorUpgrades: 0, expected: 1.1 },
  { factories: 40, toolSupplies: 2, collectorUpgrades: 1, expected: 2 * 1.2 },
  { factories: 0, toolSupplies: 3, collectorUpgrades: 0, expected: 1 },
] as const)(
  "採集機 1 台の、改良の倍率を掛ける前の毎秒の生産は 2^改修の数 × (1 + 0.0025 × 支給の数 × 工場の台数)（工場 $factories、支給 $toolSupplies、改修 $collectorUpgrades）",
  ({ factories, toolSupplies, collectorUpgrades, expected }) => {
    expect(
      collectorProduction(state({ factories, toolSupplies, collectorUpgrades, upgrades: 3 })),
    ).toBeApprox(num(expected));
  },
);

test.each([
  { collectors: 10, factories: 40, toolSupplies: 0, upgrades: 0, expected: 410 },
  { collectors: 10, factories: 40, toolSupplies: 2, upgrades: 0, expected: 10 * 1.2 + 400 },
  { collectors: 10, factories: 40, toolSupplies: 2, upgrades: 1, expected: 412 * 1.25 },
  { collectors: 0, factories: 40, toolSupplies: 2, upgrades: 0, expected: 400 },
] as const)(
  "工具の支給は採集機の生産だけを増やし、その上に改良の倍率が掛かる（採集機 $collectors、工場 $factories、支給 $toolSupplies、改良 $upgrades）",
  ({ collectors, factories, toolSupplies, upgrades, expected }) => {
    expect(production(state({ collectors, factories, toolSupplies, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { toolSupplies: 1, expected: [58, 1] },
  { toolSupplies: 0, expected: [56, 2] },
] as const)(
  "自動購入は、工具の支給を持てば、工場の増分に、足した 1 台が採集機それぞれに足す生産を含めて造幣所と比べる（支給 $toolSupplies）",
  ({ toolSupplies, expected }) => {
    // 工場 57 台目は 150 × 1.2^56 ≈ 4.08e6 で、支給が無ければ増分 10（値段あたり約 2.45e-6）。採集機の改修 3 つで採集機
    // 1 台は毎秒 8 なので、支給 1 つなら採集機 200 台がそれぞれ 8 × 0.0025 = 0.02 増え、増分は 14（約 3.43e-6）。造幣所
    // 2 台目は 1.1e7 で増分 30（約 2.73e-6）。1.15e7 コインでは、造幣所を先に買うと工場に届かず、工場を先に買うと造幣所に
    // 届かない（残りで工場をもう 1 台買う）。採集機と採集機の改修は値段が高く、改良はまだ解放されていない。
    const start = state({
      coins: num(1.15e7),
      totalEarned: num(1.15e7),
      collectors: 200,
      factories: 56,
      mints: 1,
      collectorUpgrades: 3,
      toolSupplies,
      autoBuyer: true,
    });
    const after = advance(start, 0);

    expect([after.factories, after.mints]).toStrictEqual(expected);
  },
);

test("工具の支給は累計の生産量が 3.5e7 に達するまで解放されず、達すると解放される", () => {
  const below = state({ totalEarned: mul(TOOL_SUPPLY_UNLOCK_EARNED, num(0.9999)) });

  expect(TOOL_SUPPLY_UNLOCK_EARNED).toBeApprox(num(3.5e7));
  expect(isToolSupplyUnlocked(below)).toBe(false);
  expect(isToolSupplyUnlocked({ ...below, totalEarned: TOOL_SUPPLY_UNLOCK_EARNED })).toBe(true);
});

test("工具の支給は解放の前は値段が無く買えず、解放の後は値段を払って買える", () => {
  const locked = state({
    coins: num(3e6),
    totalEarned: mul(TOOL_SUPPLY_UNLOCK_EARNED, num(0.9999)),
  });
  const unlocked = { ...locked, totalEarned: TOOL_SUPPLY_UNLOCK_EARNED };

  expect(priceOf(locked, { type: "buyToolSupply" })).toBeUndefined();
  expect(perform(locked, { type: "buyToolSupply" })).toBeUndefined();
  expect(priceOf(unlocked, { type: "buyToolSupply" })).toBeApprox(num(2.2e6));
  expect(withPurchase(unlocked, { type: "buyToolSupply" })).toStrictEqual({
    ...unlocked,
    toolSupplies: 1,
  });
  const after = perform(unlocked, { type: "buyToolSupply" });
  expect(after?.toolSupplies).toBe(1);
  expect(after?.coins).toBeApprox(num(8e5));
});

/**
 * 採集機 89 台（次は約 2.52e6）、工場 53 台（約 2.36e6）、改良 3 つ（約 2.98e6）で、毎秒 619 × 1.25^3。工具の支給
 * （2.2e6）のほかは、テストの間に値段か解放の条件（採集機の改修は 7.5e7）に届かない。工具の支給を 1 つ買うと、採集機
 * 89 台の生産がそれぞれ 0.0025 × 53 = 13.25% 増える。
 */
const trial = (short: number, automation: Partial<GameState>): GameState =>
  state({
    totalEarned: num(toNumber(TOOL_SUPPLY_UNLOCK_EARNED) - short),
    collectors: 89,
    factories: 53,
    upgrades: 3,
    ...automation,
  });

test("自動購入は、工具の支給の値段に届いても、累計の生産量が解放の条件に届くまで買わず、届いた時刻に買う", () => {
  const start = trial(2.3e6, { autoBuyer: true });
  const rate = toNumber(production(start));
  const rateAfter = toNumber(production({ ...start, toolSupplies: 1 }));
  // コインは 2.2e6 / 毎秒の生産で値段に届くが、累計の生産量は 2.3e6 / 毎秒の生産で解放の条件に届く。
  const unlockedAt = 2.3e6 / rate;

  expect(advance(start, unlockedAt - 5).toolSupplies).toBe(0);
  const after = advance(start, unlockedAt + 5);
  expect(after.toolSupplies).toBe(1);
  // 解放の時刻のコイン 2.3e6 から 2.2e6 を払う。
  expect(after.coins).toBeApprox(num(1e5 + 5 * rateAfter), 1e-6);
});

test("工具の支給の解放の前後で区切っても、一度に進めたときと同じ時刻に工具の支給を買う", () => {
  const start = trial(2.3e6, { autoBuyer: true });
  const unlockedAt = 2.3e6 / toNumber(production(start));
  const once = advance(start, unlockedAt + 60);
  const split = advance(advance(start, unlockedAt - 60), 120);

  expect(split.toolSupplies).toBe(1);
  expect(split.toolSupplies).toBe(once.toolSupplies);
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

test("控えめな自動購入は、払った後も 600 秒分のコインが残るときに工具の支給を買う", () => {
  const start = trial(0, { cautiousAutoBuyer: true });
  const rate = toNumber(production(start));
  const rateAfter = toNumber(production({ ...start, toolSupplies: 1 }));
  const reachedAt = (2.2e6 + 600 * rate) / rate;

  expect(advance(start, reachedAt - 5).toolSupplies).toBe(0);
  const after = advance(start, reachedAt + 5);
  expect(after.toolSupplies).toBe(1);
  expect(after.coins).toBeApprox(num(600 * rate + 5 * rateAfter), 1e-6);
});

test("自動購入は、工具の支給の増分を、採集機全体が増える分で見積もり、採集機より先に買う", () => {
  // 工具の支給は 2.2e6 で増分 88 × 0.0025 × 53 = 11.66（値段あたり約 5.3e-6）、採集機 89 台目は 10 × 1.15^88 ≈ 2.19e6 で
  // 増分 1（約 4.6e-7）。2.5e6 コインで工具の支給を買うと、残りの 3e5 では採集機に届かない。
  const after = advance(trial(0, { coins: num(2.5e6), collectors: 88, autoBuyer: true }), 0);

  expect([after.toolSupplies, after.collectors]).toStrictEqual([1, 88]);
  expect(after.coins).toBeApprox(num(3e5));
});
