import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS,
  UPGRADE_UNLOCK_EARNED,
  advance,
  collectorCost,
  factoryCost,
  initialState,
  perform,
  priceOf,
  production,
  withPurchase,
} from "./game.ts";
import { add, div, mul, num, sub, toNumber, toleranceFloor } from "./num.ts";

// 控えめな自動購入の値段と、それを持つ状態を進めたときの購入。自動購入（値段に届けば買う段）の購入は
// game.auto-buyer.test.ts。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 数を除いた部分（台数など）。 */
const counts = ({ collectors, factories, mints, upgrades }: GameState): object => ({
  collectors,
  factories,
  mints,
  upgrades,
});

const buyCautious = { type: "buyCautiousAutoBuyer" } as const;

test("控えめな自動購入は 30000 コインで、買い終えた後と、自動購入を持った後は買えない", () => {
  expect(priceOf(initialState, buyCautious)).toBeApprox(CAUTIOUS_AUTO_BUYER_COST);
  expect(CAUTIOUS_AUTO_BUYER_COST).toBeApprox(num(3e4));
  expect(priceOf(state({ cautiousAutoBuyer: true }), buyCautious)).toBeUndefined();
  expect(priceOf(state({ autoBuyer: true }), buyCautious)).toBeUndefined();
});

test("控えめな自動購入を買うと、値段を払って控えめな自動購入だけを足す。額が足りなければ買えない", () => {
  const before = state({ coins: num(3e4), totalEarned: num(1e5), collectors: 3 });

  expect(withPurchase(before, buyCautious)).toStrictEqual({ ...before, cautiousAutoBuyer: true });
  expect(perform(before, buyCautious)).toStrictEqual({
    ...before,
    coins: num(0),
    cautiousAutoBuyer: true,
  });
  expect(perform({ ...before, coins: num(29_999) }, buyCautious)).toBeUndefined();
});

test("控えめな自動購入を持っていても、自動購入は同じ値段で買える", () => {
  const before = state({
    coins: AUTO_BUYER_COST,
    totalEarned: AUTO_BUYER_COST,
    cautiousAutoBuyer: true,
  });

  expect(perform(before, { type: "buyAutoBuyer" })).toStrictEqual({
    ...before,
    coins: num(0),
    autoBuyer: true,
  });
});

test("控えめな自動購入が手元に残すコインは、今の毎秒の生産の 600 秒分", () => {
  expect(CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS).toBe(600);
});

test("控えめな自動購入は、払った後も今の生産の 600 秒分のコインが残るときに採集機を買う", () => {
  // 採集機 1 台で毎秒 1。2 台目の値段 11.5 と残す 600 の和の 611.5 に 611.5 秒で届き、11.5 を払う。値段の 11.5 に
  // 届いた時点では買わない。
  const start = state({ collectors: 1, cautiousAutoBuyer: true });

  expect(advance(start, 12).collectors).toBe(1);
  expect(advance(start, 611.4).collectors).toBe(1);
  const first = advance(start, 611.6);
  expect(first.collectors).toBe(2);
  // 和に許容誤差（1e-9）の範囲で届いた時点で買うため、その分だけ比べる誤差を広げる。
  expect(first.coins).toBeApprox(num(600 + 0.1 * 2), 1e-6);

  // 毎秒 2 になり、残すコインも 1200 に増える。3 台目の値段 13.225 との和の 1213.225 に、さらに
  // (1213.225 - 600) / 2 = 306.6125 秒で届く。工場は値段 150 と残す 1200 の和の 1350 にまだ届かない。
  expect(advance(start, 918).collectors).toBe(2);
  const second = advance(start, 918.2);
  expect(counts(second)).toStrictEqual({ collectors: 3, factories: 0, mints: 0, upgrades: 0 });
  expect(second.coins).toBeApprox(num(1200 + 0.0875 * 3), 1e-6);
});

test("控えめな自動購入は、買うたびに増えた生産から残すコインを求め直す", () => {
  // 採集機 20 台で毎秒 20、残すのは 12000。12340 コインで、21 台目の採集機（約 163.67、和は約 12163.67）と 1 つ目の
  // 工場（150、和は 12150）はどちらも和に届き、値段あたりの増分が大きい工場を買う。残りの 12190 は、毎秒 30 になって
  // 残すコインが 18000 に増えたため、採集機の和に届かない（買う前の 12000 のままなら採集機も買う）。
  const after = advance(
    state({
      coins: num(12_340),
      totalEarned: num(12_340),
      collectors: 20,
      cautiousAutoBuyer: true,
    }),
    0,
  );

  expect(counts(after)).toStrictEqual({ collectors: 20, factories: 1, mints: 0, upgrades: 0 });
  expect(after.coins).toBeApprox(num(12_190));
});

test.each([
  { name: "自動購入を持てば、控えめな自動購入も持っていても", cautiousAutoBuyer: true },
  { name: "自動購入だけを持てば", cautiousAutoBuyer: false },
] as const)("$name、コインを残さず、値段に届いたものを買う", ({ cautiousAutoBuyer }) => {
  // 採集機 20 台、12340 コイン。自動購入は残すコインを持たないので、上の控えめな自動購入より多く買う。
  const start = state({
    coins: num(12_340),
    totalEarned: num(12_340),
    collectors: 20,
    autoBuyer: true,
    cautiousAutoBuyer,
  });
  const after = advance(start, 0);

  expect(after.factories).toBeGreaterThan(1);
  expect(toNumber(after.coins)).toBeLessThan(
    Math.min(toNumber(collectorCost(after)), toNumber(factoryCost(after))),
  );
});

test("どちらも持たなければ、残すコインを超えても何も買わない", () => {
  const start = state({ coins: num(12_340), totalEarned: num(12_340), collectors: 20 });

  expect(advance(start, 0)).toStrictEqual(start);
});

test("控えめな自動購入は、値段と残すコインの和に届く直前で区切っても、一度に進めたときと同じ時刻に買う", () => {
  const start = state({ collectors: 1, cautiousAutoBuyer: true });
  const online = advance(advance(start, 611.5 - 1e-8), 0.5);
  const offline = advance(start, 611.5 - 1e-8 + 0.5);

  expect(counts(online)).toStrictEqual(counts(offline));
  expect(online.collectors).toBe(2);
  expect(online.coins).toBeApprox(offline.coins, 1e-6);
});

test("控えめな自動購入は、コインが値段と残すコインの和の許容誤差の境目ちょうどにあれば、経過時間 0 でも買う", () => {
  const base = state({ collectors: 4, cautiousAutoBuyer: true });
  const reserve = mul(production(base), num(CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS));
  const atFloor = { ...base, coins: toleranceFloor(add(collectorCost(base), reserve)) };

  expect(advance(atFloor, 0).collectors).toBe(5);
  expect(counts(advance(atFloor, 0))).toStrictEqual(counts(advance(atFloor, 1e-12)));
});

test.each([
  { name: "自動購入", autoBuyer: true, cautiousAutoBuyer: false, reserveSeconds: 0 },
  {
    name: "控えめな自動購入",
    autoBuyer: false,
    cautiousAutoBuyer: true,
    reserveSeconds: CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS,
  },
] as const)(
  "$name: 採集機に届く時刻と改良の解放の時刻が同じなら、並びで先の採集機を買う",
  ({ autoBuyer, cautiousAutoBuyer, reserveSeconds }) => {
    // 採集機 81 台の値段（約 825135）は改良の値段 800000 以上で、工場 48 台の次の値段（約 9.5e5）より安い。コインは
    // 採集機を買う額（値段と残すコインの和）の許容誤差の境目の 1 手前、累計は改良の解放の条件の境目の 1 手前にし、
    // どちらにも 1 コインの生産で同時に届く。1 を引いても丸めない大きさなので、同じ時刻になる。採集機を払うと、
    // 改良を買う額は残らない。
    const base = state({ collectors: 81, factories: 48, autoBuyer, cautiousAutoBuyer });
    const reserve = mul(production(base), num(reserveSeconds));
    const start = {
      ...base,
      coins: sub(toleranceFloor(add(collectorCost(base), reserve)), num(1)),
      totalEarned: sub(toleranceFloor(UPGRADE_UNLOCK_EARNED), num(1)),
    };

    expect(counts(advance(start, 0))).toStrictEqual(counts(start));
    const after = advance(start, toNumber(div(num(1), production(start))));
    expect(counts(after)).toStrictEqual({ collectors: 82, factories: 48, mints: 0, upgrades: 0 });
  },
);
