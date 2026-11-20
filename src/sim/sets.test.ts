import { expect, test } from "vitest";

import { botName } from "./bot.ts";
import type { Trial } from "./sets.ts";
import { checkInIntervals, fastSet, fullSet, randomSeeds } from "./sets.ts";

const names = (set: readonly Trial[]): readonly string[] =>
  set.map(({ bot, seed }) => `${botName(bot)}#${seed}`);

const intervals = ["60s", "600s", "3600s", "14400s", "28800s"];

test("チェックインの間隔は 1 分から 8 時間", () => {
  expect(checkInIntervals).toStrictEqual([60, 600, 3600, 14_400, 28_800]);
  expect(randomSeeds).toStrictEqual([1, 2, 3]);
});

test("速い組は efficiency の全予定と、ほかの規則の常に開いている予定", () => {
  expect(names(fastSet)).toStrictEqual([
    "efficiency@always#1",
    ...intervals.map((interval) => `efficiency@${interval}#1`),
    "roi@always#1",
    "cheapest@always#1",
    "newest@always#1",
    "random@always#1",
  ]);
});

test("全組はすべての規則と予定の組み合わせで、random は 3 つのシード", () => {
  const schedules = ["always", ...intervals];
  expect(names(fullSet)).toStrictEqual([
    ...["efficiency", "roi", "cheapest", "newest"].flatMap((rule) =>
      schedules.map((schedule) => `${rule}@${schedule}#1`),
    ),
    ...schedules.flatMap((schedule) => [1, 2, 3].map((seed) => `random@${schedule}#${seed}`)),
  ]);
});

test("速い組は全組に含まれる", () => {
  const full = names(fullSet);

  expect(names(fastSet).filter((name) => !full.includes(name))).toStrictEqual([]);
});
