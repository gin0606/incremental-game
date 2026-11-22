import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  EXCHANGE_UNLOCK_EARNED,
  exchangeCost,
  initialState,
  isExchangeUnlocked,
  production,
} from "./game.ts";
import { mul, num } from "./num.ts";

// 精錬所の後に解放される交易所の値段、生産、解放の条件。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { exchanges: 0, expected: 4e7 },
  { exchanges: 1, expected: 4.24e7 },
  { exchanges: 8, expected: 4e7 * 1.06 ** 8 },
] as const)("交易所の値段は 4e7 × 1.06^数（$exchanges）", ({ exchanges, expected }) => {
  expect(exchangeCost(state({ exchanges }))).toBeApprox(num(expected));
});

test.each([
  { collectors: 0, refineries: 0, exchanges: 2, upgrades: 0, expected: 600 },
  { collectors: 3, refineries: 5, exchanges: 2, upgrades: 0, expected: 1103 },
  { collectors: 3, refineries: 5, exchanges: 2, upgrades: 2, expected: 1103 * 1.25 ** 2 },
] as const)(
  "交易所は 1 つにつき毎秒 300 を生み、改良の倍率が掛かる（採集機 $collectors、精錬所 $refineries、交易所 $exchanges、改良 $upgrades）",
  ({ collectors, refineries, exchanges, upgrades, expected }) => {
    expect(production(state({ collectors, refineries, exchanges, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test("交易所は累計の生産量が解放の条件に達するまで解放されず、達すると解放される", () => {
  expect(
    isExchangeUnlocked(
      state({ coins: num(5e7), totalEarned: mul(EXCHANGE_UNLOCK_EARNED, num(0.9999)) }),
    ),
  ).toBe(false);
  expect(isExchangeUnlocked(state({ coins: num(5e7), totalEarned: EXCHANGE_UNLOCK_EARNED }))).toBe(
    true,
  );
});
