import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { EXCHANGE_UNLOCK_EARNED, initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { view } from "./view.ts";

// 精錬所の後に解放される交易所の、次の解放の表示と店の行。交易所の後に解放される工場の連携は
// view.factory-link.test.ts、ほかの要素の解放は view.unlock.test.ts。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 交易所の解放の後の、次の解放の表示（工場の連携の条件）の、残りの前まで。 */
const factoryLinkCondition = "工場の連携: これまでに生産したコインが 1.05e9 に達すると解放";

test("交易所の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、条件を示さずに交易所を並べる", () => {
  const condition = "交易所: これまでに生産したコインが 750000000 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(7.5e8 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(7.4e8) })).nextUnlock).toBe(`${condition}（あと 10000000）`);
  expect(view(state({ totalEarned: num(749_999_999) })).nextUnlock).toBe(`${condition}（あと 1）`);
  expect(withinTolerance.nextUnlock).toBe(`${factoryLinkCondition}（あと 300000001）`);
  expect(withinTolerance.shop[8]?.visible).toBe(true);
});

test("交易所が解放されたら次の工場の連携の解放の条件を示し、交易所を並べる。買うと得られるものと、買った数を示す", () => {
  const current = view(
    state({
      coins: num(4.3e7),
      totalEarned: EXCHANGE_UNLOCK_EARNED,
      collectors: 3,
      factories: 2,
      exchanges: 1,
      autoBuyer: true,
    }),
  );

  // 毎秒の生産は 3 + 20 + 300 = 323。
  expect(current).toMatchObject({
    production: "323",
    exchanges: "1",
    nextUnlock: `${factoryLinkCondition}（あと 300000000）`,
  });
  expect(current.shop[8]).toStrictEqual({
    action: { type: "buyExchange" },
    label: "交易所を買う（42400000 コイン）",
    effect: "買うと毎秒の生産が 300 増える",
    visible: true,
    affordable: true,
  });
});
