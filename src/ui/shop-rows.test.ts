import { expect, test } from "vitest";

import { rowDisplay } from "./shop-rows.ts";

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
