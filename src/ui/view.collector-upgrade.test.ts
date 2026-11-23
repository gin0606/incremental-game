import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { gameState } from "../core/game.arbitrary.ts";
import {
  COLLECTOR_UPGRADE_UNLOCK_EARNED,
  initialState,
  production,
  withPurchase,
} from "../core/game.ts";
import { num, toNumber } from "../core/num.ts";
import { flooredDisplay } from "./view.arbitrary.ts";
import { view } from "./view.ts";

// 改良と造幣所の間に解放される採集機の改修の、次の解放の表示と店の行。ほかの要素の解放は view.unlock.test.ts。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 店で採集機の改修が並ぶ位置。 */
const ROW = 6;

const rule = "（採集機の生産が 2 倍になる）";

test("採集機の改修の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、採集機の改修を並べて次の造幣所の条件を示す", () => {
  const condition = "採集機の改修: これまでに生産したコインが 75000000 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(7.5e7 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(6.5e7) })).nextUnlock).toBe(`${condition}（あと 10000000）`);
  expect(view(state({ totalEarned: num(74_999_999.5) })).nextUnlock).toBe(`${condition}（あと 1）`);
  expect(view(state({ totalEarned: num(6.5e7) })).shop[ROW]?.visible).toBe(false);
  expect(withinTolerance.nextUnlock).toMatch(/^造幣所: /v);
  expect(withinTolerance.shop[ROW]?.visible).toBe(true);
  expect(withinTolerance.shop[ROW + 1]?.visible).toBe(false);
});

test("採集機の改修が解放されたら次の造幣所の条件を示し、採集機の改修を並べる。買うと得られるものと、買った数を示す", () => {
  const current = view(
    state({
      coins: num(4.1e7),
      totalEarned: COLLECTOR_UPGRADE_UNLOCK_EARNED,
      collectors: 3,
      factories: 2,
      collectorUpgrades: 1,
      autoBuyer: true,
    }),
  );

  // 毎秒の生産は 3 × 2 + 20 = 26。採集機の改修を買うと、採集機 3 台の毎秒 6 が 12 になる。
  expect(current).toMatchObject({
    production: "26",
    collectorUpgrades: "1",
    nextUnlock: "造幣所: これまでに生産したコインが 200000000 に達すると解放（あと 125000000）",
  });
  expect(current.shop[ROW]).toStrictEqual({
    action: { type: "buyCollectorUpgrade" },
    label: "採集機の改修を買う（40000000 コイン）",
    effect: `買うと毎秒の生産が 6 増える${rule}`,
    visible: true,
    affordable: true,
  });
});

test("採集機の改修: 毎秒の生産が 10 億未満で表示で切り上がる端数が無い間、買った後に示す毎秒の生産と今のものとの差は、示した増分か、それより 1 だけ大きい", () => {
  const action = { type: "buyCollectorUpgrade" } as const;
  // 増分も毎秒の生産も端数を切り捨てて示すため、差は切り捨てた増分か、端数の和が 1 を超えた分だけ大きくなる。
  fc.assert(
    fc.property(flooredDisplay(action), (current) => {
      const difference =
        Number(view(withPurchase(current, action)).production) - Number(view(current).production);

      expect([
        `買うと毎秒の生産が ${difference} 増える${rule}`,
        `買うと毎秒の生産が ${difference - 1} 増える${rule}`,
      ]).toContain(view(current).shop[ROW]?.effect);
    }),
  );
});

test("採集機の改修: 改良と工具の支給が無く、毎秒の生産が 10 億未満の間、買うと増えると示す毎秒の生産は、買った後に示す毎秒の生産と今のものとの差に等しい", () => {
  const action = { type: "buyCollectorUpgrade" } as const;
  fc.assert(
    fc.property(
      gameState.map((generated): GameState => ({ ...generated, upgrades: 0, toolSupplies: 0 })),
      (current) => {
        fc.pre(toNumber(production(withPurchase(current, action))) < 1e9);
        const difference =
          Number(view(withPurchase(current, action)).production) - Number(view(current).production);

        expect(view(current).shop[ROW]?.effect).toBe(
          `買うと毎秒の生産が ${difference} 増える${rule}`,
        );
      },
    ),
  );
});

test("造幣所を持っていれば、採集機の改修の解放の条件に届いていなくても、採集機の改修を値段に届くまでの時間で数える", () => {
  // 造幣所の条件が 5e7 だった版の保存。造幣所 1 台を持ち、累計 6e7 は採集機の改修の条件 7.5e7 に届かない（条件までは
  // 約 34 分 7 秒）。ほかの品物は採集機の改修（5e6）より高い（造幣所は 1.1e7、工具の支給は 2.2e7）。工具の支給 1 つで
  // 採集機 160 台が毎秒 200 を生み、5e6 を毎秒 1230 × 1.25^8 ≈ 7331 で割り、秒を切り上げる。
  const current = view(
    state({
      totalEarned: num(6e7),
      collectors: 160,
      factories: 100,
      mints: 1,
      upgrades: 8,
      toolSupplies: 1,
      autoBuyer: true,
    }),
  );

  expect(current.nextPurchase).toBe("今の生産のままで約 11 分 23 秒");
});
