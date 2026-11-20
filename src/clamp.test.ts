import * as fc from "fast-check";
import { expect, test } from "vitest";

import { clamp } from "./clamp.ts";

type Pair = readonly [number, number];
type Triple = readonly [number, number, number];

const sortPair = ([a, b]: Pair): Pair => (a <= b ? [a, b] : [b, a]);

const sortTriple = ([a, b, c]: Triple): Triple => {
  const [low, high] = sortPair([a, b]);
  if (c <= low) {
    return [c, low, high];
  }
  return c <= high ? [low, c, high] : [low, high, c];
};

const number = fc.double({ noNaN: true });
const range = fc.tuple(number, number).map((pair: Pair) => sortPair(pair));

test("結果は範囲に収まる", () => {
  fc.assert(
    fc.property(number, range, (value, [min, max]) => {
      const result = clamp(value, min, max);

      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
    }),
  );
});

test("範囲内の値はそのまま返す", () => {
  const ordered = fc.tuple(number, number, number).map((triple: Triple) => sortTriple(triple));
  fc.assert(
    fc.property(ordered, ([min, value, max]) => {
      expect(clamp(value, min, max)).toBe(value);
    }),
  );
});

test("min より小さい値は min になる", () => {
  fc.assert(
    fc.property(number, range, (value, [min, max]) => {
      fc.pre(value < min);

      expect(clamp(value, min, max)).toBe(min);
    }),
  );
});

test("max より大きい値は max になる", () => {
  fc.assert(
    fc.property(number, range, (value, [min, max]) => {
      fc.pre(value > max);

      expect(clamp(value, min, max)).toBe(max);
    }),
  );
});

test.each([
  { value: -0, min: 0, max: 1 },
  { value: 0, min: -1, max: -0 },
] as const)(
  "端と等しい値は符号付きゼロも含めてそのまま返す（value: $value, min: $min, max: $max）",
  ({ value, min, max }) => {
    expect(clamp(value, min, max)).toBe(value);
  },
);

test("min と max が等しいときはその値になる", () => {
  expect(clamp(5, 3, 3)).toBe(3);
});

test("min が max より大きいと RangeError を投げる", () => {
  expect(() => clamp(0, 1, 0)).toThrow(new RangeError("min (1) が max (0) より大きい"));
});
