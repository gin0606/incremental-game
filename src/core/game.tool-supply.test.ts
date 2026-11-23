import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import { advance, collectorProduction, initialState, production, toolSupplyCost } from "./game.ts";
import { num } from "./num.ts";

// 改良と採集機の改修の間に解放される工具の支給の値段と、生産への効き方と、自動購入が工場の増分にそれを含めること。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { toolSupplies: 0, expected: 2.2e6 },
  { toolSupplies: 1, expected: 2.2e7 },
  { toolSupplies: 3, expected: 2.2e9 },
] as const)("工具の支給の値段は 2.2e6 × 10^数（$toolSupplies）", ({ toolSupplies, expected }) => {
  expect(toolSupplyCost(state({ toolSupplies }))).toBeApprox(num(expected));
});

test.each([
  { factories: 40, toolSupplies: 0, collectorUpgrades: 0, expected: 1 },
  { factories: 40, toolSupplies: 1, collectorUpgrades: 0, expected: 1.1 },
  { factories: 40, toolSupplies: 2, collectorUpgrades: 1, expected: 2 * 1.2 },
  { factories: 0, toolSupplies: 3, collectorUpgrades: 0, expected: 1 },
] as const)(
  "採集機 1 台の、改良の倍率を掛ける前の毎秒の生産は 2^改修の数 × (1 + 0.0025 × 支給の数 × 工場の台数)（工場 $factories、支給 $toolSupplies、改修 $collectorUpgrades）",
  ({ factories, toolSupplies, collectorUpgrades, expected }) => {
    expect(
      collectorProduction(state({ factories, toolSupplies, collectorUpgrades, upgrades: 3 })),
    ).toBeApprox(num(expected));
  },
);

test.each([
  { collectors: 10, factories: 40, toolSupplies: 0, upgrades: 0, expected: 410 },
  { collectors: 10, factories: 40, toolSupplies: 2, upgrades: 0, expected: 10 * 1.2 + 400 },
  { collectors: 10, factories: 40, toolSupplies: 2, upgrades: 1, expected: 412 * 1.25 },
  { collectors: 0, factories: 40, toolSupplies: 2, upgrades: 0, expected: 400 },
] as const)(
  "工具の支給は採集機の生産だけを増やし、その上に改良の倍率が掛かる（採集機 $collectors、工場 $factories、支給 $toolSupplies、改良 $upgrades）",
  ({ collectors, factories, toolSupplies, upgrades, expected }) => {
    expect(production(state({ collectors, factories, toolSupplies, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { toolSupplies: 1, expected: [58, 1] },
  { toolSupplies: 0, expected: [56, 2] },
] as const)(
  "自動購入は、工具の支給を持てば、工場の増分に、足した 1 台が採集機それぞれに足す生産を含めて造幣所と比べる（支給 $toolSupplies）",
  ({ toolSupplies, expected }) => {
    // 工場 57 台目は 150 × 1.2^56 ≈ 4.08e6 で、支給が無ければ増分 10（値段あたり約 2.45e-6）。採集機の改修 3 つで採集機
    // 1 台は毎秒 8 なので、支給 1 つなら採集機 200 台がそれぞれ 8 × 0.0025 = 0.02 増え、増分は 14（約 3.43e-6）。造幣所
    // 2 台目は 1.1e7 で増分 30（約 2.73e-6）。1.15e7 コインでは、造幣所を先に買うと工場に届かず、工場を先に買うと造幣所に
    // 届かない（残りで工場をもう 1 台買う）。採集機と採集機の改修は値段が高く、改良はまだ解放されていない。
    const start = state({
      coins: num(1.15e7),
      totalEarned: num(1.15e7),
      collectors: 200,
      factories: 56,
      mints: 1,
      collectorUpgrades: 3,
      toolSupplies,
      autoBuyer: true,
    });
    const after = advance(start, 0);

    expect([after.factories, after.mints]).toStrictEqual(expected);
  },
);
