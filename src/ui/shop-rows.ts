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
