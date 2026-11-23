import * as fc from "fast-check";
import { assert, expect, test } from "vitest";

import type { Action, GameState } from "../core/game.ts";
import {
  COLLECTOR_UPGRADE_UNLOCK_EARNED,
  FACTORY_UNLOCK_EARNED,
  MINT_UNLOCK_EARNED,
  REFINERY_UNLOCK_EARNED,
  EXCHANGE_UNLOCK_EARNED,
  UPGRADE_UNLOCK_EARNED,
  advance,
  initialState,
  perform,
  production,
} from "../core/game.ts";
import { ZERO, num, toNumber } from "../core/num.ts";
import { deserialize } from "../save/save.ts";
import type { View } from "./view.ts";
import { view } from "./view.ts";

// 次の解放の表示と、解放された品物を店に並べること。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** すべて解放した後の、次の解放の表示。 */
const allUnlocked = "なし（すべて解放済み）";

test("造幣所が解放されたら次の精錬所の条件を示し、造幣所を並べる。買える額があれば買える", () => {
  const current = view(
    state({
      coins: num(1.2e7),
      totalEarned: num(2e8),
      collectors: 3,
      factories: 2,
      mints: 1,
      autoBuyer: true,
    }),
  );

  expect(current).toMatchObject({
    production: "53",
    mints: "1",
    nextUnlock: "精錬所: これまでに生産したコインが 450000000 に達すると解放（あと 250000000）",
  });
  expect(current.shop[6]).toStrictEqual({
    action: { type: "buyMint" },
    label: "造幣所を買う（11000000 コイン）",
    effect: "買うと毎秒の生産が 30 増える",
    visible: true,
    affordable: true,
  });
});

test("改良が解放されたら次の採集機の改修の条件を示し、改良を並べる。買うと得られるものと、買った数を示す", () => {
  const current = view(
    state({
      coins: num(1.3e6),
      totalEarned: UPGRADE_UNLOCK_EARNED,
      collectors: 4,
      factories: 2,
      upgrades: 1,
      autoBuyer: true,
    }),
  );

  // 毎秒の生産は (4 + 20) × 1.25 = 30。改良を買うと 37.5 になる。
  expect(current).toMatchObject({
    production: "30",
    upgrades: "1",
    nextUnlock: "採集機の改修: これまでに生産したコインが 75000000 に達すると解放（あと 63000000）",
  });
  expect(current.shop[4]).toStrictEqual({
    action: { type: "buyUpgrade" },
    label: "改良を買う（1240000 コイン）",
    effect: "買うと毎秒の生産が 7 増える（すべての施設の生産が 1.25 倍になる）",
    visible: true,
    affordable: true,
  });
});

test("改良を持っていれば、解放の条件に届いていなくても改良を並べ、次の採集機の改修の条件を示す", () => {
  // 解放の条件が 6e6 だった版の保存は、今の条件 1.2e7 に届かずに改良を持っていることがある。
  const current = view(
    state({ coins: num(1.3e6), totalEarned: num(8e6), collectors: 4, factories: 2, upgrades: 1 }),
  );

  expect(current.nextUnlock).toBe(
    "採集機の改修: これまでに生産したコインが 75000000 に達すると解放（あと 67000000）",
  );
  expect(current.shop[4]).toMatchObject({ visible: true, affordable: true });
});

test("解放までの残りは、生産で減り、購入では変わらない。端数は切り上げる", () => {
  // 採集機 1 台で毎秒 1。残り 87.3 を切り上げる。
  const produced = advance(initialState, 12.7);
  // 採集機の値段 11.5 を払う。
  const bought = perform(produced, { type: "buyCollector" });
  assert.isDefined(bought);
  const condition = "工場: これまでに生産したコインが 100 に達すると解放";

  expect(view(produced)).toMatchObject({
    totalEarned: "12",
    nextUnlock: `${condition}（あと 88）`,
  });
  expect(view(bought)).toMatchObject({
    totalEarned: "12",
    nextUnlock: `${condition}（あと 88）`,
  });
  expect(view(state({ totalEarned: num(99.9999) }))).toMatchObject({
    totalEarned: "99",
    nextUnlock: `${condition}（あと 1）`,
  });
});

test("これまでに生産したコインが工場の解放の条件に達すると、工場を並べ、次の改良の条件を示す", () => {
  const reached = view(advance(initialState, 100));
  // 許容誤差の範囲で条件に届いた値は、工場の解放と同じく達したとみなす。
  const withinTolerance = view(state({ totalEarned: num(100 * (1 - 1e-10)) }));
  const below = view(state({ totalEarned: num(99.9999) }));
  const upgrade = "改良: これまでに生産したコインが 12000000 に達すると解放";

  expect(reached.nextUnlock).toBe(`${upgrade}（あと 11999900）`);
  expect(reached.shop[3]?.visible).toBe(true);
  expect(withinTolerance.nextUnlock).toBe(`${upgrade}（あと 11999900）`);
  expect(withinTolerance.shop[3]?.visible).toBe(true);
  expect(below.shop[3]?.visible).toBe(false);
});

test("造幣所の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、造幣所を並べて次の精錬所の条件を示す", () => {
  const condition = "造幣所: これまでに生産したコインが 200000000 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(2e8 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(1.9e8) })).nextUnlock).toBe(`${condition}（あと 10000000）`);
  expect(view(state({ totalEarned: num(199_999_999.5) })).nextUnlock).toBe(
    `${condition}（あと 1）`,
  );
  expect(withinTolerance.nextUnlock).toMatch(/^精錬所: /v);
  expect(withinTolerance.shop[6]?.visible).toBe(true);
  expect(withinTolerance.shop[7]?.visible).toBe(false);
});

/** これまでに生産したコイン。工場の解放の条件の前後を細かく、交易所の解放の条件の先までを粗く覆う。 */
const earnedAcrossUnlocks = fc.oneof(
  fc.double({ min: 0, max: 200, noNaN: true }),
  fc.double({ min: 0, max: 9e8, noNaN: true }),
);

/** 後から解放される品物（店の 4 行目から）が見えているかと、次の解放の表示が示す要素（無ければその旨）。 */
const unlockShown = (current: View): readonly (boolean | string)[] => [
  ...current.shop.slice(3).map(({ visible }) => visible),
  current.nextUnlock.split(":")[0] ?? "",
];

test("次の解放の条件は、工場・改良・採集機の改修・造幣所・精錬所・交易所の順に、まだ隠れている最初のものだけを示す", () => {
  fc.assert(
    fc.property(earnedAcrossUnlocks, (earned) => {
      expect([
        [false, false, false, false, false, false, "工場"],
        [true, false, false, false, false, false, "改良"],
        [true, true, false, false, false, false, "採集機の改修"],
        [true, true, true, false, false, false, "造幣所"],
        [true, true, true, true, false, false, "精錬所"],
        [true, true, true, true, true, false, "交易所"],
        [true, true, true, true, true, true, allUnlocked],
      ]).toContainEqual(unlockShown(view(state({ totalEarned: num(earned) }))));
    }),
  );
});

test("解放の条件が 5e7 だった版の保存で造幣所を持っていれば、今の条件に届いていなくても、造幣所と、その前に解放される採集機の改修を並べる", () => {
  // 保存形式の版 2 の保存。累計 6e7 は造幣所の今の解放の条件にも、採集機の改修の解放の条件 7.5e7 にも届かない。
  const loaded = deserialize(
    JSON.stringify({
      version: 2,
      savedAt: 0,
      state: {
        coins: { sign: 1, layer: 0, mag: 2e7 },
        totalEarned: { sign: 1, layer: 0, mag: 6e7 },
        collectors: 100,
        factories: 60,
        mints: 4,
        autoBuyer: true,
      },
    }),
  );
  assert(loaded.ok);
  const current = view(loaded.data.state);

  expect(current.shop[5]).toMatchObject({ visible: true, affordable: true });
  expect(current.shop[6]).toMatchObject({ visible: true, affordable: true });
  expect(current.nextUnlock).toBe(
    "精錬所: これまでに生産したコインが 450000000 に達すると解放（あと 390000000）",
  );
});

/** 見えている品物の種類を、店に並ぶ順に並べたもの。 */
const shownActions = (current: GameState): readonly Action["type"][] =>
  view(current).shop.flatMap(({ action, visible }) => (visible ? [action.type] : []));

/**
 * 店の最初の行。自動購入と控えめな自動購入は、買い終えるまで採集機の次に並ぶ。控えめな自動購入は、自動購入を買い
 * 終えると隠れる。
 */
const firstRows = (autoBuyer: boolean): readonly Action["type"][] =>
  autoBuyer ? ["buyCollector"] : ["buyCollector", "buyAutoBuyer", "buyCautiousAutoBuyer"];

test.each([false, true])(
  "これまでに生産したコインが工場・改良・採集機の改修・造幣所・精錬所・交易所の解放の条件に順に達すると、行は後ろに足され、それまで並んでいた行の順と位置は変わらない（自動購入を買い終えている: %s）",
  (autoBuyer) => {
    // 解放の条件はどれも、これまでに生産したコインの決まった量なので、efficiency@always を含むどの遊び方でもこの順に
    // 解放される。
    const rows = firstRows(autoBuyer);
    const earned = [
      ZERO,
      FACTORY_UNLOCK_EARNED,
      UPGRADE_UNLOCK_EARNED,
      COLLECTOR_UPGRADE_UNLOCK_EARNED,
      MINT_UNLOCK_EARNED,
      REFINERY_UNLOCK_EARNED,
      EXCHANGE_UNLOCK_EARNED,
    ];

    expect(
      earned.map((totalEarned) => shownActions(state({ totalEarned, autoBuyer }))),
    ).toStrictEqual([
      rows,
      [...rows, "buyFactory"],
      [...rows, "buyFactory", "buyUpgrade"],
      [...rows, "buyFactory", "buyUpgrade", "buyCollectorUpgrade"],
      [...rows, "buyFactory", "buyUpgrade", "buyCollectorUpgrade", "buyMint"],
      [...rows, "buyFactory", "buyUpgrade", "buyCollectorUpgrade", "buyMint", "buyRefinery"],
      [
        ...rows,
        "buyFactory",
        "buyUpgrade",
        "buyCollectorUpgrade",
        "buyMint",
        "buyRefinery",
        "buyExchange",
      ],
    ]);
  },
);

/**
 * これまでに生産したコインが 0〜9e8 の、到達しうる状態。造幣所・精錬所・交易所は解放の後にしか買えないので、造幣所を
 * 持つ状態では、これまでに生産したコインが解放の条件（以前の版の 5e7 から。今は 2e8）以上あり、精錬所を持つ状態では
 * 解放の条件 4.5e8 以上、交易所を持つ状態では解放の条件 7.5e8 以上ある。
 */
const reachable = fc
  .oneof(
    fc.record({
      earned: earnedAcrossUnlocks,
      mints: fc.constant(0),
      refineries: fc.constant(0),
      exchanges: fc.constant(0),
      autoBuyer: fc.boolean(),
    }),
    fc.record({
      earned: fc.double({ min: 5e7, max: 9e8, noNaN: true }),
      mints: fc.nat({ max: 3 }),
      refineries: fc.constant(0),
      exchanges: fc.constant(0),
      autoBuyer: fc.boolean(),
    }),
    fc.record({
      earned: fc.double({ min: 4.5e8, max: 9e8, noNaN: true }),
      mints: fc.nat({ max: 3 }),
      refineries: fc.nat({ max: 3 }),
      exchanges: fc.constant(0),
      autoBuyer: fc.boolean(),
    }),
    fc.record({
      earned: fc.double({ min: 7.5e8, max: 9e8, noNaN: true }),
      mints: fc.nat({ max: 3 }),
      refineries: fc.nat({ max: 3 }),
      exchanges: fc.nat({ max: 3 }),
      autoBuyer: fc.boolean(),
    }),
  )
  .map(({ earned, mints, refineries, exchanges, autoBuyer }) =>
    state({ totalEarned: num(earned), mints, refineries, exchanges, autoBuyer }),
  );

test("生産が進んで品物が解放されても、自動購入を買わない限り、それまで並んでいた行の順と位置は変わらない", () => {
  fc.assert(
    fc.property(reachable, fc.double({ min: 0, max: 9e8, noNaN: true }), (current, produced) => {
      const rows = shownActions(current);
      const later = shownActions(advance(current, produced / toNumber(production(current))));

      expect(later.slice(0, rows.length)).toStrictEqual(rows);
    }),
  );
});
