import type { ShopItem } from "./view.ts";

/** 店の品物の行の見せ方。`shown` は見せる、`space` は見せずに場所だけを残す、`none` は場所も取らない。 */
export type RowDisplay = "shown" | "space" | "none";

/**
 * 品物の行の見せ方。`shownBefore` は、ページを開いてからその行を一度でも見せたか。
 *
 * 見えている品物の行は見せる。見えなくなった行は場所だけを残し、後ろの行を動かさない（買い終えた自動購入の行を詰めると、
 * 続けて押したマウスの押下が別の品物のボタンに当たる）。まだ見せていない行は場所を取らず、解放されると後ろに足される。
 * 根拠は docs/design/shop-focus.md。
 */
export function rowDisplay(visible: boolean, shownBefore: boolean): RowDisplay {
  if (visible) {
    return "shown";
  }
  return shownBefore ? "space" : "none";
}

/** 品物の行に描く内容。 */
export interface RowLook {
  readonly label: string;
  readonly effect: string;
  /**
   * ボタンの `aria-disabled` の値。disabled だとフォーカスを受けられず、買って足りなくなると外れるため、押せなさは
   * これで示し、押せば押した時刻に買えるときだけ買う。
   */
  readonly ariaDisabled: "true" | "false";
  /** 行の `hidden`。場所も取らない行だけを隠す。 */
  readonly hidden: boolean;
  /** 行の `visibility`。場所だけを残す行は `hidden` にし、Tab の順と支援技術からも外す。 */
  readonly visibility: "hidden" | "";
}

/**
 * 店の各品物の行に描く内容。`shownBefore` は、ページを開いてから各行を一度でも見せたか（{@link shownAfter} が返す。
 * 足りない位置はまだ見せていないとみなす）。
 */
export function rowLooks(
  shop: readonly ShopItem[],
  shownBefore: readonly boolean[],
): readonly RowLook[] {
  return shop.map((item, index) => {
    const display = rowDisplay(item.visible, shownBefore[index] === true);
    return {
      label: item.label,
      effect: item.effect,
      ariaDisabled: item.affordable ? "false" : "true",
      hidden: display === "none",
      visibility: display === "space" ? "hidden" : "",
    };
  });
}

/** 店を `shop` で描いた後の、各行を一度でも見せたか。前に見せた行と、いま見えている品物の行を見せたとする。 */
export function shownAfter(
  shop: readonly ShopItem[],
  shownBefore: readonly boolean[],
): readonly boolean[] {
  return shop.map((item, index) => item.visible || shownBefore[index] === true);
}
