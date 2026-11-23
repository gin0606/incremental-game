import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { TOOL_SUPPLY_UNLOCK_EARNED, initialState, withPurchase } from "../core/game.ts";
import { num } from "../core/num.ts";
import { flooredDisplay } from "./view.arbitrary.ts";
import { view } from "./view.ts";

// 改良と採集機の改修の間に解放される工具の支給の、次の解放の表示と店の行。ほかの要素の解放は view.unlock.test.ts。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 店で工具の支給が並ぶ位置（改良の次）。 */
const ROW = 5;

const rule = "（採集機の生産が、持っている工場 1 台につき、支給の無いときの 0.25% ずつ増える）";

test("工具の支給の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、工具の支給を並べて次の採集機の改修の条件を示す", () => {
  const condition = "工具の支給: これまでに生産したコインが 35000000 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(3.5e7 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(2.5e7) })).nextUnlock).toBe(`${condition}（あと 10000000）`);
  expect(view(state({ totalEarned: num(34_999_999.5) })).nextUnlock).toBe(`${condition}（あと 1）`);
  expect(view(state({ totalEarned: num(2.5e7) })).shop[ROW]?.visible).toBe(false);
  expect(withinTolerance.nextUnlock).toMatch(/^採集機の改修: /v);
  expect(withinTolerance.shop[ROW]?.visible).toBe(true);
  expect(withinTolerance.shop[ROW + 1]?.visible).toBe(false);
});

test("工具の支給が解放されたら次の採集機の改修の条件を示し、工具の支給を並べる。買うと得られるものと、買った数を示す", () => {
  const current = view(
    state({
      coins: num(2.3e7),
      totalEarned: TOOL_SUPPLY_UNLOCK_EARNED,
      collectors: 100,
      factories: 40,
      toolSupplies: 1,
      autoBuyer: true,
    }),
  );

  // 採集機 1 台は 1 + 0.0025 × 1 × 40 = 1.1 で、毎秒の生産は 100 × 1.1 + 40 × 10 = 510。支給をもう 1 つ買うと採集機
  // 1 台が 1.2 になり、毎秒の生産が 10 増える。
  expect(current).toMatchObject({
    production: "510",
    toolSupplies: "1",
    nextUnlock: "採集機の改修: これまでに生産したコインが 75000000 に達すると解放（あと 40000000）",
  });
  expect(current.shop[ROW]).toStrictEqual({
    action: { type: "buyToolSupply" },
    label: "工具の支給を買う（22000000 コイン）",
    effect: `買うと毎秒の生産が 10 増える${rule}`,
    visible: true,
    affordable: true,
  });
});

test("工具の支給の、買うと増えると示す毎秒の生産は、毎秒の生産が 10 億未満で表示で切り上がる端数が無い間、買った後に示す毎秒の生産と今のものとの差か、それより 1 だけ小さい", () => {
  // 増分も毎秒の生産も端数を切り捨てて示すため、差は切り捨てた増分か、端数の和が 1 を超えた分だけ大きくなる。
  fc.assert(
    fc.property(flooredDisplay({ type: "buyToolSupply" }), (current) => {
      const after = withPurchase(current, { type: "buyToolSupply" });
      const difference = Number(view(after).production) - Number(view(current).production);

      expect([
        `買うと毎秒の生産が ${difference} 増える${rule}`,
        `買うと毎秒の生産が ${difference - 1} 増える${rule}`,
      ]).toContain(view(current).shop[ROW]?.effect);
    }),
  );
});
