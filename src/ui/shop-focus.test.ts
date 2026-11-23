import { expect, test } from "vitest";

import { initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { focusMove, focusedIndex, moveFocus, pressedByKeyboard, shopFocus } from "./shop-focus.ts";
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
  // 店の並びは採集機・自動購入・控えめな自動購入・工場・改良・採集機の改修・造幣所・精錬所・交易所・工場の連携。控えめな
  // 自動購入は、自動購入を買い終えると隠れる。工場の後ろの改良・採集機の改修・造幣所・精錬所・交易所・工場の連携は、工場より
  // 後に解放される。
  expect(shopFocus(shopAt(1e9), 1)).toBe(3);
  expect(shopFocus(shopAt(1e7), 1)).toBe(3);
  expect(shopFocus(shopAt(1000), 1)).toBe(3);
  expect(shopFocus(shopAt(0), 1)).toBe(0);
});

/** 控えめな自動購入を買い終え、これまでに生産したコインが `earned` の状態の店。 */
const shopWithCautious = (earned: number): readonly ShopItem[] =>
  view({ ...initialState, totalEarned: num(earned), cautiousAutoBuyer: true }).shop;

test("控えめな自動購入を買い終えると、フォーカスは後ろの工場へ、工場の解放の前なら前の自動購入へ移す", () => {
  expect(shopFocus(shopWithCautious(1000), 2)).toBe(3);
  expect(shopFocus(shopWithCautious(0), 2)).toBe(1);
});

test("フォーカスを移すとき、キーボードで押した後は巻き取り、マウスなどで押した後は巻き取らない", () => {
  expect(focusMove(shopOf(true, false, true), 1, true)).toStrictEqual({
    index: 2,
    preventScroll: false,
  });
  expect(focusMove(shopOf(true, false, true), 1, false)).toStrictEqual({
    index: 2,
    preventScroll: true,
  });
});

test("フォーカスを移さないときは、移す先も巻き取りも返さない", () => {
  expect(focusMove(shopOf(true, true), 1, true)).toBeUndefined();
  expect(focusMove(shopOf(true, true), -1, false)).toBeUndefined();
});

test("フォーカスを持つ要素が品物のボタンならその位置を、ほかの要素なら -1 を返す", () => {
  const buttons = [{}, {}, {}];
  expect(focusedIndex(buttons, buttons[1])).toBe(1);
  expect(focusedIndex(buttons, {})).toBe(-1);
  expect(focusedIndex(buttons, null)).toBe(-1);
});

test("click の押した回数が 0 のときだけ、キーボードで押したとする", () => {
  expect(pressedByKeyboard(0)).toBe(true);
  expect(pressedByKeyboard(1)).toBe(false);
  expect(pressedByKeyboard(2)).toBe(false);
});

/** {@link moveFocus} が `focus` に渡した位置と巻き取りの指定。 */
const movesOf = (
  shop: readonly ShopItem[],
  focused: number,
  byKeyboard: boolean,
): readonly (readonly [number, boolean])[] => {
  const moves: (readonly [number, boolean])[] = [];
  moveFocus(shop, focused, byKeyboard, (index, options) => {
    moves.push([index, options.preventScroll]);
  });
  return moves;
};

test("移す先があるときだけ、その位置と巻き取りの指定でフォーカスを移させる", () => {
  expect(movesOf(shopOf(true, false, true), 1, true)).toStrictEqual([[2, false]]);
  expect(movesOf(shopOf(true, false, true), 1, false)).toStrictEqual([[2, true]]);
  expect(movesOf(shopOf(true, true), 1, true)).toStrictEqual([]);
  expect(movesOf(shopOf(true), -1, false)).toStrictEqual([]);
});
