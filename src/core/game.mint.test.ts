import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  MINT_UNLOCK_EARNED,
  advance,
  initialState,
  isMintUnlocked,
  mintUnlockEarned,
  perform,
} from "./game.ts";
import { num } from "./num.ts";

// 造幣所の解放の条件と、造幣所を持っている状態の解放。解放の条件が 5e7 だった版の保存は、今の条件 1.3e8 に届かずに造幣所を持っていることがある。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test("造幣所は累計の生産量が 1.3e8 に達するまで解放されず、買えない", () => {
  const locked = state({ coins: num(2e7), totalEarned: num(1.299e8) });

  expect(isMintUnlocked(locked)).toBe(false);
  expect(perform(locked, { type: "buyMint" })).toBeUndefined();
});

test("造幣所は累計の生産量が 1.3e8 に達すると解放され、買える", () => {
  const unlocked = state({ coins: num(1.1e7), totalEarned: MINT_UNLOCK_EARNED });

  expect(MINT_UNLOCK_EARNED).toBeApprox(num(1.3e8));
  expect(isMintUnlocked(unlocked)).toBe(true);
  const after = perform(unlocked, { type: "buyMint" });

  expect(after).toStrictEqual({ ...unlocked, mints: 1, coins: after?.coins });
  expect(after?.coins).toBeApprox(num(1e6));
});

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
 * 造幣所 2 台を持ち、累計 9e7 で、ほかの品物は造幣所より高い状態。採集機 200 台・工場 100 台・造幣所 2 台に改良 8 つと
 * 採集機の改修 1 つ（採集機 1 台が毎秒 2 を生む。次は 4e7）で毎秒 1460 × 1.25^8 ≈ 8703。造幣所の値段 1.21e7 に約 1390 秒、
 * 改良の値段約 2.67e7 に約 3068 秒で届く。
 */
const ownedBeforeUnlock = state({
  totalEarned: num(9e7),
  collectors: 200,
  factories: 100,
  mints: 2,
  upgrades: 8,
  collectorUpgrades: 1,
  autoBuyer: true,
});

test("造幣所を持っていれば、自動購入は解放の条件を待たずに、値段に届いたときに造幣所を買う", () => {
  expect(advance(ownedBeforeUnlock, 1380).mints).toBe(2);
  expect(advance(ownedBeforeUnlock, 1400).mints).toBe(3);
});

test("造幣所を持っていて解放の条件の前に買うときも、一度に進めても区切って進めても同じ時刻に買う", () => {
  const once = advance(ownedBeforeUnlock, 1500);
  const split = advance(advance(ownedBeforeUnlock, 1450), 50);

  expect(split.mints).toBe(3);
  expect(split.mints).toBe(once.mints);
  expect(split.coins).toBeApprox(once.coins, 1e-9);
});
