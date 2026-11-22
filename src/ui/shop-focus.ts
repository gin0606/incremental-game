import type { ShopItem } from "./view.ts";

/**
 * 店を描き直した後に、キーボードのフォーカスを移す品物の位置。`focused` は、描き直す前にフォーカスを持っていた
 * 品物の位置で、店の品物がフォーカスを持っていなければ範囲の外（-1 など）を渡す。
 *
 * その品物が隠れたときだけ移し、後ろで最も近い見えている品物、後ろに無ければ前で最も近い見えている品物を返す
 * （根拠は docs/design/shop-focus.md）。見えたままのとき、見えている品物が無いとき、店の品物がフォーカスを
 * 持っていないときは `undefined`（移さない）。見えている品物のボタンは、買えないときもフォーカスを受けられる
 * （`aria-disabled`）ので、どれも移す先にできる。
 */
export function shopFocus(shop: readonly ShopItem[], focused: number): number | undefined {
  if (shop[focused] === undefined) {
    return undefined;
  }
  const visible = shop.flatMap((item, index) => (item.visible ? [index] : []));
  const target = visible.find((index) => index >= focused) ?? visible.at(-1);
  return target === focused ? undefined : target;
}

/** フォーカスを移す先の品物の位置と、移すときにページを巻き取らないか。 */
export interface FocusMove {
  readonly index: number;
  readonly preventScroll: boolean;
}

/**
 * {@link shopFocus} が返す移す先と、そのときのページの巻き取り。`byKeyboard` は、フォーカスを移すきっかけの購入を
 * キーボードで押したか。
 *
 * マウスなどで押した後は、移す先が画面の外にあってもページを巻き取らない。巻き取ると、続けて同じ位置を押したときに別の
 * 品物のボタンに当たる。キーボードで押した後は、移した先が見えるよう巻き取る。フォーカスの印（`:focus-visible`）では
 * 決めない。キーボードでフォーカスを置いたボタンをマウスで押しても、印が残るため。
 */
export function focusMove(
  shop: readonly ShopItem[],
  focused: number,
  byKeyboard: boolean,
): FocusMove | undefined {
  const index = shopFocus(shop, focused);
  return index === undefined ? undefined : { index, preventScroll: !byKeyboard };
}

/**
 * 描き直す前にフォーカスを持っていた品物の位置。`buttons` は品物のボタンを店の並びで並べたもの、`active` はフォーカスを
 * 持つ要素（`document.activeElement`）。店の品物のボタンでなければ -1 で、{@link shopFocus} の `focused` に渡せる。
 *
 * 引数を `unknown` にするのは、lint の prefer-readonly-parameter-types が DOM の要素の型の引数を許さないため。型では
 * 品物のボタンの並びかを確かめられないので、店の並びのボタンを渡す。
 */
export function focusedIndex(buttons: readonly unknown[], active: unknown): number {
  return buttons.indexOf(active);
}

/** 品物のボタンをキーボードで押したか。click の `detail`（押した回数）が 0 なら、キーボードなどで押している。 */
export function pressedByKeyboard(detail: number): boolean {
  return detail === 0;
}

/**
 * {@link focusMove} が移す先を返すときだけ、`focus` にその位置と巻き取りの指定を渡してフォーカスを移させる。
 */
export function moveFocus(
  shop: readonly ShopItem[],
  focused: number,
  byKeyboard: boolean,
  focus: (index: number, options: { readonly preventScroll: boolean }) => void,
): void {
  const move = focusMove(shop, focused, byKeyboard);
  if (move !== undefined) {
    focus(move.index, { preventScroll: move.preventScroll });
  }
}
