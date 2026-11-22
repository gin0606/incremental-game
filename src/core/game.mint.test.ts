import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import { advance, initialState, isMintUnlocked, mintUnlockEarned, perform } from "./game.ts";
import { num } from "./num.ts";

// 造幣所を持っている状態の解放。解放の条件が 5e7 だった版の保存は、今の条件 1.5e8 に届かずに造幣所を持っていることがある。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test("造幣所を持っていれば、解放の条件に届いていなくても解放されていて、買える", () => {
  const owned = state({ coins: num(1.1e7), totalEarned: num(8e7), mints: 1 });

  expect(mintUnlockEarned(owned)).toStrictEqual(num(0));
  expect(isMintUnlocked(owned)).toBe(true);
  expect(perform(owned, { type: "buyMint" })?.mints).toBe(2);
  // 持っていなければ、同じ累計でも解放されていない。
  expect(isMintUnlocked({ ...owned, mints: 0 })).toBe(false);
  expect(perform({ ...owned, mints: 0 }, { type: "buyMint" })).toBeUndefined();
});

/**
 * 造幣所 2 台を持ち、累計 9e7 で、ほかの品物は造幣所より高い状態。採集機 200 台・工場 100 台・造幣所 2 台に改良 8 つで
 * 毎秒 1260 × 1.25^8 ≈ 7510。造幣所の値段 1.21e7 に約 1611 秒、改良の値段約 2.67e7 に約 3549 秒で届く。
 */
const ownedBeforeUnlock = state({
  totalEarned: num(9e7),
  collectors: 200,
  factories: 100,
  mints: 2,
  upgrades: 8,
  autoBuyer: true,
});

test("造幣所を持っていれば、自動購入は解放の条件を待たずに、値段に届いたときに造幣所を買う", () => {
  expect(advance(ownedBeforeUnlock, 1600).mints).toBe(2);
  expect(advance(ownedBeforeUnlock, 1620).mints).toBe(3);
});

test("造幣所を持っていて解放の条件の前に買うときも、一度に進めても区切って進めても同じ時刻に買う", () => {
  const once = advance(ownedBeforeUnlock, 1700);
  const split = advance(advance(ownedBeforeUnlock, 1650), 50);

  expect(split.mints).toBe(3);
  expect(split.mints).toBe(once.mints);
  expect(split.coins).toBeApprox(once.coins, 1e-9);
});
