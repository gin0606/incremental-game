import { expect, test } from "vitest";

import { TargetsError, parseTargets } from "./pace-targets.ts";

const valid = {
  duration: 3600,
  step: 60,
  sampleEvery: 600,
  reasonable: ["efficiency", "roi"],
  milestones: { levels: [1, 2], ratio: { min: 1 } },
  growth: { bounds: [0, 3600], speed: { max: 10 }, change: { min: 0, max: 2 } },
  purchases: { median: { max: 600 }, longest: { max: 3600 } },
  novelty: { perDay: { min: 0.5 }, longestGap: { max: 3600 } },
  walls: { window: 600, below: 0.001, longest: { max: 1800 } },
  choice: { best: "efficiency", restricted: ["cheapest"], lead: { min: 0, max: 1 } },
  idle: {
    phases: [0, 600],
    window: 1800,
    efficiency: 0.99,
    reachBy: 600,
    reach: 60,
    away: [60, 600],
  },
};

test("parseTargets は正しい目標値をそのまま返す", () => {
  expect(parseTargets(valid)).toStrictEqual(valid);
});

test("parseTargets は帯の省いた側を省いたまま返す", () => {
  const targets = parseTargets(valid);
  expect(Object.keys(targets.milestones.ratio)).toStrictEqual(["min"]);
  expect(Object.keys(targets.growth.speed)).toStrictEqual(["max"]);
});

type Field = readonly [string, unknown];

/** `valid` の `path` の項目を `value` に置き換える（`undefined` なら消す）。 */
const replaced = (path: readonly string[], value: unknown): unknown => {
  const at = (current: unknown, rest: readonly string[]): unknown => {
    const [key, ...tail] = rest;
    if (key === undefined || typeof current !== "object" || current === null) {
      return value;
    }
    const fields: readonly Field[] = Object.entries(current);
    const others = fields.filter(([name]: Field) => name !== key);
    const child = fields.find(([name]: Field) => name === key)?.[1];
    const next = at(child, tail);
    return Object.fromEntries(next === undefined ? others : [...others, [key, next]]);
  };
  return at(valid, path);
};

test.each([
  { path: [], value: [], message: "targets: オブジェクトで書く" },
  { path: [], value: null, message: "targets: オブジェクトで書く" },
  { path: [], value: 1, message: "targets: オブジェクトで書く" },
  { path: ["extra"], value: 1, message: "targets.extra: 知らない項目" },
  { path: ["idle", "extra"], value: 1, message: "targets.idle.extra: 知らない項目" },
  { path: ["duration"], value: undefined, message: "targets.duration: 有限の数で書く" },
  { path: ["duration"], value: "1", message: "targets.duration: 有限の数で書く" },
  {
    path: ["duration"],
    value: Number.POSITIVE_INFINITY,
    message: "targets.duration: 有限の数で書く",
  },
  { path: ["duration"], value: Number.NaN, message: "targets.duration: 有限の数で書く" },
  { path: ["duration"], value: 0, message: "targets.duration: 正の数で書く" },
  { path: ["step"], value: -1, message: "targets.step: 正の数で書く" },
  { path: ["sampleEvery"], value: 0, message: "targets.sampleEvery: 正の数で書く" },
  { path: ["reasonable"], value: [], message: "targets.reasonable: 空でない配列で書く" },
  { path: ["reasonable"], value: "roi", message: "targets.reasonable: 空でない配列で書く" },
  {
    path: ["reasonable"],
    value: ["roi", "best"],
    message: "targets.reasonable[1]: 購入規則（efficiency・roi・cheapest・newest・random）で書く",
  },
  {
    path: ["milestones", "levels"],
    value: [1, 1],
    message: "targets.milestones.levels: 昇順（同じ値を含まない）で書く",
  },
  {
    path: ["milestones", "levels"],
    value: [2, 1],
    message: "targets.milestones.levels: 昇順（同じ値を含まない）で書く",
  },
  {
    path: ["milestones", "levels"],
    value: [1, "2"],
    message: "targets.milestones.levels[1]: 有限の数で書く",
  },
  {
    path: ["milestones", "ratio"],
    value: {},
    message: "targets.milestones.ratio: min か max の少なくとも一方を書く",
  },
  {
    path: ["milestones", "ratio"],
    value: [],
    message: "targets.milestones.ratio: オブジェクトで書く",
  },
  {
    path: ["milestones", "ratio"],
    value: { min: 2, max: 1 },
    message: "targets.milestones.ratio: min を max 以下にする",
  },
  {
    path: ["milestones", "ratio"],
    value: { min: "1" },
    message: "targets.milestones.ratio.min: 有限の数で書く",
  },
  {
    path: ["milestones", "ratio"],
    value: { max: "1" },
    message: "targets.milestones.ratio.max: 有限の数で書く",
  },
  {
    path: ["milestones", "ratio"],
    value: { mid: 1 },
    message: "targets.milestones.ratio.mid: 知らない項目",
  },
  {
    path: ["growth", "bounds"],
    value: undefined,
    message: "targets.growth.bounds: 空でない配列で書く",
  },
  {
    path: ["growth", "speed"],
    value: undefined,
    message: "targets.growth.speed: オブジェクトで書く",
  },
  {
    path: ["growth", "change"],
    value: undefined,
    message: "targets.growth.change: オブジェクトで書く",
  },
  {
    path: ["purchases", "median"],
    value: undefined,
    message: "targets.purchases.median: オブジェクトで書く",
  },
  {
    path: ["purchases", "longest"],
    value: undefined,
    message: "targets.purchases.longest: オブジェクトで書く",
  },
  {
    path: ["novelty", "perDay"],
    value: undefined,
    message: "targets.novelty.perDay: オブジェクトで書く",
  },
  {
    path: ["novelty", "longestGap"],
    value: undefined,
    message: "targets.novelty.longestGap: オブジェクトで書く",
  },
  { path: ["walls", "window"], value: 0, message: "targets.walls.window: 正の数で書く" },
  { path: ["walls", "below"], value: "0", message: "targets.walls.below: 有限の数で書く" },
  {
    path: ["walls", "longest"],
    value: undefined,
    message: "targets.walls.longest: オブジェクトで書く",
  },
  {
    path: ["choice", "best"],
    value: "best",
    message: "targets.choice.best: 購入規則（efficiency・roi・cheapest・newest・random）で書く",
  },
  {
    path: ["choice", "restricted"],
    value: [],
    message: "targets.choice.restricted: 空でない配列で書く",
  },
  {
    path: ["choice", "lead"],
    value: undefined,
    message: "targets.choice.lead: オブジェクトで書く",
  },
  {
    path: ["idle", "phases"],
    value: [600, 0],
    message: "targets.idle.phases: 昇順（同じ値を含まない）で書く",
  },
  { path: ["idle", "window"], value: 0, message: "targets.idle.window: 正の数で書く" },
  { path: ["idle", "efficiency"], value: "1", message: "targets.idle.efficiency: 有限の数で書く" },
  { path: ["idle", "reachBy"], value: "1", message: "targets.idle.reachBy: 有限の数で書く" },
  { path: ["idle", "reach"], value: 0, message: "targets.idle.reach: 正の数で書く" },
  { path: ["idle", "away"], value: [], message: "targets.idle.away: 空でない配列で書く" },
  { path: ["idle", "away"], value: [60], message: "targets.idle.away: 2 つ以上の値を書く" },
  { path: ["idle", "phases"], value: [0], message: "targets.idle.phases: 2 つ以上の値を書く" },
  {
    path: ["idle", "reachBy"],
    value: 601,
    message: "targets.idle.reachBy: 最後の局面（phases の最後）以下にする",
  },
  { path: ["growth", "bounds"], value: [0], message: "targets.growth.bounds: 2 つ以上の値を書く" },
  {
    path: ["milestones", "levels"],
    value: [1],
    message: "targets.milestones.levels: 2 つ以上の値を書く",
  },
  { path: ["milestones"], value: undefined, message: "targets.milestones: オブジェクトで書く" },
  { path: ["growth"], value: undefined, message: "targets.growth: オブジェクトで書く" },
  { path: ["purchases"], value: undefined, message: "targets.purchases: オブジェクトで書く" },
  { path: ["novelty"], value: undefined, message: "targets.novelty: オブジェクトで書く" },
  { path: ["walls"], value: undefined, message: "targets.walls: オブジェクトで書く" },
  { path: ["choice"], value: undefined, message: "targets.choice: オブジェクトで書く" },
  { path: ["idle"], value: undefined, message: "targets.idle: オブジェクトで書く" },
] as const)("parseTargets は $message で失敗する", ({ path, value, message }) => {
  const parse = (): unknown => parseTargets(replaced(path, value));
  expect(parse).toThrow(TargetsError);
  expect(parse).toThrow(message);
});

test("TargetsError の名前は TargetsError", () => {
  expect(new TargetsError("x").name).toBe("TargetsError");
});

test("parseTargets は min と max が等しい帯と、0 以下の効率・時刻を受け付ける", () => {
  const targets = parseTargets(
    replaced(["idle"], { ...valid.idle, efficiency: 0, reachBy: -1, phases: [-1, 0] }),
  );
  expect(targets.idle).toStrictEqual({
    ...valid.idle,
    efficiency: 0,
    reachBy: -1,
    phases: [-1, 0],
  });
  expect(parseTargets(replaced(["milestones", "ratio"], { min: 1, max: 1 }))).toHaveProperty(
    "milestones.ratio",
    { min: 1, max: 1 },
  );
});
