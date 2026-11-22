import { expect, test } from "vitest";

import { rowDisplay, rowLooks, shownAfter } from "./shop-rows.ts";
import type { ShopItem } from "./view.ts";

test("見えている品物の行は、前に見せたかによらず見せる", () => {
  expect(rowDisplay(true, false)).toBe("shown");
  expect(rowDisplay(true, true)).toBe("shown");
});

test("見えなくなった品物の行は、場所だけを残す", () => {
  expect(rowDisplay(false, true)).toBe("space");
});

test("まだ見せていない品物の行は、場所を取らない", () => {
  expect(rowDisplay(false, false)).toBe("none");
});

const item = (visible: boolean, affordable: boolean): ShopItem => ({
  action: { type: "buyCollector" },
  label: "採集機を買う（10 コイン）",
  effect: "買うと毎秒の生産が 1 増える",
  visible,
  affordable,
});

test("見せる行は隠さず、ボタンの名前と得られるものを描き、買えないときだけボタンを押せないと示す", () => {
  expect(rowLooks([item(true, true), item(true, false)], [])).toStrictEqual([
    {
      label: "採集機を買う（10 コイン）",
      effect: "買うと毎秒の生産が 1 増える",
      ariaDisabled: "false",
      hidden: false,
      visibility: "",
    },
    {
      label: "採集機を買う（10 コイン）",
      effect: "買うと毎秒の生産が 1 増える",
      ariaDisabled: "true",
      hidden: false,
      visibility: "",
    },
  ]);
});

test("前に見せて見えなくなった行は場所だけを残し、まだ見せていない行は場所も取らない", () => {
  const looks = rowLooks([item(false, false), item(false, false), item(false, false)], [true]);
  expect(looks.map(({ hidden, visibility }) => ({ hidden, visibility }))).toStrictEqual([
    { hidden: false, visibility: "hidden" },
    { hidden: true, visibility: "" },
    { hidden: true, visibility: "" },
  ]);
});

test("描いた後は、前に見せた行といま見えている品物の行を見せたとし、ほかは見せていないとする", () => {
  expect(
    shownAfter(
      [item(true, false), item(false, false), item(false, false), item(true, false)],
      [false, true],
    ),
  ).toStrictEqual([true, true, false, true]);
});
