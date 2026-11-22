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
 * {@link shopFocus} が返す移す先と、そのときのページの巻き取り。`focusVisible` は、フォーカスを持っていた品物のボタンに
 * フォーカスの印が出ていたか（`:focus-visible`。キーボードで操作していたか）。
 *
 * 印が出ていなければ（マウスで押した後）、移す先が画面の外にあってもページを巻き取らない。巻き取ると、続けて同じ位置を
 * 押したときに別の品物のボタンに当たる。キーボードで操作していれば、移した先が見えるよう巻き取る。
 */
export function focusMove(
  shop: readonly ShopItem[],
  focused: number,
  focusVisible: boolean,
): FocusMove | undefined {
  const index = shopFocus(shop, focused);
  return index === undefined ? undefined : { index, preventScroll: !focusVisible };
}
