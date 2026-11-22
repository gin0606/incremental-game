import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_MARGIN,
  advance,
  collectorCost,
  initialState,
  perform,
  priceOf,
  withPurchase,
} from "./game.ts";
import { mul, num, toNumber, toleranceFloor } from "./num.ts";

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

test("控えめな自動購入は 10000 コインで、買い終えた後と、自動購入を持った後は買えない", () => {
  expect(priceOf(initialState, buyCautious)).toBeApprox(CAUTIOUS_AUTO_BUYER_COST);
  expect(CAUTIOUS_AUTO_BUYER_COST).toBeApprox(num(1e4));
  expect(priceOf(state({ cautiousAutoBuyer: true }), buyCautious)).toBeUndefined();
  expect(priceOf(state({ autoBuyer: true }), buyCautious)).toBeUndefined();
});

test("控えめな自動購入を買うと、値段を払って控えめな自動購入だけを足す。額が足りなければ買えない", () => {
  const before = state({ coins: num(1e4), totalEarned: num(1e5), collectors: 3 });

  expect(withPurchase(before, buyCautious)).toStrictEqual({ ...before, cautiousAutoBuyer: true });
  expect(perform(before, buyCautious)).toStrictEqual({
    ...before,
    coins: num(0),
    cautiousAutoBuyer: true,
  });
  expect(perform({ ...before, coins: num(9999) }, buyCautious)).toBeUndefined();
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

test("控えめな自動購入が買うのに要るコインは、値段の 2 倍", () => {
  expect(toNumber(CAUTIOUS_AUTO_BUYER_MARGIN)).toBe(2);
});

test("控えめな自動購入は、コインが採集機の値段の 2 倍に達したときに採集機を買う", () => {
  // 採集機 1 台で毎秒 1。2 台目の値段 11.5 の 2 倍の 23 に 23 秒で届き、11.5 を払う。値段の 11.5 に届いた時点では
  // 買わない。
  const start = state({ collectors: 1, cautiousAutoBuyer: true });

  expect(advance(start, 12).collectors).toBe(1);
  expect(advance(start, 22.9).collectors).toBe(1);
  const first = advance(start, 23.1);
  expect(first.collectors).toBe(2);
  // 値段の 2 倍に許容誤差（1e-9）の範囲で届いた時点で買うため、その分だけ比べる誤差を広げる。
  expect(first.coins).toBeApprox(num(11.5 + 0.1 * 2), 1e-6);

  // 3 台目の値段 13.225 の 2 倍の 26.45 に、さらに (26.45 - 11.5) / 2 = 7.475 秒で届く。
  expect(advance(start, 30.4).collectors).toBe(2);
  const second = advance(start, 30.6);
  expect(second.collectors).toBe(3);
  expect(second.coins).toBeApprox(num(13.225 + 0.125 * 3), 1e-6);
});

test.each([
  {
    name: "控えめな自動購入だけを持てば、値段の 2 倍に達したものだけを買い、値段以上のコインを残す",
    autoBuyer: false,
    cautiousAutoBuyer: true,
    factories: 1,
    coins: 190,
  },
  {
    name: "自動購入を持てば、控えめな自動購入も持っていても、買える額に達したものを買う",
    autoBuyer: true,
    cautiousAutoBuyer: true,
    factories: 2,
    coins: 10,
  },
  {
    name: "自動購入だけを持てば、買える額に達したものを買う",
    autoBuyer: true,
    cautiousAutoBuyer: false,
    factories: 2,
    coins: 10,
  },
  {
    name: "どちらも持たなければ、何も買わない",
    autoBuyer: false,
    cautiousAutoBuyer: false,
    factories: 0,
    coins: 340,
  },
] as const)("$name", ({ autoBuyer, cautiousAutoBuyer, factories, coins }) => {
  // 採集機 20 台。340 コインで、21 台目の採集機（約 163.67、2 倍は約 327.3）と 1 つ目の工場（150、2 倍は 300）は
  // どちらも値段の 2 倍に届き、値段あたりの増分が大きい工場を買う。残りの 190 では、2 つ目の工場（180）と採集機は
  // 買える額だが、値段の 2 倍には届かない。
  const after = advance(
    state({ coins: num(340), totalEarned: num(340), collectors: 20, autoBuyer, cautiousAutoBuyer }),
    0,
  );

  expect(counts(after)).toStrictEqual({ collectors: 20, factories, mints: 0, upgrades: 0 });
  expect(after.coins).toBeApprox(num(coins));
});

test("控えめな自動購入は、工場の値段の 2 倍に届いても、累計の生産量が解放の条件に届くまで待ち、届いた時刻に買う", () => {
  // 採集機 20 台で毎秒 20。累計 100 で工場が解放されるのは 5 秒で、工場の値段 150 の 2 倍の 300 に届くのは 15 秒、
  // 採集機の値段の 2 倍（約 327.3）に届くのは約 16.4 秒。15 秒に工場を買い、そこからは毎秒 30。
  const start = state({ collectors: 20, cautiousAutoBuyer: true });

  expect(advance(start, 14.9).factories).toBe(0);
  const after = advance(start, 15.1);
  expect(counts(after)).toStrictEqual({ collectors: 20, factories: 1, mints: 0, upgrades: 0 });
  expect(after.coins).toBeApprox(num(150 + 0.1 * 30), 1e-6);

  // 工場の解放の前でも、値段の 2 倍に届いた採集機は買う。採集機 9 台で毎秒 9。10 台目の値段（約 35.18）の 2 倍に
  // 約 7.82 秒で届き、累計 100（工場の解放）に届くのは約 11.1 秒。
  const early = state({ collectors: 9, cautiousAutoBuyer: true });
  expect(advance(early, 7.7).collectors).toBe(9);
  expect(advance(early, 7.9).collectors).toBe(10);
});

test("控えめな自動購入は、値段の 2 倍に届く直前で区切っても、一度に進めたときと同じ時刻に買う", () => {
  const start = state({ collectors: 1, cautiousAutoBuyer: true });
  const online = advance(advance(start, 23 - 1e-8), 0.5);
  const offline = advance(start, 23 - 1e-8 + 0.5);

  expect(counts(online)).toStrictEqual(counts(offline));
  expect(online.collectors).toBe(2);
  expect(online.coins).toBeApprox(offline.coins, 1e-6);
});

test("控えめな自動購入は、コインが値段の 2 倍の許容誤差の境目ちょうどにあれば、経過時間 0 でも買う", () => {
  const base = state({ collectors: 4, cautiousAutoBuyer: true });
  const atFloor = { ...base, coins: toleranceFloor(mul(collectorCost(base), num(2))) };

  expect(advance(atFloor, 0).collectors).toBe(5);
  expect(counts(advance(atFloor, 0))).toStrictEqual(counts(advance(atFloor, 1e-12)));
});
