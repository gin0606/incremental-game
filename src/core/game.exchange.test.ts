import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  EXCHANGE_UNLOCK_EARNED,
  advance,
  exchangeCost,
  initialState,
  isExchangeUnlocked,
  perform,
  priceOf,
  production,
  withPurchase,
} from "./game.ts";
import { num } from "./num.ts";

// 精錬所の後に解放される交易所の値段、生産、解放の条件と、自動購入が交易所を買う時刻。

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

test("交易所は累計の生産量が 7.5e8 に達するまで解放されず、達すると解放される", () => {
  expect(EXCHANGE_UNLOCK_EARNED).toBeApprox(num(7.5e8));
  expect(isExchangeUnlocked(state({ coins: num(5e7), totalEarned: num(7.499e8) }))).toBe(false);
  expect(isExchangeUnlocked(state({ coins: num(5e7), totalEarned: EXCHANGE_UNLOCK_EARNED }))).toBe(
    true,
  );
});

test("交易所は解放の前は値段が無く買えず、解放の後は値段を払って買える", () => {
  const locked = state({ coins: num(5e7), totalEarned: num(7.499e8) });
  const unlocked = { ...locked, totalEarned: EXCHANGE_UNLOCK_EARNED };

  expect(priceOf(locked, { type: "buyExchange" })).toBeUndefined();
  expect(perform(locked, { type: "buyExchange" })).toBeUndefined();
  expect(priceOf(unlocked, { type: "buyExchange" })).toBeApprox(num(4e7));
  expect(withPurchase(unlocked, { type: "buyExchange" })).toStrictEqual({
    ...unlocked,
    exchanges: 1,
  });
  const after = perform(unlocked, { type: "buyExchange" });
  expect(after?.exchanges).toBe(1);
  expect(after?.coins).toBeApprox(num(1e7));
});

// 採集機 200 台（次は約 1.4e13）、工場 100 台（約 1.2e10）、造幣所 50（約 1.2e9）、精錬所 50（約 1.4e9）、改良 20
// （約 5.1e9）で、毎秒 7700 × 1.25^20。交易所（4e7）のほかは、テストの間に値段に届かない。
const MULTIPLIER = 1.25 ** 20;
const RATE = 7700 * MULTIPLIER;
/** 交易所を 1 つ買った後の毎秒の生産。 */
const RATE_AFTER = 8000 * MULTIPLIER;
const trial = (totalEarned: number, automation: Partial<GameState>): GameState =>
  state({
    totalEarned: num(totalEarned),
    collectors: 200,
    factories: 100,
    mints: 50,
    refineries: 50,
    upgrades: 20,
    ...automation,
  });

test("自動購入は、交易所の値段に届いても、累計の生産量が解放の条件に届くまで買わず、届いた時刻に買う", () => {
  // コインは 4e7 / 毎秒の生産 ≈ 60 秒で値段に届くが、累計の生産量は 5e7 / 毎秒の生産 ≈ 75 秒で 7.5e8 に届く。
  const start = trial(7e8, { autoBuyer: true });
  const unlockedAt = 5e7 / RATE;

  expect(advance(start, 72).exchanges).toBe(0);
  const after = advance(start, 80);
  expect(after.exchanges).toBe(1);
  // 解放の時刻のコイン 5e7 から 4e7 を払い、2 つ目（4.24e7）には届かない。
  expect(after.coins).toBeApprox(num(1e7 + (80 - unlockedAt) * RATE_AFTER), 1e-6);
});

test("交易所の解放の前後で区切っても、一度に進めたときと同じ時刻に交易所を買う", () => {
  const start = trial(7e8, { autoBuyer: true });
  // 解放の時刻（約 75 秒）に 1 つ目を、約 47 秒後に 2 つ目（4.24e7）を買う。
  const once = advance(start, 150);
  const split = advance(advance(start, 70), 80);

  expect(split.exchanges).toBe(2);
  expect(split.exchanges).toBe(once.exchanges);
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

test("控えめな自動購入は、払った後も 600 秒分のコインが残るときに交易所を買う", () => {
  // 値段 4e7 と、毎秒の生産の 600 秒分の和に約 660 秒で届く。
  const start = trial(7.5e8, { cautiousAutoBuyer: true });
  const reachedAt = (4e7 + 600 * RATE) / RATE;

  expect(advance(start, reachedAt - 5).exchanges).toBe(0);
  const after = advance(start, reachedAt + 5);
  expect(after.exchanges).toBe(1);
  expect(after.coins).toBeApprox(num(600 * RATE + 5 * RATE_AFTER), 1e-6);
});

test("自動購入は、交易所とそれより安い精錬所を買える額でも、値段あたりの増分が大きければ交易所を買う", () => {
  // 交易所は 4e7 で増分 300（値段あたり 7.5e-6）、精錬所は 3e7 で増分 100（約 3.33e-6）。4.5e7 コインで交易所を買うと、
  // 残りの 5e6 では精錬所に届かない。採集機・工場・造幣所・改良は 1e9 より高い。
  const after = advance(trial(7.5e8, { coins: num(4.5e7), refineries: 0, autoBuyer: true }), 0);

  expect(after.exchanges).toBe(1);
  expect(after.refineries).toBe(0);
  expect(after.coins).toBeApprox(num(5e6));
});
