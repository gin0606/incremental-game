import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { FACTORY_LINK_UNLOCK_EARNED, initialState, withPurchase } from "../core/game.ts";
import { num } from "../core/num.ts";
import { flooredDisplay } from "./view.arbitrary.ts";
import { view } from "./view.ts";

// 交易所の後に解放される工場の連携の、次の解放の表示と店の行。ほかの要素の解放は view.unlock.test.ts。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 店で工場の連携が並ぶ位置（最後の行）。 */
const ROW = 10;

const rule = "（工場の生産が、持っている工場 1 台につき、連携の無いときの 1% ずつ増える）";

test("工場の連携の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、工場の連携を並べてすべて解放済みと示す", () => {
  const condition = "工場の連携: これまでに生産したコインが 1.05e9 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(1.05e9 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(1.04e9) })).nextUnlock).toBe(
    `${condition}（あと 10000000）`,
  );
  expect(view(state({ totalEarned: num(1_049_999_998) })).nextUnlock).toBe(
    `${condition}（あと 2）`,
  );
  expect(view(state({ totalEarned: num(1.04e9) })).shop[ROW]?.visible).toBe(false);
  expect(withinTolerance.nextUnlock).toBe("なし（すべて解放済み）");
  expect(withinTolerance.shop[ROW]?.visible).toBe(true);
  expect(withinTolerance.shop).toHaveLength(ROW + 1);
});

test("工場の連携が解放されたら、工場の連携を店の最後に並べる。買うと得られるものと、買った数を示す", () => {
  const current = view(
    state({
      coins: num(3.3e8),
      totalEarned: FACTORY_LINK_UNLOCK_EARNED,
      collectors: 3,
      factories: 50,
      factoryLinks: 1,
      autoBuyer: true,
    }),
  );

  // 工場 1 台は 10 × (1 + 0.01 × 1 × 50) = 15 で、毎秒の生産は 3 + 50 × 15 = 753。連携をもう 1 つ買うと工場 1 台が
  // 20 になり、毎秒の生産が 250 増える。
  expect(current).toMatchObject({ production: "753", factoryLinks: "1" });
  expect(current.shop[ROW]).toStrictEqual({
    action: { type: "buyFactoryLink" },
    label: "工場の連携を買う（288000000 コイン）",
    effect: `買うと毎秒の生産が 250 増える${rule}`,
    visible: true,
    affordable: true,
  });
});

test("工場の連携の、買うと増えると示す毎秒の生産は、毎秒の生産が 10 億未満で表示で切り上がる端数が無い間、買った後に示す毎秒の生産と今のものとの差か、それより 1 だけ小さい", () => {
  // 増分も毎秒の生産も端数を切り捨てて示すため、差は切り捨てた増分か、端数の和が 1 を超えた分だけ大きくなる。
  fc.assert(
    fc.property(flooredDisplay({ type: "buyFactoryLink" }), (current) => {
      const after = withPurchase(current, { type: "buyFactoryLink" });
      const difference = Number(view(after).production) - Number(view(current).production);

      expect([
        `買うと毎秒の生産が ${difference} 増える${rule}`,
        `買うと毎秒の生産が ${difference - 1} 増える${rule}`,
      ]).toContain(view(current).shop[ROW]?.effect);
    }),
  );
});
