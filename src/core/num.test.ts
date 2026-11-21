import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { Num, NumParts } from "./num.ts";
import {
  DEFAULT_TOLERANCE,
  add,
  approxEqual,
  atLeast,
  div,
  format,
  fromParts,
  log10,
  max,
  mul,
  num,
  pow,
  sub,
  toNumber,
  toParts,
  toText,
  toleranceFloor,
} from "./num.ts";

/** 10^exponent。number の範囲を超える大きさも表す。 */
const tenTo = (exponent: number): Num => pow(num(10), exponent);

test.each([
  { name: "小さい数", a: num(0.1), b: num(0.2), expected: num(0.3) },
  { name: "負の数", a: num(-5), b: num(3), expected: num(-2) },
  {
    name: "number を超える大きさ",
    a: tenTo(400),
    b: tenTo(400),
    expected: mul(num(2), tenTo(400)),
  },
  { name: "桁の離れた数", a: tenTo(400), b: num(1), expected: tenTo(400) },
] as const)("加算: $name", ({ a, b, expected }) => {
  expect(add(a, b)).toBeApprox(expected);
});

test.each([
  { name: "小さい数", a: num(1.1), b: num(1.1), expected: num(1.21) },
  { name: "number を超える大きさ", a: tenTo(300), b: tenTo(300), expected: tenTo(600) },
  { name: "0 を掛ける", a: tenTo(1000), b: num(0), expected: num(0) },
] as const)("乗算: $name", ({ a, b, expected }) => {
  expect(mul(a, b)).toBeApprox(expected);
});

test("減算と除算", () => {
  expect(sub(tenTo(500), tenTo(499))).toBeApprox(mul(num(9), tenTo(499)));
  expect(div(tenTo(500), tenTo(498))).toBeApprox(num(100));
});

test.each([
  // break_eternity.js 2.2.2 は 2^3 を 7.999999999999999 にする。許容誤差付きの比較なら 8 と等しい。
  { name: "2^3", base: 2, exponent: 3, expected: num(8) },
  { name: "1.15^10", base: 1.15, exponent: 10, expected: num(1.15 ** 10) },
  { name: "10^1000", base: 10, exponent: 1000, expected: mul(tenTo(500), tenTo(500)) },
  { name: "負の指数", base: 2, exponent: -2, expected: num(0.25) },
] as const)("累乗: $name", ({ base, exponent, expected }) => {
  expect(pow(num(base), exponent)).toBeApprox(expected);
});

test("max は大きいほうを返す", () => {
  expect(max(num(1), tenTo(400))).toStrictEqual(tenTo(400));
  expect(max(num(3), num(-4))).toStrictEqual(num(3));
});

test("approxEqual は相対誤差の範囲内を等しいとみなし、範囲外を区別する", () => {
  expect(approxEqual(num(1), num(1 + 1e-12))).toBe(true);
  expect(approxEqual(num(1), num(1 + 1e-6))).toBe(false);
  expect(approxEqual(tenTo(500), mul(tenTo(500), num(1 + 1e-12)))).toBe(true);
  expect(approxEqual(tenTo(500), tenTo(501))).toBe(false);
  // 差 0.1 を大きいほうの 1.1 に対する割合で測る。
  expect(approxEqual(num(1), num(1.1), 0.095)).toBe(true);
  expect(approxEqual(num(1), num(1.1), 0.09)).toBe(false);
  expect(approxEqual(num(0), num(0))).toBe(true);
  expect(approxEqual(num(-1), num(1))).toBe(false);
});

test("approxEqual と atLeast は 10^(9e15) を超える大きさでも値の差で比べる", () => {
  // 指数どうしなら相対誤差 1e-9 の範囲に入るが、値は 10 倍・10^5 倍違う。
  expect(approxEqual(tenTo(1e10), tenTo(1e10 + 5))).toBe(false);
  expect(atLeast(tenTo(1e9 - 0.9), tenTo(1e9))).toBe(false);
  expect(atLeast(tenTo(1e17), mul(tenTo(1e17), num(1 + 1e-12)))).toBe(true);
  expect(atLeast(mul(num(1 - 1e-8), num(1e17)), num(1e17))).toBe(false);
  // layer 2 の値。
  expect(atLeast(tenTo(1e17), tenTo(2e17))).toBe(false);
  expect(approxEqual(tenTo(1e17), tenTo(2e17))).toBe(false);
  expect(atLeast(tenTo(2e17), tenTo(1e17))).toBe(true);
  expect(approxEqual(tenTo(2e17), tenTo(2e17))).toBe(true);
});

test("atLeast は大きいか、相対誤差の範囲で等しいときに真", () => {
  expect(atLeast(num(2), num(1))).toBe(true);
  expect(atLeast(num(1), num(2))).toBe(false);
  expect(atLeast(num(8), pow(num(2), 3))).toBe(true);
  expect(atLeast(pow(num(2), 3), num(8))).toBe(true);
  expect(atLeast(num(1 - DEFAULT_TOLERANCE / 10), num(1))).toBe(true);
  expect(atLeast(num(1 - DEFAULT_TOLERANCE * 10), num(1))).toBe(false);
  expect(atLeast(tenTo(1001), tenTo(1000))).toBe(true);
  expect(atLeast(tenTo(1000), tenTo(1001))).toBe(false);
});

test("toleranceFloor は atLeast が真になる最小の値（値 × (1 − 許容誤差)）", () => {
  const price = num(11.5);
  const floor = toleranceFloor(price);

  expect(floor).toBeApprox(num(11.5 * (1 - DEFAULT_TOLERANCE)), 1e-15);
  expect(atLeast(floor, price)).toBe(true);
  expect(atLeast(mul(floor, num(1 - 1e-12)), price)).toBe(false);
  expect(toleranceFloor(price, 0.5)).toBeApprox(num(5.75));
});

test("計算の結果が有限の数でなければ RangeError", () => {
  expect(() => div(num(1), num(0))).toThrow(new RangeError("有限の数ではない: NaN"));
  expect(() => div(num(0), num(0))).toThrow(new RangeError("有限の数ではない: NaN"));
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  "num(%s) は RangeError",
  (value) => {
    expect(() => num(value)).toThrow(new RangeError(`有限の数ではない: ${value}`));
  },
);

test("toNumber は number で表せない大きさを Infinity にする", () => {
  expect(toNumber(num(12.5))).toBe(12.5);
  expect(toNumber(tenTo(400))).toBe(Number.POSITIVE_INFINITY);
});

test.each([
  { name: "1000", value: num(1000), expected: 3 },
  { name: "number を超える大きさ", value: tenTo(400), expected: 400 },
  { name: "10^10^20", value: tenTo(1e20), expected: 1e20 },
  { name: "小さい正の数", value: num(1e-300), expected: -300 },
] as const)("log10 は常用対数（$name）", ({ value, expected }) => {
  expect(log10(value)).toBeCloseTo(expected, 10);
});

test("log10 は 0 以下に -Infinity を、対数が number を超える大きさに Infinity を返す", () => {
  expect(log10(num(0))).toBe(Number.NEGATIVE_INFINITY);
  expect(log10(num(-5))).toBe(Number.NEGATIVE_INFINITY);
  expect(log10(pow(tenTo(1e305), 1e10))).toBe(Number.POSITIVE_INFINITY);
});

/** 表現をそのまま値にする（計算の誤差を含まない大きな値）。読めない表現なら NaN の代わりに 0。 */
const exactly = (parts: NumParts): Num => fromParts(parts) ?? num(0);

test.each([
  { value: num(0), expected: "0" },
  { value: num(12.9), expected: "12" },
  { value: num(999_999_999.9), expected: "999999999" },
  { value: num(-12.9), expected: "-12" },
  { value: num(1e9), expected: "1.00e9" },
  // 誤差で整数をわずかに下回る値。
  { value: pow(num(2), 3), expected: "8" },
  { value: pow(num(11), 8), expected: "214358881" },
  { value: num(0.9999999), expected: "0" },
  // 丸めると 10 億になる値は指数表記にする。
  { value: num(999_999_999.9999999), expected: "1.00e9" },
  // 仮数を 100 倍すると 112.99… などになる値。
  { value: num(1.13e9), expected: "1.13e9" },
  { value: num(1.15e9), expected: "1.15e9" },
  { value: num(4.35e9), expected: "4.35e9" },
  { value: mul(num(1.15), tenTo(400)), expected: "1.15e400" },
  { value: num(-2.5e20), expected: "-2.50e20" },
  { value: tenTo(400), expected: "1.00e400" },
  { value: mul(num(9.999), tenTo(400)), expected: "9.99e400" },
  // 10^401 は仮数 9.999999999997…、指数 400 で表される。
  { value: tenTo(401), expected: "1.00e401" },
  { value: tenTo(1e20), expected: "ee20" },
] as const)("format: $expected", ({ value, expected }) => {
  expect(format(value)).toBe(expected);
});

test.each([
  { value: num(11.5), expected: "12" },
  { value: num(12), expected: "12" },
  { value: pow(num(2), 3), expected: "8" },
  { value: num(999_999_999.5), expected: "1.00e9" },
  { value: num(1.131e9), expected: "1.14e9" },
  { value: num(9.991e9), expected: "1.00e10" },
  { value: num(1.13e9), expected: "1.13e9" },
] as const)("format(…, up) は端数を切り上げる: $expected", ({ value, expected }) => {
  expect(format(value, "up")).toBe(expected);
});

/** number の範囲の数と、10^(±1e300) までの大きさ・小ささの数（layer 2 まで）。 */
const numValue: fc.Arbitrary<Num> = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }).map((value) => num(value)),
  fc
    .tuple(
      fc.double({ min: -10, max: 10, noNaN: true }),
      fc.double({ min: -1e300, max: 1e300, noNaN: true }),
    )
    .map(([mantissa, exponent]: readonly [number, number]) => mul(num(mantissa), tenTo(exponent))),
);

test("toParts で取り出した表現は fromParts で同じ値に戻る", () => {
  fc.assert(
    fc.property(numValue, (value) => {
      expect(fromParts(toParts(value))).toStrictEqual(value);
    }),
  );
});

test.each([
  { name: "sign が -1・0・1 以外", parts: { sign: 2, layer: 0, mag: 1 } },
  { name: "layer が負", parts: { sign: 1, layer: -1, mag: 1 } },
  { name: "layer が整数でない", parts: { sign: 1, layer: 0.5, mag: 1 } },
  { name: "mag が NaN", parts: { sign: 1, layer: 0, mag: Number.NaN } },
  { name: "mag が無限大", parts: { sign: 1, layer: 0, mag: Number.POSITIVE_INFINITY } },
  { name: "正規化されていない（layer 0 で mag が負）", parts: { sign: 1, layer: 0, mag: -1 } },
  { name: "正規化されていない（layer 1 で mag が小さい）", parts: { sign: 1, layer: 1, mag: 2 } },
  { name: "正規化されていない（0 なのに sign が 1）", parts: { sign: 1, layer: 0, mag: 0 } },
  { name: "正規化されていない（0 なのに layer が 1）", parts: { sign: 0, layer: 1, mag: 0 } },
  // 正規化が戻らなくなる入力。
  { name: "layer が大きく mag が 0", parts: { sign: 1, layer: Number.MAX_SAFE_INTEGER, mag: 0 } },
  { name: "layer が 1 で mag が 0", parts: { sign: 1, layer: 1, mag: 0 } },
] as const)("fromParts は不正な表現に undefined を返す: $name", ({ parts }) => {
  expect(fromParts(parts)).toBeUndefined();
});

test.each([
  { value: num(0), expected: "0" },
  { value: num(-1234.5), expected: "-1234.5" },
  { value: num(1e-8), expected: "1e-8" },
  // break_eternity.js の toString は 3.3000000000000003e-12 にし、読み戻すと別の値になる。
  { value: num(3.3e-12), expected: "3.3e-12" },
  { value: exactly({ sign: 1, layer: 1, mag: 400 }), expected: "1e400" },
  { value: exactly({ sign: 1, layer: 2, mag: 20 }), expected: "ee20" },
] as const)("toText は break_eternity.js の表記にする（$expected）", ({ value, expected }) => {
  expect(toText(value)).toBe(expected);
});
