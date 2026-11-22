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
  upgradeUnlockEarned,
} from "./game.ts";
import { num } from "./num.ts";

// 改良（すべての施設の生産を 1.25 倍にする品物）の値段・解放・効果。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { upgrades: 0, expected: 8e5 },
  { upgrades: 1, expected: 1.24e6 },
  { upgrades: 6, expected: 8e5 * 1.55 ** 6 },
] as const)("改良の値段は 8e5 × 1.55^数（$upgrades）", ({ upgrades, expected }) => {
  expect(upgradeCost(state({ upgrades }))).toBeApprox(num(expected));
});

test("改良は累計の生産量が 1.2e7 に達するまで解放されず、買えない", () => {
  const locked = state({ coins: num(1e6), totalEarned: num(1.199e7) });

  expect(isUpgradeUnlocked(locked)).toBe(false);
  expect(perform(locked, { type: "buyUpgrade" })).toBeUndefined();
});

test("改良は累計の生産量が 1.2e7 に達すると解放され、買うと数が増え、生産量が 1.25 倍になる", () => {
  const unlocked = state({ coins: num(9e5), totalEarned: UPGRADE_UNLOCK_EARNED, factories: 2 });

  expect(isUpgradeUnlocked(unlocked)).toBe(true);
  const after = perform(unlocked, { type: "buyUpgrade" });
  assert.isDefined(after);

  expect(after).toStrictEqual({ ...unlocked, coins: after.coins, upgrades: 1 });
  expect(after.coins).toBeApprox(num(1e5));
  expect(production(after)).toBeApprox(num(21 * 1.25));
});

test("改良を持つときも、自動購入は改良の倍率を掛ける前の増分で、改良と施設を値段あたりで比べる", () => {
  // 改良 8 つ（倍率約 5.96）。改良を 1 つ買うと倍率の前の生産 620 の 0.25 倍の 155 が増え（値段あたり約 5.8e-6）、
  // 値段は約 2.67e7。工場 43 台目は約 3.2e5 で 10 増える（約 3.1e-5）。倍率を改良の増分にだけ掛けると、改良が約 3.5e-5 と
  // 工場より得に見え、2.7e7 コインで改良を先に買う。
  const after = advance(
    state({
      coins: num(2.7e7),
      totalEarned: num(1e8),
      collectors: 200,
      factories: 42,
      upgrades: 8,
      autoBuyer: true,
    }),
    0,
  );

  expect([after.factories, after.upgrades]).toStrictEqual([57, 8]);
});

test("改良を持っていれば、解放の条件に届いていなくても解放されていて、手でも自動購入でも買える", () => {
  // 解放の条件が 6e6 だった版の保存は、今の条件 1.2e7 に届かずに改良を持っていることがある。2 つ目は 1.24e6 で、
  // 採集機 200 台（次は約 1.4e13）と工場 100 台（次は約 1.2e10）はそれより高い。
  const owned = state({
    coins: num(1.3e6),
    totalEarned: num(8e6),
    collectors: 200,
    factories: 100,
    upgrades: 1,
  });

  expect(upgradeUnlockEarned(owned)).toStrictEqual(num(0));
  expect(isUpgradeUnlocked(owned)).toBe(true);
  expect(perform(owned, { type: "buyUpgrade" })?.upgrades).toBe(2);
  expect(advance({ ...owned, autoBuyer: true }, 0).upgrades).toBe(2);
  // 自動購入は解放の条件（あと 4e6、毎秒 1500 で約 2667 秒）を待たず、値段 1.24e6 に届く約 827 秒に買い、残りの時間は
  // 毎秒 1875 で生産する。
  const reached = advance({ ...owned, coins: num(0), autoBuyer: true }, 1000);
  expect(reached.upgrades).toBe(2);
  expect(reached.coins).toBeApprox(num((1000 - 1.24e6 / 1500) * 1875), 1e-6);
  // 持っていなければ、同じ累計でも解放されていない。
  const none = { ...owned, upgrades: 0 };
  expect(isUpgradeUnlocked(none)).toBe(false);
  expect(perform(none, { type: "buyUpgrade" })).toBeUndefined();
  expect(advance({ ...none, autoBuyer: true }, 0).upgrades).toBe(0);
});
