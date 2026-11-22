import * as fc from "fast-check";
import { assert, expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { gameState } from "../core/game.arbitrary.ts";
import { advance, initialState, perform, production, withPurchase } from "../core/game.ts";
import { mul, num, toNumber } from "../core/num.ts";
import { awayPanel, view } from "./view.ts";

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 解放の前の、造幣所を買う品物（台数 0）。 */
const lockedMint = {
  action: { type: "buyMint" },
  label: "造幣所を買う（10000000 コイン）",
  effect: "買うと毎秒の生産が 30 増える",
  visible: false,
  affordable: false,
} as const;

/** 解放の前の、改良を買う品物（数 0）。 */
const lockedUpgrade = (gain: number) =>
  ({
    action: { type: "buyUpgrade" },
    label: "改良を買う（400000 コイン）",
    effect: `買うと毎秒の生産が ${gain} 増える（すべての施設の生産が 1.25 倍になる）`,
    visible: false,
    affordable: false,
  }) as const;

const autoBuyerWork = "採集機・工場・造幣所・改良を、買える額に達するたびに自動で買う";

test("初期状態では採集機と自動購入を並べ、工場・改良・造幣所は解放されるまで隠して工場の解放の条件を示す。どれもまだ買えない。品物ごとに買うと得られるものを示す", () => {
  expect(view(initialState)).toStrictEqual({
    coins: "0",
    totalEarned: "0",
    production: "1",
    collectors: "1",
    factories: "0",
    mints: "0",
    upgrades: "0",
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
        action: { type: "buyAutoBuyer" },
        label: "自動購入を買う（300000 コイン）",
        effect: autoBuyerWork,
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
      // 採集機 1 台の毎秒 1 の 0.25 倍を切り捨てる。
      lockedUpgrade(0),
      lockedMint,
    ],
  });
});

test("工場が解放されたら改良の解放の条件を示し、工場は買える額があれば買える。自動購入を買い終えたら隠す", () => {
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
    upgrades: "0",
    autoBuyer: "稼働中",
    nextPurchase: "今買える",
    nextUnlock: "改良: これまでに生産したコインが 6000000 に達すると解放（あと 5999000）",
    shop: [
      {
        action: { type: "buyCollector" },
        label: "採集機を買う（16 コイン）",
        effect: "買うと毎秒の生産が 1 増える",
        visible: true,
        affordable: true,
      },
      {
        action: { type: "buyAutoBuyer" },
        label: "自動購入を買う（300000 コイン）",
        effect: autoBuyerWork,
        visible: false,
        affordable: false,
      },
      {
        action: { type: "buyFactory" },
        label: "工場を買う（216 コイン）",
        effect: "買うと毎秒の生産が 10 増える",
        visible: true,
        affordable: false,
      },
      // 毎秒 23 の 0.25 倍の 5.75 を切り捨てる。
      lockedUpgrade(5),
      lockedMint,
    ],
  });
});

const producers = [
  { index: 0, action: { type: "buyCollector" } },
  { index: 2, action: { type: "buyFactory" } },
  { index: 4, action: { type: "buyMint" } },
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

test("離れていた間に進んだことがあれば知らせの欄に出し、無ければ隠す", () => {
  expect(awayPanel("1 時間 離れていた間に 10 コイン生産した")).toStrictEqual({
    hidden: false,
    text: "1 時間 離れていた間に 10 コイン生産した",
  });
  expect(awayPanel()).toStrictEqual({ hidden: true, text: "" });
});
