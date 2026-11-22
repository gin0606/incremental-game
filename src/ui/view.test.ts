import * as fc from "fast-check";
import { assert, expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { gameState } from "../core/game.arbitrary.ts";
import { advance, initialState, perform, production, withPurchase } from "../core/game.ts";
import { mul, num, toNumber } from "../core/num.ts";
import { formatDuration, view } from "./view.ts";

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 解放の前の、造幣所を買う品物（台数 0）。 */
const lockedMint = {
  action: { type: "buyMint" },
  label: "造幣所を買う（5000000 コイン）",
  effect: "買うと毎秒の生産が 30 増える",
  visible: false,
  affordable: false,
} as const;

test("初期状態では採集機と自動購入を並べ、工場と造幣所は解放されるまで隠して工場の解放の条件を示す。どれもまだ買えない。品物ごとに買うと得られるものを示す", () => {
  expect(view(initialState)).toStrictEqual({
    coins: "0",
    totalEarned: "0",
    production: "1",
    collectors: "1",
    factories: "0",
    mints: "0",
    autoBuyer: "なし",
    // 採集機の値段 11.5 に毎秒 1 で届くまで 11.5 秒。切り上げる。
    nextPurchase: "今の生産のままで約 12 秒",
    nextUnlock: "工場: これまでに生産したコインが 100 に達すると解放（あと 100）",
    shop: [
      {
        action: { type: "buyCollector" },
        label: "採集機を買う（12 コイン）",
        effect: "買うと毎秒の生産が 1 増える",
        visible: true,
        affordable: false,
      },
      {
        action: { type: "buyFactory" },
        label: "工場を買う（150 コイン）",
        effect: "買うと毎秒の生産が 10 増える",
        visible: false,
        affordable: false,
      },
      lockedMint,
      {
        action: { type: "buyAutoBuyer" },
        label: "自動購入を買う（300000 コイン）",
        effect: "採集機・工場・造幣所を、買える額に達するたびに自動で買う",
        visible: true,
        affordable: false,
      },
    ],
  });
});

test("工場が解放されたら造幣所の解放の条件を示し、工場は買える額があれば買える。自動購入を買い終えたら隠す", () => {
  const current = view(
    state({
      coins: num(200.7),
      totalEarned: num(1000),
      collectors: 3,
      factories: 2,
      autoBuyer: true,
    }),
  );

  expect(current).toStrictEqual({
    coins: "200",
    totalEarned: "1000",
    production: "23",
    collectors: "3",
    factories: "2",
    mints: "0",
    autoBuyer: "稼働中",
    nextPurchase: "今買える",
    nextUnlock: "造幣所: これまでに生産したコインが 50000000 に達すると解放（あと 49999000）",
    shop: [
      {
        action: { type: "buyCollector" },
        label: "採集機を買う（16 コイン）",
        effect: "買うと毎秒の生産が 1 増える",
        visible: true,
        affordable: true,
      },
      {
        action: { type: "buyFactory" },
        label: "工場を買う（216 コイン）",
        effect: "買うと毎秒の生産が 10 増える",
        visible: true,
        affordable: false,
      },
      lockedMint,
      {
        action: { type: "buyAutoBuyer" },
        label: "自動購入を買う（300000 コイン）",
        effect: "採集機・工場・造幣所を、買える額に達するたびに自動で買う",
        visible: false,
        affordable: false,
      },
    ],
  });
});

const producers = [
  { index: 0, action: { type: "buyCollector" } },
  { index: 1, action: { type: "buyFactory" } },
  { index: 2, action: { type: "buyMint" } },
] as const;

/** 買うと増えると示す毎秒の生産と、買った後に示す毎秒の生産と今のものとの差。 */
const shownGain = (
  current: GameState,
  index: number,
  action: (typeof producers)[number]["action"],
): { readonly shown: string | undefined; readonly difference: number } => ({
  shown: view(current).shop[index]?.effect,
  difference:
    Number(view(withPurchase(current, action)).production) - Number(view(current).production),
});

test.each(producers)(
  "$action.type: 改良が無く、毎秒の生産が 10 億未満の間、買うと増えると示す毎秒の生産は、買った後に示す毎秒の生産と今のものとの差に等しい",
  ({ index, action }) => {
    fc.assert(
      fc.property(
        gameState.map((generated): GameState => ({ ...generated, upgrades: 0 })),
        (current) => {
          const { shown, difference } = shownGain(current, index, action);

          expect(shown).toBe(`買うと毎秒の生産が ${difference} 増える`);
        },
      ),
    );
  },
);

test.each(producers)(
  "$action.type: 改良で毎秒の生産に端数があると、毎秒の生産が 10 億未満の間、買った後に示す毎秒の生産と今のものとの差は、示した増分か、それより 1 だけ大きい",
  ({ index, action }) => {
    // 増分も毎秒の生産も端数を切り捨てて示すため、差は切り捨てた増分か、端数の和が 1 を超えた分だけ大きくなる。
    fc.assert(
      fc.property(gameState, (current) => {
        fc.pre(toNumber(production(withPurchase(current, action))) < 1e9);
        const { shown, difference } = shownGain(current, index, action);

        expect([
          `買うと毎秒の生産が ${difference} 増える`,
          `買うと毎秒の生産が ${difference - 1} 増える`,
        ]).toContain(shown);
      }),
    );
  },
);

test("これまでに生産したコインは、生産で増え、購入で手元のコインが減っても減らない", () => {
  // 採集機 1 台で毎秒 1。手元のコインと同じく、端数は切り捨てる。
  const produced = advance(initialState, 12.7);
  // 採集機の値段 11.5 を払う。
  const bought = perform(produced, { type: "buyCollector" });
  assert.isDefined(bought);
  // 採集機 2 台で毎秒 2。
  const later = advance(bought, 5);

  expect(view(produced)).toMatchObject({ coins: "12", totalEarned: "12" });
  expect(view(bought)).toMatchObject({ coins: "1", totalEarned: "12" });
  expect(view(later)).toMatchObject({ coins: "11", totalEarned: "22" });
});

test("これまでに生産したコインは、手元のコインと同じく 10 億から指数表記で示す", () => {
  expect(view(state({ totalEarned: num(999_999_999.9) })).totalEarned).toBe("999999999");
  expect(view(state({ totalEarned: num(1.2345e9) })).totalEarned).toBe("1.23e9");
  expect(view(state({ totalEarned: mul(num(1e300), num(1e300)) })).totalEarned).toBe("1.00e600");
});

test("待ち時間は、生産でコインが増えるにつれて縮み、届くと買える表示に変わる", () => {
  // 採集機の値段 11.5 に、採集機 1 台の毎秒 1 で届く。
  expect(view(advance(initialState, 5)).nextPurchase).toBe("今の生産のままで約 7 秒");
  expect(view(advance(initialState, 11)).nextPurchase).toBe("今の生産のままで約 1 秒");
  expect(view(advance(initialState, 11.5)).nextPurchase).toBe("今買える");
});

test("待ち時間は、見えている品物のうち最も安いものまでの時間", () => {
  // 採集機は約 662、工場は 150、自動購入は 300000。工場までの 150 を毎秒 30 で割る。
  const current = view(state({ totalEarned: num(1000), collectors: 30 }));

  expect(current.nextPurchase).toBe("今の生産のままで約 5 秒");
});

test("見えていない品物は、より安くても待ち時間に数えない", () => {
  // 買い終えた自動購入（300000）と解放の前の造幣所（5000000）は、採集機（約 1.2e7）と工場（約 8.5e6）より安い。
  // 工場までを毎秒 700 で割る。
  const bought = view(
    state({ totalEarned: num(4e7), collectors: 100, factories: 60, autoBuyer: true }),
  );
  // 解放の前の工場（150）は、採集機（約 164）より安い。採集機までを毎秒 20 で割る。
  const locked = view(state({ collectors: 20 }));

  expect(bought.nextPurchase).toBe("今の生産のままで約 3 時間 22 分");
  expect(locked.nextPurchase).toBe("今の生産のままで約 9 秒");
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
