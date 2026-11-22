import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import { REFINERY_UNLOCK_EARNED, initialState, isRefineryUnlocked, refineryCost } from "./game.ts";
import { num } from "./num.ts";

// 造幣所の後に解放される精錬所の値段と解放の条件。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { refineries: 0, expected: 3e7 },
  { refineries: 1, expected: 3.24e7 },
  { refineries: 8, expected: 3e7 * 1.08 ** 8 },
] as const)("精錬所の値段は 3e7 × 1.08^数（$refineries）", ({ refineries, expected }) => {
  expect(refineryCost(state({ refineries }))).toBeApprox(num(expected));
});

test("精錬所は累計の生産量が 4.5e8 に達するまで解放されず、達すると解放される", () => {
  expect(REFINERY_UNLOCK_EARNED).toBeApprox(num(4.5e8));
  expect(isRefineryUnlocked(state({ coins: num(4e7), totalEarned: num(4.499e8) }))).toBe(false);
  expect(isRefineryUnlocked(state({ coins: num(4e7), totalEarned: REFINERY_UNLOCK_EARNED }))).toBe(
    true,
  );
});
