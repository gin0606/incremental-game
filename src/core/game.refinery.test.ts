import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  REFINERY_UNLOCK_EARNED,
  advance,
  initialState,
  isRefineryUnlocked,
  perform,
  priceOf,
  refineryCost,
  withPurchase,
} from "./game.ts";
import { num } from "./num.ts";

// 造幣所の後に解放される精錬所の値段と解放の条件と、自動購入が精錬所を買う時刻。

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

test("精錬所は解放の前は値段が無く買えず、解放の後は値段を払って買える", () => {
  const locked = state({ coins: num(4e7), totalEarned: num(4.499e8) });
  const unlocked = { ...locked, totalEarned: REFINERY_UNLOCK_EARNED };

  expect(priceOf(locked, { type: "buyRefinery" })).toBeUndefined();
  expect(perform(locked, { type: "buyRefinery" })).toBeUndefined();
  expect(priceOf(unlocked, { type: "buyRefinery" })).toBeApprox(num(3e7));
  expect(withPurchase(unlocked, { type: "buyRefinery" })).toStrictEqual({
    ...unlocked,
    refineries: 1,
  });
  const after = perform(unlocked, { type: "buyRefinery" });
  expect(after?.refineries).toBe(1);
  expect(after?.coins).toBeApprox(num(1e7));
});

// 採集機 200 台（次は約 1.4e13）、工場 100 台（約 1.2e10）、造幣所 50（約 1.2e9）、改良 20（約 5.1e9）で、毎秒
// 2700 × 1.25^20。精錬所（3e7）のほかは、テストの間に値段に届かない。
const MULTIPLIER = 1.25 ** 20;
const RATE = 2700 * MULTIPLIER;
/** 精錬所を 1 つ買った後の毎秒の生産。 */
const RATE_AFTER = 2800 * MULTIPLIER;
const trial = (totalEarned: number, automation: Partial<GameState>): GameState =>
  state({
    totalEarned: num(totalEarned),
    collectors: 200,
    factories: 100,
    mints: 50,
    upgrades: 20,
    ...automation,
  });

test("自動購入は、精錬所の値段に届いても、累計の生産量が解放の条件に届くまで買わず、届いた時刻に買う", () => {
  // コインは 3e7 / 毎秒の生産 ≈ 128 秒で値段に届くが、累計の生産量は 5e7 / 毎秒の生産 ≈ 213 秒で 4.5e8 に届く。
  const start = trial(4e8, { autoBuyer: true });
  const unlockedAt = 5e7 / RATE;

  expect(advance(start, 210).refineries).toBe(0);
  const after = advance(start, 220);
  expect(after.refineries).toBe(1);
  // 解放の時刻のコイン 5e7 から 3e7 を払い、2 つ目（3.24e7）には届かない。
  expect(after.coins).toBeApprox(num(2e7 + (220 - unlockedAt) * RATE_AFTER), 1e-6);
});

test("精錬所の解放の前後で区切っても、一度に進めたときと同じ時刻に精錬所を買う", () => {
  const start = trial(4e8, { autoBuyer: true });
  // 解放の時刻（約 213 秒）に 1 つ目を、約 51 秒後に 2 つ目（3.24e7）を買う。
  const once = advance(start, 300);
  const split = advance(advance(start, 150), 150);

  expect(split.refineries).toBe(2);
  expect(split.refineries).toBe(once.refineries);
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

test("控えめな自動購入は、払った後も 600 秒分のコインが残るときに精錬所を買う", () => {
  // 値段 3e7 と、毎秒の生産の 600 秒分の和に約 728 秒で届く。
  const start = trial(4.5e8, { cautiousAutoBuyer: true });
  const reachedAt = (3e7 + 600 * RATE) / RATE;

  expect(advance(start, reachedAt - 5).refineries).toBe(0);
  const after = advance(start, reachedAt + 5);
  expect(after.refineries).toBe(1);
  expect(after.coins).toBeApprox(num(600 * RATE + 5 * RATE_AFTER), 1e-6);
});

test("自動購入は、精錬所とそれより安い造幣所を買える額でも、値段あたりの増分が大きければ精錬所を買う", () => {
  // 精錬所は 3e7 で増分 100（値段あたり約 3.33e-6）、造幣所は 1e7 で増分 30（3e-6）。3.5e7 コインで精錬所を買うと、
  // 残りの 5e6 では造幣所に届かない。採集機・工場・改良は 1e9 より高い。
  const after = advance(trial(4.5e8, { coins: num(3.5e7), mints: 0, autoBuyer: true }), 0);

  expect(after.refineries).toBe(1);
  expect(after.mints).toBe(0);
  expect(after.coins).toBeApprox(num(5e6));
});
