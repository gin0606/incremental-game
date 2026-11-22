import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { advance, initialState } from "../core/game.ts";
import { mul, num } from "../core/num.ts";
import { formatDuration, view } from "./view.ts";

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test("待ち時間は、生産でコインが増えるにつれて縮み、届くと買える表示に変わる", () => {
  // 採集機の値段 11.5 に、採集機 1 台の毎秒 1 で届く。
  expect(view(advance(initialState, 5)).nextPurchase).toBe("今の生産のままで約 7 秒");
  expect(view(advance(initialState, 11)).nextPurchase).toBe("今の生産のままで約 1 秒");
  expect(view(advance(initialState, 11.5)).nextPurchase).toBe("今買える");
});

test("解放されている品物どうしでは、待ち時間は最も安い品物の値段に届くまでの時間", () => {
  // 採集機は約 662、工場は 150、自動購入は 300000。工場までの 150 を毎秒 30 で割る。
  const current = view(state({ totalEarned: num(1000), collectors: 30 }));

  expect(current.nextPurchase).toBe("今の生産のままで約 5 秒");
});

test("買い終えた品物は、より安くても待ち時間に数えない", () => {
  // 買い終えた自動購入（300000）は、採集機（約 1.2e7）、工場（約 8.5e6）、改良（約 4.4e7）より安い。造幣所は
  // 解放の条件 1.5e8 まで遠い。工場までの約 8.5e6 を毎秒 700 × 1.25^10 で割る。
  const bought = view(
    state({ totalEarned: num(6e6), collectors: 100, factories: 60, upgrades: 10, autoBuyer: true }),
  );

  expect(bought.nextPurchase).toBe("今の生産のままで約 21 分 37 秒");
});

/**
 * 自動購入を買い終えた、採集機 100 台と工場 60 台（毎秒 700）の状態の待ち時間。採集機（約 1.2e7）と工場（約 8.5e6）は、
 * 解放の前の改良（400000、解放の条件 6e6）より高い。
 */
const waitBeforeUpgrade = (totalEarned: number, coins: number): string =>
  view(
    state({
      coins: num(coins),
      totalEarned: num(totalEarned),
      collectors: 100,
      factories: 60,
      autoBuyer: true,
    }),
  ).nextPurchase;

test("解放の前の品物は、解放の条件と値段の両方に届くまでの時間で待ち時間に数える", () => {
  // 条件まであと 1e6 で、値段に届くより遅い。
  expect(waitBeforeUpgrade(5e6, 0)).toBe("今の生産のままで約 23 分 49 秒");
  // 値段まであと 400000 で、条件に届くより遅い。
  expect(waitBeforeUpgrade(5.9e6, 0)).toBe("今の生産のままで約 9 分 32 秒");
  // 値段のコインを持っていれば、条件に届くまで。
  expect(waitBeforeUpgrade(5.99e6, 4e5)).toBe("今の生産のままで約 15 秒");
});

test("まだ買っていない自動購入は、見えている品物として待ち時間に数える", () => {
  // 自動購入（300000）は、採集機（約 2.9e6）と工場（約 1.4e6）より安い。毎秒 590。
  const current = view(state({ totalEarned: num(1e6), collectors: 90, factories: 50 }));

  expect(current.nextPurchase).toBe("今の生産のままで約 8 分 29 秒");
});

test("造幣所を持っていれば、解放の条件に届いていなくても、値段に届くまでの時間で数える", () => {
  // 造幣所 4 台（値段約 1.46e7）を持ち、累計 8e7 は解放の条件 1.5e8 に届かない。ほかの品物は造幣所より高い
  // （改良は約 1.72e7）。1.4641e7 を毎秒 1320 × 1.25^8 ≈ 7868 で割る。
  const current = view(
    state({
      totalEarned: num(8e7),
      collectors: 200,
      factories: 100,
      mints: 4,
      upgrades: 8,
      autoBuyer: true,
    }),
  );

  expect(current.nextPurchase).toBe("今の生産のままで約 31 分 1 秒");
});

test("細かく刻んで進めたときの誤差で、待ち時間を 1 秒長く見せない", () => {
  let current = initialState;
  for (let tick = 0; tick < 55; tick += 1) {
    current = advance(current, 0.1);
  }

  // コインは 5.5 に誤差が乗った値で、残りは 6 秒。
  expect(view(current).nextPurchase).toBe("今の生産のままで約 6 秒");
});

test("生産が無ければ、届かないことを示す", () => {
  expect(view(state({ collectors: 0 })).nextPurchase).toBe("生産が無いため届かない");
});

test("生産が止まっている間は、そのことと、再開までと、それを含めた待ち時間を切り上げて示す", () => {
  // 再開まで 0.2 秒、買えるまで 0.2 + 11.5 秒。
  expect(view(initialState, 0.2).nextPurchase).toBe(
    "時計が戻ったため生産が止まっている（再開まで約 1 秒）。止まっている間を含めて約 12 秒",
  );
  expect(view(initialState, 0).nextPurchase).toBe("今の生産のままで約 12 秒");
});

test("生産が止まっている間も、今買える品物があれば買える表示、生産が無ければ届かない表示にする", () => {
  expect(view(advance(initialState, 11.5), 60).nextPurchase).toBe("今買える");
  expect(view(state({ collectors: 0 }), 60).nextPurchase).toBe("生産が無いため届かない");
});

const DAY = 86_400;

test.each([
  { seconds: 0.2, expected: "1 秒" },
  { seconds: 59, expected: "59 秒" },
  { seconds: 59.5, expected: "1 分 0 秒" },
  { seconds: 61, expected: "1 分 1 秒" },
  { seconds: 3599, expected: "59 分 59 秒" },
  { seconds: 3600, expected: "1 時間 0 分" },
  { seconds: 3601, expected: "1 時間 1 分" },
  { seconds: DAY - 60, expected: "23 時間 59 分" },
  { seconds: DAY - 59, expected: "1 日 0 時間" },
  { seconds: DAY + 3601, expected: "1 日 2 時間" },
  { seconds: (1e9 - 1) * DAY + 5 * 3600, expected: "999999999 日 5 時間" },
  { seconds: 1e9 * DAY, expected: "1.00e9 日" },
  { seconds: 1.2345e9 * DAY, expected: "1.24e9 日" },
] as const)("切り上げると $seconds 秒は「$expected」", ({ seconds, expected }) => {
  expect(formatDuration(num(seconds), "up")).toBe(expected);
});

test.each([
  { seconds: 0.9, expected: "0 秒" },
  // 有効数字 12 桁に丸めてから切り捨て、誤差で 1 秒短く見せない。
  { seconds: 6 - 4e-14, expected: "6 秒" },
  { seconds: 59.9, expected: "59 秒" },
  { seconds: 60, expected: "1 分 0 秒" },
  { seconds: 3599.9, expected: "59 分 59 秒" },
  { seconds: 3659.9, expected: "1 時間 0 分" },
  { seconds: 3660, expected: "1 時間 1 分" },
  { seconds: DAY - 1, expected: "23 時間 59 分" },
  { seconds: DAY, expected: "1 日 0 時間" },
  { seconds: 2 * DAY - 1, expected: "1 日 23 時間" },
  { seconds: (1e9 - 1) * DAY + 5 * 3600, expected: "999999999 日 5 時間" },
  { seconds: 1e9 * DAY, expected: "1.00e9 日" },
  { seconds: 1.2349e9 * DAY, expected: "1.23e9 日" },
] as const)("切り捨てると $seconds 秒は「$expected」", ({ seconds, expected }) => {
  expect(formatDuration(num(seconds), "down")).toBe(expected);
});

test("number で表せない長さも、日数で示す", () => {
  expect(formatDuration(mul(num(1e300), num(1e300)), "up")).toBe("1.16e595 日");
  expect(formatDuration(mul(num(1e300), num(1e300)), "down")).toBe("1.15e595 日");
});
