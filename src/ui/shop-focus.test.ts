import { expect, test } from "vitest";

import { initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { shopFocus } from "./shop-focus.ts";
import type { ShopItem } from "./view.ts";
import { view } from "./view.ts";

/** 見えているかだけを並べた店。ほかの項目は、フォーカスを移す先の判断に使わない。 */
const shopOf = (...visible: readonly boolean[]): readonly ShopItem[] =>
  visible.map((shown) => ({
    action: { type: "buyCollector" },
    label: "",
    effect: "",
    visible: shown,
    affordable: false,
  }));

test("フォーカスを持つ品物が見えたままなら、フォーカスを移さない", () => {
  expect(shopFocus(shopOf(true, false, true), 0)).toBeUndefined();
  expect(shopFocus(shopOf(true, false, true), 2)).toBeUndefined();
});

test("フォーカスを持つ品物が隠れたら、後ろで最も近い見えている品物へ移す", () => {
  expect(shopFocus(shopOf(true, false, false, true, true), 1)).toBe(3);
});

test("フォーカスを持つ品物が隠れて、後ろに見えている品物が無ければ、前で最も近い見えている品物へ移す", () => {
  expect(shopFocus(shopOf(true, true, true, false, false), 3)).toBe(2);
});

test("見えている品物が無いときと、店の品物がフォーカスを持っていないときは、フォーカスを移さない", () => {
  expect(shopFocus(shopOf(false, false), 0)).toBeUndefined();
  expect(shopFocus(shopOf(true), -1)).toBeUndefined();
  expect(shopFocus(shopOf(true), 1)).toBeUndefined();
});

/** 自動購入を買い終え、これまでに生産したコインが `earned` の状態の店。 */
const shopAt = (earned: number): readonly ShopItem[] =>
  view({ ...initialState, totalEarned: num(earned), autoBuyer: true }).shop;

test("自動購入を買い終えると、フォーカスは後ろで最も近い見えている品物（工場）へ、工場の解放の前なら前の採集機へ移す", () => {
  // 店の並びは採集機・自動購入・工場・改良・造幣所。工場の後ろの改良と造幣所は、工場より後に解放される。
  expect(shopFocus(shopAt(1e9), 1)).toBe(2);
  expect(shopFocus(shopAt(1e7), 1)).toBe(2);
  expect(shopFocus(shopAt(1000), 1)).toBe(2);
  expect(shopFocus(shopAt(0), 1)).toBe(0);
});
