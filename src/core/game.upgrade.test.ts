import { assert, expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  UPGRADE_UNLOCK_EARNED,
  advance,
  initialState,
  isUpgradeUnlocked,
  perform,
  production,
  upgradeCost,
} from "./game.ts";
import { num } from "./num.ts";

// 改良（すべての施設の生産を 1.25 倍にする品物）の値段・解放・効果。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { upgrades: 0, expected: 4e5 },
  { upgrades: 1, expected: 6.4e5 },
  { upgrades: 6, expected: 4e5 * 1.6 ** 6 },
] as const)("改良の値段は 4e5 × 1.6^数（$upgrades）", ({ upgrades, expected }) => {
  expect(upgradeCost(state({ upgrades }))).toBeApprox(num(expected));
});

test("改良は累計の生産量が 6e6 に達するまで解放されず、買えない", () => {
  const locked = state({ coins: num(1e6), totalEarned: num(5.99e6) });

  expect(isUpgradeUnlocked(locked)).toBe(false);
  expect(perform(locked, { type: "buyUpgrade" })).toBeUndefined();
});

test("改良は累計の生産量が 6e6 に達すると解放され、買うと数が増え、生産量が 1.25 倍になる", () => {
  const unlocked = state({ coins: num(5e5), totalEarned: UPGRADE_UNLOCK_EARNED, factories: 2 });

  expect(isUpgradeUnlocked(unlocked)).toBe(true);
  const after = perform(unlocked, { type: "buyUpgrade" });
  assert.isDefined(after);

  expect(after).toStrictEqual({ ...unlocked, coins: after.coins, upgrades: 1 });
  expect(after.coins).toBeApprox(num(1e5));
  expect(production(after)).toBeApprox(num(21 * 1.25));
});

test("改良を持つときも、自動購入は改良の倍率を掛ける前の増分で、改良と施設を値段あたりで比べる", () => {
  // 改良 8 つ（倍率約 5.96）。改良を 1 つ買うと倍率の前の生産 600 の 0.25 倍の 150 が増え、値段は約 1.72e7。工場は
  // 1 つで 10 増え、値段は約 2.2e5 から伸びる。倍率を改良の増分にだけ掛けると、改良が工場より得に見える。
  const after = advance(
    state({
      coins: num(1.75e7),
      totalEarned: num(1e8),
      collectors: 200,
      factories: 40,
      upgrades: 8,
      autoBuyer: true,
    }),
    0,
  );

  expect([after.factories, after.upgrades]).toStrictEqual([55, 8]);
});
