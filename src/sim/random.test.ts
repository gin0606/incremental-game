import { expect, test } from "vitest";

import type { Rng } from "./random.ts";
import { nextFloat, pick, seeded } from "./random.ts";

const take = (rng: Rng, count: number): readonly number[] => {
  const values: number[] = [];
  let current = rng;
  for (let index = 0; index < count; index += 1) {
    const { value, rng: next } = nextFloat(current);
    values.push(value);
    current = next;
  }
  return values;
};

// 期待値は、公開されている mulberry32 の手順を Python で書き直した別の実装で求めた。
test.each([
  {
    seed: 0,
    expected: [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197],
  },
  {
    seed: 1,
    expected: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522],
  },
  {
    seed: 42,
    expected: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099],
  },
] as const)("シード $seed からは mulberry32 の列が出る", ({ seed, expected }) => {
  expect(take(seeded(seed), 3)).toStrictEqual(expected);
});

test("シードは下位 32 ビットだけを使う", () => {
  expect(seeded(2 ** 32 + 1)).toStrictEqual(seeded(1));
  expect(seeded(-1)).toStrictEqual({ state: 2 ** 32 - 1 });
});

test("状態は変更せず、次の状態を返す", () => {
  const rng = seeded(7);
  const first = nextFloat(rng);

  expect(nextFloat(rng)).toStrictEqual(first);
  expect(nextFloat(first.rng).value).not.toBe(first.value);
});

test("値は 0 以上 1 未満", () => {
  const values = take(seeded(3), 10_000);

  expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...values)).toBeLessThan(1);
});

test("pick は値の大きさに応じて候補を選ぶ", () => {
  // シード 0 の最初の値は 0.266…、シード 1 は 0.627…。
  expect(pick(seeded(0), ["a", "b", "c", "d"]).item).toBe("b");
  expect(pick(seeded(1), ["a", "b", "c", "d"]).item).toBe("c");
  expect(pick(seeded(1), ["a", "b", "c", "d"]).rng).toStrictEqual(nextFloat(seeded(1)).rng);
});

test("pick は空の候補から選べない", () => {
  expect(() => pick(seeded(0), [])).toThrow(new RangeError("空の候補からは選べない"));
});
