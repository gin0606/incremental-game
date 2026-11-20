import { expect, test } from "vitest";

import { fromParts, num } from "../core/num.ts";
import { toJsonLines } from "./output.ts";
import type { Run } from "./simulate.ts";

/** 10^400。計算の誤差を含まない値にするため、表現から作る。 */
const tenTo400 = fromParts({ sign: 1, layer: 1, mag: 400 }) ?? num(0);

test("1 行目に実行の設定、続く行に時系列を JSON で書き、数は文字列にする", () => {
  const run: Run<null> = {
    bot: { purchase: "roi", checkIn: { kind: "every", seconds: 600 }, prestige: "never" },
    settings: { duration: 3600, step: 60, sampleEvery: 600, seed: 7 },
    timeline: [
      { kind: "unlock", id: "collector", t: 0, resource: num(0), rate: num(1) },
      { kind: "purchase", id: "collector", t: 11.5, resource: num(0.25), rate: num(2) },
      {
        kind: "sample",
        t: 600,
        resource: tenTo400,
        rate: num(-3),
      },
    ],
    final: null,
  };

  const lines = toJsonLines(run).split("\n");

  expect(lines.at(-1)).toBe("");
  expect(lines.slice(0, -1).map((line) => JSON.parse(line) as unknown)).toStrictEqual([
    {
      kind: "run",
      bot: "roi@600s",
      purchase: "roi",
      checkIn: { kind: "every", seconds: 600 },
      prestige: "never",
      duration: 3600,
      step: 60,
      sampleEvery: 600,
      seed: 7,
    },
    { kind: "unlock", id: "collector", t: 0, resource: "0", rate: "1" },
    { kind: "purchase", id: "collector", t: 11.5, resource: "0.25", rate: "2" },
    { kind: "sample", t: 600, resource: "1e400", rate: "-3" },
  ]);
});
