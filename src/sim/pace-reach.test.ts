import { expect, test } from "vitest";

import { TargetsError } from "./fields.ts";
import { evaluate } from "./pace-check.ts";
import type { IdleMeasure, Measurement } from "./pace.ts";
import type { Reach } from "./pace-reach.ts";
import { reachStages } from "./pace-reach.ts";
import type { Settings, Targets } from "./pace-targets.ts";

// 放置の許容間隔の段（目標値の `idle.reach`）の読み込みと、段ごとの傾向の検査。

const read = reachStages([0, 600, 3600]);

const twoStages: readonly Reach[] = [
  { by: 600, tolerance: 60 },
  { by: 3600, tolerance: 600 },
];

test("reachStages は正しい段をそのまま返す", () => {
  expect(read(twoStages, "reach")).toStrictEqual(twoStages);
  expect(read([{ by: -1, tolerance: 1 }], "reach")).toStrictEqual([{ by: -1, tolerance: 1 }]);
});

test.each([
  { value: [], message: "reach: 空でない配列で書く" },
  { value: 1, message: "reach: 空でない配列で書く" },
  { value: [1], message: "reach[0]: オブジェクトで書く" },
  { value: [{ by: 0, tolerance: 1, x: 1 }], message: "reach[0].x: 知らない項目" },
  { value: [{ by: "0", tolerance: 1 }], message: "reach[0].by: 有限の数で書く" },
  { value: [{ by: 0, tolerance: 0 }], message: "reach[0].tolerance: 正の数で書く" },
  {
    value: [{ by: 3601, tolerance: 60 }],
    message: "reach[0].by: 測り方の最後の局面（settings.idle.phases の最後）以下にする",
  },
  {
    value: [
      { by: 600, tolerance: 60 },
      { by: 3601, tolerance: 600 },
    ],
    message: "reach[1].by: 測り方の最後の局面（settings.idle.phases の最後）以下にする",
  },
  {
    // 時刻は前の段より後でも、どちらも局面 3600 秒から確かめる。
    value: [
      { by: 601, tolerance: 60 },
      { by: 3600, tolerance: 600 },
    ],
    message:
      "reach[1].by: 前の段より後の局面から確かめる時刻にする（同じ局面から確かめる段は、許容間隔の長いほうしか働かない）",
  },
  {
    value: [
      { by: 600, tolerance: 60 },
      { by: 600, tolerance: 600 },
    ],
    message:
      "reach[1].by: 前の段より後の局面から確かめる時刻にする（同じ局面から確かめる段は、許容間隔の長いほうしか働かない）",
  },
  {
    value: [
      { by: 600, tolerance: 60 },
      { by: 3600, tolerance: 60 },
    ],
    message:
      "reach[1].tolerance: 前の段より長くする（前の段以下なら、前の段がすでに守っていて働かない）",
  },
  {
    // 最初の段とではなく、直前の段と比べる。
    value: [
      { by: 0, tolerance: 10 },
      { by: 600, tolerance: 60 },
      { by: 600, tolerance: 600 },
    ],
    message:
      "reach[2].by: 前の段より後の局面から確かめる時刻にする（同じ局面から確かめる段は、許容間隔の長いほうしか働かない）",
  },
  {
    value: [
      { by: 0, tolerance: 10 },
      { by: 600, tolerance: 600 },
      { by: 3600, tolerance: 60 },
    ],
    message:
      "reach[2].tolerance: 前の段より長くする（前の段以下なら、前の段がすでに守っていて働かない）",
  },
] as const)("reachStages は $message で失敗する", ({ value, message }) => {
  const parse = (): unknown => read(value, "reach");
  expect(parse).toThrow(TargetsError);
  expect(parse).toThrow(message);
});

const settings: Settings = {
  duration: 3600,
  step: 60,
  sampleEvery: 600,
  reasonable: ["efficiency"],
  growth: { bounds: [0, 3600] },
  walls: { window: 600, below: 0 },
  choice: { best: "efficiency", restricted: [] },
  idle: { phases: [0, 600, 3600], window: 600, away: [60, 600] },
};

const targets: Targets = {
  milestones: { levels: [1, 2], ratio: { min: 0 } },
  growth: { speed: { min: 0 }, change: { min: 0 } },
  purchases: { median: { min: 0 }, longest: { min: 0 } },
  novelty: { perDay: { min: 0 }, longestGap: { min: 0 } },
  walls: { longest: { min: 0 } },
  choice: { lead: { min: 0 } },
  idle: { efficiency: 0.99, reach: twoStages },
};

const idle = (phase: number, tolerance: number): IdleMeasure => ({
  rule: "efficiency",
  bots: ["efficiency@always", "efficiency@600s"],
  phase,
  efficiency: [1],
  tolerance,
  returns: [1, 2],
  violations: [],
});

/** 段ごとの傾向の名前と問題。 */
const stageProblems = (
  tolerances: readonly number[],
): readonly (readonly [string, readonly string[]])[] => {
  const measurement: Measurement = {
    plays: [],
    choices: [],
    idles: settings.idle.phases.map((phase, index) => idle(phase, tolerances[index] ?? 0)),
  };
  return evaluate(settings, targets, measurement)
    .filter((check) => check.name.includes("秒以降の局面で"))
    .map((check) => [check.name, check.problems] as const);
};

test("evaluate は段ごとに、その段の時刻以降の局面の許容間隔を比べる", () => {
  // 局面 0 秒は、どの段の時刻よりも前なので比べない。
  expect(stageProblems([0, 60, 600])).toStrictEqual([
    ["放置の許容間隔が 600 秒以降の局面で 60 秒以上", []],
    ["放置の許容間隔が 3600 秒以降の局面で 600 秒以上", []],
  ]);
  expect(stageProblems([0, 59, 600])).toStrictEqual([
    ["放置の許容間隔が 600 秒以降の局面で 60 秒以上", ["efficiency、局面 600 秒: 許容間隔 59 秒"]],
    ["放置の許容間隔が 3600 秒以降の局面で 600 秒以上", []],
  ]);
  expect(stageProblems([0, 60, 599])).toStrictEqual([
    ["放置の許容間隔が 600 秒以降の局面で 60 秒以上", []],
    [
      "放置の許容間隔が 3600 秒以降の局面で 600 秒以上",
      ["efficiency、局面 3600 秒: 許容間隔 599 秒"],
    ],
  ]);
  expect(stageProblems([0, 600, 59])).toStrictEqual([
    ["放置の許容間隔が 600 秒以降の局面で 60 秒以上", ["efficiency、局面 3600 秒: 許容間隔 59 秒"]],
    [
      "放置の許容間隔が 3600 秒以降の局面で 600 秒以上",
      ["efficiency、局面 3600 秒: 許容間隔 59 秒"],
    ],
  ]);
});
