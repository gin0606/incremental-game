import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { gameState } from "../core/game.arbitrary.ts";
import { withPurchase } from "../core/game.ts";
import { flooredDisplay } from "./view.arbitrary.ts";
import { view } from "./view.ts";

// 店の、施設と改良を買うと増えると示す毎秒の生産と、買った後に示す毎秒の生産との関係。工具の支給・採集機の改修・
// 工場の連携の同じ性質は、それぞれの view.*.test.ts。

const producers = [
  { index: 0, action: { type: "buyCollector" } },
  { index: 3, action: { type: "buyFactory" } },
  { index: 7, action: { type: "buyMint" } },
  { index: 8, action: { type: "buyRefinery" } },
  { index: 9, action: { type: "buyExchange" } },
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
  "$action.type: 改良と工場の連携と工具の支給が無く、毎秒の生産が 10 億未満の間、買うと増えると示す毎秒の生産は、買った後に示す毎秒の生産と今のものとの差に等しい",
  ({ index, action }) => {
    fc.assert(
      fc.property(
        gameState.map((generated): GameState => ({
          ...generated,
          upgrades: 0,
          factoryLinks: 0,
          toolSupplies: 0,
        })),
        (current) => {
          const { shown, difference } = shownGain(current, index, action);

          expect(shown).toBe(`買うと毎秒の生産が ${difference} 増える`);
        },
      ),
    );
  },
);

test.each(producers)(
  "$action.type: 改良や工場の連携や工具の支給で毎秒の生産に端数があると、毎秒の生産が 10 億未満で表示で切り上がる端数が無い間、買った後に示す毎秒の生産と今のものとの差は、示した増分か、それより 1 だけ大きい",
  ({ index, action }) => {
    // 増分も毎秒の生産も端数を切り捨てて示すため、差は切り捨てた増分か、端数の和が 1 を超えた分だけ大きくなる。
    fc.assert(
      fc.property(flooredDisplay(action), (current) => {
        const { shown, difference } = shownGain(current, index, action);

        expect([
          `買うと毎秒の生産が ${difference} 増える`,
          `買うと毎秒の生産が ${difference - 1} 増える`,
        ]).toContain(shown);
      }),
    );
  },
);

test("改良: 毎秒の生産が 10 億未満で表示で切り上がる端数が無い間、買った後に示す毎秒の生産と今のものとの差は、示した増分か、それより 1 だけ大きい", () => {
  const action = { type: "buyUpgrade" } as const;
  const rule = "（すべての施設の生産が 1.25 倍になる）";
  fc.assert(
    fc.property(flooredDisplay(action), (current) => {
      const difference =
        Number(view(withPurchase(current, action)).production) - Number(view(current).production);

      expect([
        `買うと毎秒の生産が ${difference} 増える${rule}`,
        `買うと毎秒の生産が ${difference - 1} 増える${rule}`,
      ]).toContain(view(current).shop[4]?.effect);
    }),
  );
});
