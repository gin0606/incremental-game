import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import { advance, factoryLinkCost, factoryProduction, initialState, production } from "./game.ts";
import { num } from "./num.ts";

// 交易所より後に解放される工場の連携の値段と、生産への効き方と、自動購入が工場の増分にそれを含めること。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { factoryLinks: 0, expected: 3.6e7 },
  { factoryLinks: 1, expected: 2.88e8 },
  { factoryLinks: 3, expected: 3.6e7 * 8 ** 3 },
] as const)("工場の連携の値段は 3.6e7 × 8^数（$factoryLinks）", ({ factoryLinks, expected }) => {
  expect(factoryLinkCost(state({ factoryLinks }))).toBeApprox(num(expected));
});

test.each([
  { factories: 5, factoryLinks: 0, expected: 10 },
  { factories: 5, factoryLinks: 1, expected: 10.5 },
  { factories: 50, factoryLinks: 2, expected: 20 },
  { factories: 0, factoryLinks: 3, expected: 10 },
] as const)(
  "工場 1 台の、改良の倍率を掛ける前の毎秒の生産は 10 × (1 + 0.01 × 連携の数 × 工場の台数)（工場 $factories、連携 $factoryLinks）",
  ({ factories, factoryLinks, expected }) => {
    expect(factoryProduction(state({ factories, factoryLinks, upgrades: 3 }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { collectors: 3, factories: 2, factoryLinks: 0, upgrades: 0, expected: 23 },
  { collectors: 3, factories: 2, factoryLinks: 1, upgrades: 0, expected: 3 + 2 * 10.2 },
  { collectors: 3, factories: 50, factoryLinks: 2, upgrades: 0, expected: 3 + 50 * 20 },
  { collectors: 3, factories: 50, factoryLinks: 2, upgrades: 2, expected: 1003 * 1.25 ** 2 },
  { collectors: 3, factories: 0, factoryLinks: 2, upgrades: 0, expected: 3 },
] as const)(
  "工場の連携は工場の生産だけを増やし、その上に改良の倍率が掛かる（採集機 $collectors、工場 $factories、連携 $factoryLinks、改良 $upgrades）",
  ({ collectors, factories, factoryLinks, upgrades, expected }) => {
    expect(production(state({ collectors, factories, factoryLinks, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { factoryLinks: 2, expected: [62, 51] },
  { factoryLinks: 0, expected: [73, 50] },
] as const)(
  "自動購入は、工場の連携を持てば、工場の増分に、足した 1 台が持っている工場それぞれに足す生産を含めて採集機と比べる（連携 $factoryLinks）",
  ({ factoryLinks, expected }) => {
    // 工場 51 台目は 150 × 1.2^50 ≈ 1.37e6 で、連携 2 つなら増分 10 × (1 + 0.02 × 101) = 30.2（値段あたり約 2.2e-5）、
    // 連携が無ければ 10（約 7.3e-6）。採集機 63 台目は 10 × 1.15^62 ≈ 5.80e4 で増分 1（約 1.7e-5）。1.42e6 コインでは、
    // 工場を先に買うと採集機に届かず、採集機を先に買うと工場に届かないので、連携が無ければ採集機を買えるだけ買う。
    const start = state({
      coins: num(1.42e6),
      totalEarned: num(1.42e6),
      collectors: 62,
      factories: 50,
      factoryLinks,
      autoBuyer: true,
    });
    const after = advance(start, 0);

    expect([after.collectors, after.factories]).toStrictEqual(expected);
  },
);
