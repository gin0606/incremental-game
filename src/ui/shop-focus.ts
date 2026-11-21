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
