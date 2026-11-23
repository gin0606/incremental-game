import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  COLLECTOR_UPGRADE_UNLOCK_EARNED,
  collectorProduction,
  collectorUpgradeCost,
  initialState,
  isCollectorUpgradeUnlocked,
  production,
} from "./game.ts";
import { mul, num } from "./num.ts";

// 改良と造幣所の間に解放される採集機の改修の値段、生産への効き方、解放の条件。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { collectorUpgrades: 0, expected: 5e6 },
  { collectorUpgrades: 1, expected: 4e7 },
  { collectorUpgrades: 3, expected: 5e6 * 8 ** 3 },
] as const)(
  "採集機の改修の値段は 5e6 × 8^数（$collectorUpgrades）",
  ({ collectorUpgrades, expected }) => {
    expect(collectorUpgradeCost(state({ collectorUpgrades }))).toBeApprox(num(expected));
  },
);

test.each([
  { collectors: 3, factories: 2, collectorUpgrades: 0, upgrades: 0, expected: 23 },
  { collectors: 3, factories: 2, collectorUpgrades: 1, upgrades: 0, expected: 26 },
  { collectors: 3, factories: 2, collectorUpgrades: 3, upgrades: 0, expected: 44 },
  { collectors: 3, factories: 2, collectorUpgrades: 3, upgrades: 2, expected: 44 * 1.25 ** 2 },
  { collectors: 0, factories: 2, collectorUpgrades: 3, upgrades: 0, expected: 20 },
] as const)(
  "採集機の改修は 1 つごとに採集機の生産だけを 2 倍にし、その上に改良の倍率が掛かる（採集機 $collectors、工場 $factories、改修 $collectorUpgrades、改良 $upgrades）",
  ({ collectors, factories, collectorUpgrades, upgrades, expected }) => {
    expect(production(state({ collectors, factories, collectorUpgrades, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { collectorUpgrades: 0, expected: 1 },
  { collectorUpgrades: 4, expected: 16 },
] as const)(
  "採集機 1 台の、改良の倍率を掛ける前の毎秒の生産は 2^改修の数（$collectorUpgrades）",
  ({ collectorUpgrades, expected }) => {
    expect(collectorProduction(state({ collectorUpgrades, upgrades: 3 }))).toBeApprox(
      num(expected),
    );
  },
);

test("採集機の改修は累計の生産量が解放の条件に達するまで解放されず、達すると解放される", () => {
  expect(
    isCollectorUpgradeUnlocked(
      state({ coins: num(1e7), totalEarned: mul(COLLECTOR_UPGRADE_UNLOCK_EARNED, num(0.9999)) }),
    ),
  ).toBe(false);
  expect(
    isCollectorUpgradeUnlocked(
      state({ coins: num(1e7), totalEarned: COLLECTOR_UPGRADE_UNLOCK_EARNED }),
    ),
  ).toBe(true);
});
