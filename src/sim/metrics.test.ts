import { expect, test } from "vitest";

import { ZERO, num, pow } from "../core/num.ts";
import {
  consecutive,
  gaps,
  grid,
  largest,
  largestLead,
  levelsAt,
  longestWall,
  median,
  milestoneRatios,
  milestoneTimes,
  segmentSpeeds,
  speedChanges,
  zip,
} from "./metrics.ts";
import type { Entry } from "./simulate.ts";

const tenTo = (exponent: number): ReturnType<typeof num> => pow(num(10), exponent);

/** 時刻と生産量の常用対数の組から、記録の時系列を作る。 */
const samples = (points: readonly (readonly [number, number])[]): Entry[] =>
  points.map(([t, level]) => ({ kind: "sample", t, resource: ZERO, rate: tenTo(level) }));

test("consecutive は隣り合う 2 つの組を順に返し、1 つ以下なら空", () => {
  expect(consecutive([1, 2, 3])).toStrictEqual([
    [1, 2],
    [2, 3],
  ]);
  expect(consecutive([1])).toStrictEqual([]);
  expect(consecutive([])).toStrictEqual([]);
});

test("consecutive は undefined の要素も組にする", () => {
  expect(consecutive([undefined, 1])).toStrictEqual([[undefined, 1]]);
});

test("zip は同じ位置の組を返し、長さが違えば短いほうに合わせる", () => {
  expect(zip([1, 2, 3], ["a", "b"])).toStrictEqual([
    [1, "a"],
    [2, "b"],
  ]);
  expect(zip([1], ["a", "b"])).toStrictEqual([[1, "a"]]);
});

test("grid は 0 から end まで every ごとの時刻を返し、end が割り切れなければ end の手前で止める", () => {
  expect(grid(10, 30)).toStrictEqual([0, 10, 20, 30]);
  expect(grid(10, 25)).toStrictEqual([0, 10, 20]);
  expect(grid(10, 0)).toStrictEqual([0]);
  // 0.3 / 0.1 は丸め誤差で 2.9999… になるが、0.3 の手前の時刻まで含める。
  expect(grid(0.1, 0.3)).toHaveLength(4);
  expect(grid(0.1, 0.3 * (1 - 1e-6))).toHaveLength(3);
  expect(grid(1, 2 - 5e-10)).toStrictEqual([0, 1]);
  // 8 ulp 程度の差までは end の時刻とみなす。
  expect(grid(1, 3 * (1 - 8 * Number.EPSILON))).toStrictEqual([0, 1, 2, 3]);
});

test("levelsAt はその時刻までの最後の記録の生産量の常用対数を返し、最初の記録より前は -Infinity", () => {
  const timeline = samples([
    [10, 1],
    [20, 2],
    [20, 3],
    [40, 4],
  ]);
  expect(levelsAt(timeline, [5, 10, 15, 20, 39, 40, 100])).toStrictEqual([
    Number.NEGATIVE_INFINITY,
    1,
    1,
    3,
    3,
    4,
    4,
  ]);
});

test("levelsAt は生産量が 0 の時期を -Infinity にする", () => {
  const timeline: Entry[] = [{ kind: "sample", t: 0, resource: ZERO, rate: ZERO }];
  expect(levelsAt(timeline, [0])).toStrictEqual([Number.NEGATIVE_INFINITY]);
});

test("milestoneTimes は各節目に初めて達した記録の時刻を返し、達しなければ undefined", () => {
  const timeline = samples([
    [0, 0],
    [10, 1],
    [20, 0.5],
    [30, 2],
  ]);
  expect(milestoneTimes(timeline, [0, 0.5, 1, 2, 3])).toStrictEqual([0, 10, 10, 30, undefined]);
});

test("milestoneRatios は続けて達した節目どうしの時刻の比を返し、前が 0 か達していない組を除く", () => {
  expect(milestoneRatios([0, 10, 30, undefined, 50, 100])).toStrictEqual([3, 2]);
  expect(milestoneRatios([10, undefined])).toStrictEqual([]);
});

test("segmentSpeeds は区間ごとに 1 時間あたりに伸びた桁数を返す", () => {
  const timeline = samples([
    [0, 1],
    [3600, 3],
    [5400, 4],
  ]);
  expect(segmentSpeeds(timeline, [0, 3600, 5400])).toStrictEqual([2, 2]);
  expect(segmentSpeeds(timeline, [1800, 5400])).toStrictEqual([3 / 1]);
});

test("speedChanges は隣り合う区間の速度の比を返し、前の速度が 0 以下の組を除く", () => {
  expect(speedChanges([2, 1, 0, 3, -1, 2])).toStrictEqual([0.5, 0, -1 / 3]);
});

test("gaps は時刻の重なりを除いて昇順に並べた間隔を返し、end を渡すと最後から end までも含める", () => {
  expect(gaps([30, 10, 10, 0])).toStrictEqual([10, 20]);
  expect(gaps([30, 10], 100)).toStrictEqual([20, 70]);
  expect(gaps([], 100)).toStrictEqual([]);
  expect(gaps([5])).toStrictEqual([]);
});

test.each([
  { values: [9, 1, 2], expected: 2 },
  { values: [10, 1, 3, 2], expected: 2.5 },
  { values: [7], expected: 7 },
  { values: [], expected: undefined },
] as const)("median($values) は $expected", ({ values, expected }) => {
  expect(median(values)).toBe(expected);
});

test("longestWall は速度が below を下回る区間が続いた範囲の最長を、最初の区間の始まりから最後の区間の終わりまでで測る", () => {
  // 0〜2 時間は毎時 1 桁、2〜5 時間は伸びず、5〜6 時間は毎時 1 桁。
  const timeline = samples([
    [0, 0],
    [3600, 1],
    [7200, 2],
    [18_000, 2],
    [21_600, 3],
  ]);
  const settings = { window: 3600, below: 0.5, every: 3600, duration: 21_600 };
  // 2〜3・3〜4・4〜5 時間の区間が壁。
  expect(longestWall(timeline, settings)).toBe(3 * 3600);
  expect(longestWall(timeline, { ...settings, below: 0 })).toBe(0);
});

test("longestWall は途切れた壁を別々に測り、長いほうを返す", () => {
  const timeline = samples([
    [0, 0],
    [3600, 0],
    [7200, 1],
    [10_800, 1],
    [14_400, 1],
    [18_000, 2],
  ]);
  const settings = { window: 3600, below: 0.5, every: 3600, duration: 18_000 };
  expect(longestWall(timeline, settings)).toBe(2 * 3600);
});

test("longestWall は区間の長さで割って 1 時間あたりの速度にする", () => {
  // 2 時間ごとに 1 桁（毎時 0.5 桁）。
  const timeline = samples([
    [0, 0],
    [7200, 1],
    [14_400, 2],
  ]);
  expect(longestWall(timeline, { window: 7200, below: 1, every: 7200, duration: 14_400 })).toBe(
    14_400,
  );
});

test("longestWall は終わりが duration に丸め誤差の範囲で届く区間を使う", () => {
  // 10.1 - 10 は 0.0999… になるが、0.1 から始まる区間は 10.1 で終わる。
  expect(longestWall(samples([[0, 0]]), { window: 10, below: 1, every: 0.1, duration: 10.1 })).toBe(
    10.1,
  );
  // 8 ulp 程度の差までは duration に届くとみなす。
  const duration = 3 * (1 - 8 * Number.EPSILON);
  expect(longestWall(samples([[0, 0]]), { window: 3, below: 1, every: 1, duration })).toBe(
    duration,
  );
  // 0.1 + 2.2 は 2.3000000000000003 になるが、壁は遊んだ時間を超えない。
  expect(longestWall(samples([[0, 0]]), { window: 2.2, below: 1, every: 0.1, duration: 2.3 })).toBe(
    2.3,
  );
});

test("longestWall は終わりが duration を超える区間を使わない", () => {
  const timeline = samples([
    [0, 0],
    [3600, 1],
  ]);
  expect(longestWall(timeline, { window: 3600, below: 0.5, every: 1800, duration: 5400 })).toBe(0);
});

test("largestLead は every ごとの時刻で best が other より先行した最大の桁数を返し、常に遅れていれば負", () => {
  const best = samples([
    [0, 1],
    [10, 3],
    [20, 3],
  ]);
  const other = samples([
    [0, 1],
    [5, 2],
    [20, 2.5],
  ]);
  expect(largestLead(best, other, 10, 20)).toBe(1);
  expect(largestLead(other, best, 10, 20)).toBe(0);
  expect(largestLead(samples([[0, 0]]), samples([[0, 1]]), 10, 20)).toBe(-1);
});

test("largestLead は duration の時刻まで比べる", () => {
  const best = samples([
    [0, 1],
    [20, 5],
  ]);
  const other = samples([[0, 1]]);
  expect(largestLead(best, other, 10, 20)).toBe(4);
  expect(largestLead(best, other, 10, 19)).toBe(0);
});

test("levelsAt は number を超える生産量も常用対数で返す", () => {
  const [level] = levelsAt(samples([[0, 500]]), [0]);
  expect(level).toBeCloseTo(500, 10);
});

test("largest は最大値を返し、空なら -Infinity、NaN を含めば NaN。要素が多くても引数の上限に当たらない", () => {
  expect(largest([1, 3, 2])).toBe(3);
  expect(largest([-2, -1])).toBe(-1);
  expect(largest([])).toBe(Number.NEGATIVE_INFINITY);
  expect(largest([1, Number.NaN, 2])).toBeNaN();
  expect(largest([Number.NaN, 2])).toBeNaN();
  expect(largest(Array.from({ length: 1_000_000 }, (_, index) => index))).toBe(999_999);
});

test("生産量が 0 のまま（常用対数が -Infinity のまま）の区間は伸びが 0 で、壁に数え、先行は 0", () => {
  const zero: Entry[] = [{ kind: "sample", t: 0, resource: ZERO, rate: ZERO }];
  expect(segmentSpeeds(zero, [0, 3600])).toStrictEqual([0]);
  expect(longestWall(zero, { window: 3600, below: 0.5, every: 3600, duration: 7200 })).toBe(7200);
  expect(largestLead(zero, zero, 10, 20)).toBe(0);
  expect(largestLead(samples([[0, 1]]), zero, 10, 20)).toBe(Number.POSITIVE_INFINITY);
});

test("対数が number を超える生産量どうしの伸びと先行は測れず NaN", () => {
  const huge: Entry[] = [{ kind: "sample", t: 0, resource: ZERO, rate: pow(tenTo(1e305), 1e10) }];
  expect(segmentSpeeds(huge, [0, 3600])).toStrictEqual([Number.NaN]);
  expect(largestLead(huge, huge, 10, 10)).toBeNaN();
  expect(longestWall(huge, { window: 3600, below: 0.5, every: 3600, duration: 7200 })).toBe(7200);
});
