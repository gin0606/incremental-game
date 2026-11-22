import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { REFINERY_UNLOCK_EARNED, initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { view } from "./view.ts";

// 造幣所の後に解放される精錬所の、次の解放の表示と店の行。ほかの要素の解放は view.unlock.test.ts。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 精錬所の解放の条件にちょうど届いたときの、次の交易所の解放の表示。 */
const exchangeAfterRefinery =
  "交易所: これまでに生産したコインが 750000000 に達すると解放（あと 300000000）";

test("精錬所の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、精錬所を並べて次の交易所の条件を示す", () => {
  const condition = "精錬所: これまでに生産したコインが 450000000 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(4.5e8 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(4.4e8) })).nextUnlock).toBe(`${condition}（あと 10000000）`);
  expect(view(state({ totalEarned: num(449_999_999.5) })).nextUnlock).toBe(
    `${condition}（あと 1）`,
  );
  expect(withinTolerance.nextUnlock).toMatch(/^交易所: /v);
  expect(withinTolerance.shop[6]?.visible).toBe(true);
  expect(withinTolerance.shop[7]?.visible).toBe(false);
});

test("精錬所が解放されたら次の交易所の条件を示し、精錬所を並べる。買うと得られるものと、買った数を示す", () => {
  const current = view(
    state({
      coins: num(3.3e7),
      totalEarned: REFINERY_UNLOCK_EARNED,
      collectors: 3,
      factories: 2,
      refineries: 1,
      autoBuyer: true,
    }),
  );

  // 毎秒の生産は 3 + 20 + 100 = 123。
  expect(current).toMatchObject({
    production: "123",
    refineries: "1",
    nextUnlock: exchangeAfterRefinery,
  });
  expect(current.shop[6]).toStrictEqual({
    action: { type: "buyRefinery" },
    label: "精錬所を買う（32400000 コイン）",
    effect: "買うと毎秒の生産が 100 増える",
    visible: true,
    affordable: true,
  });
});
