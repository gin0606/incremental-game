import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import { advance, collectorCost, initialState } from "./game.ts";
import { num, toleranceFloor } from "./num.ts";

// 自動購入を持つ状態を進めたときの購入。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 数を除いた部分（台数など）。 */
const counts = ({ collectors, factories, mints, upgrades, autoBuyer }: GameState): object => ({
  collectors,
  factories,
  mints,
  upgrades,
  autoBuyer,
});

test("自動購入があれば、採集機の値段に達するたびに採集機を買う", () => {
  const start = state({ collectors: 1, autoBuyer: true });

  // 11.5 秒で 1 台目を買い、残り 0.5 秒は 2 台で生産する。値段に許容誤差（1e-9）の範囲で届いた時点で買うため、
  // 買う時刻は値段ちょうどに届く時刻よりわずかに早い。その分だけ比べる誤差を広げる。
  const first = advance(start, 12);
  expect(first.collectors).toBe(2);
  expect(first.coins).toBeApprox(num(1), 1e-6);
  expect(first.totalEarned).toBeApprox(num(12.5), 1e-6);

  // 2 台目の値段 13.225 に、さらに (13.225 - 1) / 2 秒で達する。
  const second = advance(first, (13.225 - 1) / 2 + 0.25);
  expect(second.collectors).toBe(3);
  expect(second.coins).toBeApprox(num(0.75), 1e-6);
});

test("自動購入があれば、工場の生産も合わせて採集機の値段に達する時刻に買う", () => {
  // 採集機 1 台と工場 1 つで毎秒 11。11.5 / 11 秒で 2 台目を買い、そこからは毎秒 12。
  const after = advance(state({ collectors: 1, factories: 1, autoBuyer: true }), 2);

  expect(after.collectors).toBe(2);
  expect(after.coins).toBeApprox(num((2 - 11.5 / 11) * 12), 1e-6);
});

test("自動購入は、買える額に達したもののうち値段あたりの生産量の増分が大きいものを買う", () => {
  // 採集機 20 台目の値段は 10 × 1.15^20 ≈ 163.67 で増分 1、工場は 150 で増分 10。170 コインではどちらも買えるが、
  // 工場を買うと残りで採集機を買えない。
  const after = advance(
    state({ coins: num(170), totalEarned: num(170), collectors: 20, autoBuyer: true }),
    0,
  );

  expect(counts(after)).toStrictEqual({
    collectors: 20,
    factories: 1,
    mints: 0,
    upgrades: 0,
    autoBuyer: true,
  });
  expect(after.coins).toBeApprox(num(20));
});

test("自動購入は、工場を買える額でも、値段あたりの増分が大きければ採集機を先に買う", () => {
  // 2 台目の値段 11.5 で増分 1 は、工場の 150 で増分 10 より割安。採集機を 2 台買うと工場の値段を下回り、その後は
  // 採集機だけを 9 台まで買う（2〜9 台目の値段の和は 157.86）。
  const after = advance(state({ coins: num(160), totalEarned: num(160), autoBuyer: true }), 0);

  expect(counts(after)).toStrictEqual({
    collectors: 9,
    factories: 0,
    mints: 0,
    upgrades: 0,
    autoBuyer: true,
  });
  expect(after.coins).toBeApprox(num(160 - 157.8584), 1e-4);
});

test("自動購入があれば、工場の値段に達する時刻に工場を買う。解放の前から進めても同じ", () => {
  // 採集機 20 台で毎秒 20。累計 100 で工場が解放され、7.5 秒で工場の値段 150 に、8.18 秒で採集機の値段に届く。
  // 7.5 秒からは毎秒 30。
  const after = advance(state({ collectors: 20, autoBuyer: true }), 8);

  expect(counts(after)).toStrictEqual({
    collectors: 20,
    factories: 1,
    mints: 0,
    upgrades: 0,
    autoBuyer: true,
  });
  expect(after.coins).toBeApprox(num(0.5 * 30), 1e-6);
});

// 採集機 200 台（次は約 1.4e13）と工場 100 台（次は約 1.2e10）に改良 8 つ（次は 8e5 × 1.55^8 ≈ 2.7e7）で、毎秒
// 1200 × 1.25^8。造幣所（1e7）のほかは、テストの間に値段に届かない。
const MULTIPLIER = 1.25 ** 8;
const MINT_TRIAL_RATE = 1200 * MULTIPLIER;
/** 造幣所を 1 つ買った後の毎秒の生産。 */
const MINT_TRIAL_RATE_AFTER = 1230 * MULTIPLIER;
const mintTrial = (coins: number, totalEarned: number): GameState =>
  state({
    coins: num(coins),
    totalEarned: num(totalEarned),
    collectors: 200,
    factories: 100,
    upgrades: 8,
    autoBuyer: true,
  });

test("自動購入は、造幣所の値段に届いても、累計の生産量が解放の条件に届くまで買わない", () => {
  // コインは 1e7 / 毎秒の生産 ≈ 1398 秒で値段に届くが、累計の生産量は 1.5e7 / 毎秒の生産 ≈ 2097 秒で 1.5e8 に届く。
  const start = mintTrial(0, 1.35e8);
  const unlockedAt = 1.5e7 / MINT_TRIAL_RATE;

  expect(advance(start, 2090).mints).toBe(0);
  const after = advance(start, 2110);
  expect(counts(after)).toStrictEqual({
    collectors: 200,
    factories: 100,
    mints: 1,
    upgrades: 8,
    autoBuyer: true,
  });
  // 解放の時刻のコイン 1.5e7 から 1e7 を払い、2 つ目（1.1e7）には届かない。残りの時間は造幣所を足した生産量で
  // 生産する。
  expect(after.coins).toBeApprox(
    num(1.5e7 - 1e7 + (2110 - unlockedAt) * MINT_TRIAL_RATE_AFTER),
    1e-6,
  );
});

test("自動購入は、解放された造幣所を、値段に届く時刻に買う", () => {
  // 解放の条件には 1e6 / 毎秒の生産 ≈ 140 秒で届くが、値段には 1e7 / 毎秒の生産 ≈ 1398 秒で届く。
  const start = mintTrial(0, 1.49e8);
  const reachedAt = 1e7 / MINT_TRIAL_RATE;

  expect(advance(start, 1390).mints).toBe(0);
  const after = advance(start, 1410);
  expect(after.mints).toBe(1);
  expect(after.coins).toBeApprox(num((1410 - reachedAt) * MINT_TRIAL_RATE_AFTER), 1e-6);
});

test("自動購入は、造幣所とそれより安い工場を買える額でも、値段あたりの増分が大きければ造幣所を買う", () => {
  // 造幣所は 1e7 で増分 30（値段あたり 3e-6）、工場 61 台目は 150 × 1.2^60 ≈ 8.45e6 で増分 10（約 1.18e-6）、
  // 採集機 98 台目は 10 × 1.15^97 ≈ 7.7e6 で増分 1。1.05e7 コインでは、どれを買っても残りで次を買えない。増分は
  // どれも改良 8 つの倍率を掛けた値になるが、大小は変わらない。改良（次は約 2.7e7）は買えない。
  const after = advance(
    state({
      coins: num(1.05e7),
      totalEarned: num(1.5e8),
      collectors: 97,
      factories: 60,
      upgrades: 8,
      autoBuyer: true,
    }),
    0,
  );

  expect(counts(after)).toStrictEqual({
    collectors: 97,
    factories: 60,
    mints: 1,
    upgrades: 8,
    autoBuyer: true,
  });
  expect(after.coins).toBeApprox(num(5e5));
});

test("造幣所の解放の前後で区切っても、一度に進めたときと同じ時刻に造幣所を買う", () => {
  const start = mintTrial(0, 1.35e8);
  // 解放の時刻（約 2097 秒）に 1 つ目を買い、2 つ目（1.1e7）には約 818 秒後に届く。
  const once = advance(start, 2200);
  const split = advance(advance(start, 1500), 700);

  expect(split.mints).toBe(1);
  expect(counts(split)).toStrictEqual(counts(once));
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

// 採集機 200 台と工場 100 台で毎秒 1200。改良（8e5）のほかは、テストの間に値段に届かない。
const upgradeTrial = (totalEarned: number): GameState =>
  state({ totalEarned: num(totalEarned), collectors: 200, factories: 100, autoBuyer: true });

test("自動購入は、改良の値段に届いても、累計の生産量が解放の条件に届くまで買わない", () => {
  // コインは 8e5 / 1200 ≈ 667 秒で値段に届くが、累計の生産量は 1.2e6 / 1200 = 1000 秒で 1.2e7 に届く。解放の時刻の
  // コイン 1.2e6 から 8e5 を払うと、2 つ目（1.24e6）には届かない。
  const start = upgradeTrial(1.08e7);

  expect(advance(start, 990).upgrades).toBe(0);
  const after = advance(start, 1010);
  expect(after.upgrades).toBe(1);
  // 残りの 10 秒は、改良で 1.25 倍になった毎秒 1500 で生産する。
  expect(after.coins).toBeApprox(num(1.2e6 - 8e5 + 10 * 1500), 1e-6);
});

test("改良の解放の前後で区切っても、一度に進めたときと同じ時刻に改良を買う", () => {
  const start = upgradeTrial(1.08e7);
  const once = advance(start, 1100);
  const split = advance(advance(start, 700), 400);

  expect(split.upgrades).toBe(1);
  expect(counts(split)).toStrictEqual(counts(once));
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

test("自動購入は、改良とそれより安い工場を買える額でも、値段あたりの増分が大きければ改良を買う", () => {
  // 改良は 8e5 で増分 (200 + 400) × 0.25 = 150（値段あたり 1.875e-4）、工場 41 台目は 150 × 1.2^40 ≈ 2.20e5 で
  // 増分 10（約 4.5e-5）、採集機 201 台目は約 1.4e13。8.1e5 コインで改良を買うと、残りの 1e4 で工場を買えない。
  // 工場を先に買うと改良に届かない。
  const after = advance(
    state({
      coins: num(8.1e5),
      totalEarned: num(1.2e7),
      collectors: 200,
      factories: 40,
      autoBuyer: true,
    }),
    0,
  );

  expect(counts(after)).toStrictEqual({
    collectors: 200,
    factories: 40,
    mints: 0,
    upgrades: 1,
    autoBuyer: true,
  });
  expect(after.coins).toBeApprox(num(1e4));
});

test("自動購入は、改良を買える額でも、値段あたりの増分が大きければ工場を先に買う", () => {
  // 工場 26 台目は 150 × 1.2^25 ≈ 1.43e4 で増分 10（約 7.0e-4）、改良は 8e5 で増分 (200 + 250) × 0.25 = 112.5
  // （約 1.4e-4）。8.1e5 コインで工場を先に買うと、残りでは改良に届かない。
  const after = advance(
    state({
      coins: num(8.1e5),
      totalEarned: num(1.2e7),
      collectors: 200,
      factories: 25,
      autoBuyer: true,
    }),
    0,
  );

  expect(after.upgrades).toBe(0);
  expect(after.factories).toBeGreaterThan(25);
});

test("値段に届く直前で区切っても、一度に進めたときと同じ時刻に買う", () => {
  // 区切りの時点のコインが値段の許容誤差の範囲に入っていても、買う時刻はずれない。
  const start = state({ collectors: 1, autoBuyer: true });
  const online = advance(advance(start, 11.5 - 1e-8), 6.6125 - 5e-9);
  const offline = advance(start, 11.5 - 1e-8 + (6.6125 - 5e-9));

  expect(counts(online)).toStrictEqual(counts(offline));
  expect(online.coins).toBeApprox(offline.coins, 1e-6);
});

test("自動購入の時刻が区切りの終わりとちょうど重なれば、その時刻に買う", () => {
  // 採集機 4 台で、コインが次の値段の許容誤差の境目にある。境目ちょうどでは丸め誤差で比べると届かない。
  const base = state({ collectors: 4, autoBuyer: true });
  const atFloor = { ...base, coins: toleranceFloor(collectorCost(base)) };

  expect(advance(atFloor, 0).collectors).toBe(5);
  expect(counts(advance(atFloor, 0))).toStrictEqual(counts(advance(atFloor, 1e-12)));
});

test("一度に進めて区切りの終わりが自動購入の時刻と重なっても、途中で区切ったときと同じく買う", () => {
  // 3.9087514315578256 秒は、採集機 9 台・0 コインから 10 台目の値段の許容誤差の境目に届く時刻。
  const start = state({ collectors: 9, autoBuyer: true });
  const once = advance(start, 3.9087514315578256);
  const split = advance(advance(start, 0.3), 3.9087514315578256 - 0.3);

  expect(once.collectors).toBe(10);
  expect(counts(once)).toStrictEqual(counts(split));
});

test("自動購入があれば、進め始める前に手元のコインで買えるだけ買ってから生産する", () => {
  // 100 コインで 2〜6 台目（11.5 + 13.225 + 15.21 + 17.49 + 20.11 = 77.54）を買い、6 台で 0.1 秒生産する。
  // 7 台目の値段 23.13 には届かない。
  const after = advance(state({ coins: num(100), totalEarned: num(100), autoBuyer: true }), 0.1);

  expect(after.collectors).toBe(6);
  expect(after.totalEarned).toBeApprox(num(100.6));
});

test("自動購入があっても、生産が無ければ何も買わない", () => {
  const start = state({ collectors: 0, autoBuyer: true });

  expect(advance(start, 1e6)).toStrictEqual(start);
});

test("経過時間 0 でも、自動購入があれば手元のコインで買えるだけ買う", () => {
  const after = advance(state({ coins: num(10 + 11.5 + 1), collectors: 0, autoBuyer: true }), 0);

  expect(after.collectors).toBe(2);
  expect(after.coins).toBeApprox(num(1));
});
