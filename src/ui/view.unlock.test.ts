import * as fc from "fast-check";
import { assert, expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { advance, initialState, perform } from "../core/game.ts";
import { num } from "../core/num.ts";
import type { View } from "./view.ts";
import { view } from "./view.ts";

// 次の解放の表示と、解放された品物を店に並べること。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test("造幣所が解放されたら解放の条件を示さず、造幣所を並べる。買える額があれば買える", () => {
  const current = view(
    state({
      coins: num(6e6),
      totalEarned: num(6e7),
      collectors: 3,
      factories: 2,
      mints: 1,
      autoBuyer: true,
    }),
  );

  expect(current).toMatchObject({ production: "53", mints: "1", nextUnlock: undefined });
  expect(current.shop[2]).toStrictEqual({
    action: { type: "buyMint" },
    label: "造幣所を買う（5500000 コイン）",
    effect: "買うと毎秒の生産が 30 増える",
    visible: true,
    affordable: true,
  });
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

test("これまでに生産したコインが工場の解放の条件に達すると、工場を並べ、次の造幣所の条件を示す", () => {
  const reached = view(advance(initialState, 100));
  // 許容誤差の範囲で条件に届いた値は、工場の解放と同じく達したとみなす。
  const withinTolerance = view(state({ totalEarned: num(100 * (1 - 1e-10)) }));
  const below = view(state({ totalEarned: num(99.9999) }));
  const mint = "造幣所: これまでに生産したコインが 50000000 に達すると解放";

  expect(reached.nextUnlock).toBe(`${mint}（あと 49999900）`);
  expect(reached.shop[1]?.visible).toBe(true);
  expect(withinTolerance.nextUnlock).toBe(`${mint}（あと 49999900）`);
  expect(withinTolerance.shop[1]?.visible).toBe(true);
  expect(below.shop[1]?.visible).toBe(false);
});

test("造幣所の解放までの残りは、端数を切り上げる。条件に許容誤差の範囲で届くと、条件を示さずに造幣所を並べる", () => {
  const condition = "造幣所: これまでに生産したコインが 50000000 に達すると解放";
  const withinTolerance = view(state({ totalEarned: num(5e7 * (1 - 1e-10)) }));

  expect(view(state({ totalEarned: num(4e7) })).nextUnlock).toBe(`${condition}（あと 10000000）`);
  expect(view(state({ totalEarned: num(49_999_999.5) })).nextUnlock).toBe(`${condition}（あと 1）`);
  expect(withinTolerance.nextUnlock).toBeUndefined();
  expect(withinTolerance.shop[2]?.visible).toBe(true);
});

/** 工場と造幣所が見えているかと、次の解放の表示が示す要素（無ければ「なし」）。 */
const unlockShown = (current: View): readonly [boolean, boolean, string] => [
  current.shop[1]?.visible === true,
  current.shop[2]?.visible === true,
  current.nextUnlock?.split(":")[0] ?? "なし",
];

test("工場の解放の条件は工場が隠れている間だけ、造幣所の条件は工場が見えて造幣所が隠れている間だけ示す", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 1e8, noNaN: true }),
      ),
      (earned) => {
        expect([
          [false, false, "工場"],
          [true, false, "造幣所"],
          [true, true, "なし"],
        ]).toContainEqual(unlockShown(view(state({ totalEarned: num(earned) }))));
      },
    ),
  );
});
