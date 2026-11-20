import Decimal from "break_eternity.js";

/**
 * ゲームで使う大きな数。break_eternity.js の Decimal で計算し、このモジュールの関数だけで作る・扱う。
 * 数の実装に問題が見つかったときに、このモジュールの内側だけで差し替えられるようにするため。
 *
 * 値は `sign * 10^10^…(layer 回)…^mag` を表す正規化された表現（break_eternity.js の内部表現）で持つ。
 * Decimal と違って変更できず、`toStrictEqual` で値どうしを比べられる。表現を読むのは保存（{@link toParts}）だけにする。
 *
 * 計算は浮動小数点の誤差を持つ（`2^3` が `7.999999999999999` になる）。等しさと大小は
 * 許容誤差付きの {@link approxEqual}・{@link atLeast} で比べる。
 */
class NumValue {
  // private なメンバーを持つクラスは構造で互換にならず、同じ形のオブジェクトを Num として渡せない。
  declare private readonly brand: never;
  readonly sign: number;
  readonly layer: number;
  readonly mag: number;

  constructor(sign: number, layer: number, mag: number) {
    this.sign = sign;
    this.layer = layer;
    this.mag = mag;
  }
}

export type Num = NumValue;

/** 等しいとみなす相対誤差の既定値。比べる 2 つの値の絶対値の大きいほうに掛ける。 */
export const DEFAULT_TOLERANCE = 1e-9;

/**
 * Decimal を計算して Num にする。Decimal は変更できる値なので、関数の引数では受け渡さない。
 *
 * @throws {RangeError} 結果が NaN か無限大のとき（0 での除算など）。{@link num} と同じく有限の値だけを Num にする。
 */
const compute = (calculate: () => Decimal): Num => {
  const result = calculate();
  if (!Decimal.isFinite(result)) {
    throw new RangeError(`有限の数ではない: ${result.toString()}`);
  }
  return new NumValue(result.sign, result.layer, result.mag);
};

const toDecimal = (value: Num): Decimal =>
  Decimal.fromComponents_noNormalize(value.sign, value.layer, value.mag);

/**
 * 有限の number から Num を作る。
 *
 * @throws {RangeError} `value` が NaN か無限大のとき。
 */
export function num(value: number): Num {
  return compute(() => Decimal.fromNumber(value));
}

export const ZERO: Num = num(0);

export function add(a: Num, b: Num): Num {
  return compute(() => toDecimal(a).add(toDecimal(b)));
}

export function sub(a: Num, b: Num): Num {
  return compute(() => toDecimal(a).sub(toDecimal(b)));
}

export function mul(a: Num, b: Num): Num {
  return compute(() => toDecimal(a).mul(toDecimal(b)));
}

export function div(a: Num, b: Num): Num {
  return compute(() => toDecimal(a).div(toDecimal(b)));
}

export function pow(base: Num, exponent: number): Num {
  return compute(() => toDecimal(base).pow(exponent));
}

export function max(a: Num, b: Num): Num {
  return compute(() => Decimal.max(toDecimal(a), toDecimal(b)));
}

// break_eternity.js の eq_tolerance・gte_tolerance は、10^(9e15) 以上（layer 1 以上）の値では指数に対して誤差を
// 測り、値どうしでは大きく違っても等しいとみなす（10^(1e9 - 0.9) と 10^1e9 など）。値の差の、大きいほうに対する
// 割合で測る。差と `tolerance × 大きいほう` を比べないのは、layer 2 以上では両方が大きいほうと同じ値に丸まり、
// 10^(1e17) と 10^(2e17) も等しいとみなしてしまうため。割合なら 0〜2 の範囲で計算できる。
const withinTolerance = (a: Num, b: Num, tolerance: number): boolean => {
  const left = toDecimal(a);
  const right = toDecimal(b);
  const scale = Decimal.max(left.abs(), right.abs());
  return scale.eq(0) || left.sub(right).abs().div(scale).lte(tolerance);
};

/** `|a - b|` が `tolerance × max(|a|, |b|)` 以下。 */
export function approxEqual(a: Num, b: Num, tolerance: number = DEFAULT_TOLERANCE): boolean {
  return withinTolerance(a, b, tolerance);
}

/** `a` が `b` 以上であるか、{@link approxEqual} の意味で `b` と等しい。 */
export function atLeast(a: Num, b: Num, tolerance: number = DEFAULT_TOLERANCE): boolean {
  return toDecimal(a).gte(toDecimal(b)) || withinTolerance(a, b, tolerance);
}

/**
 * 0 以上の `value` について、`atLeast(a, value, tolerance)` が真になる境目の `a`（`value × (1 − tolerance)`）。
 * 額が貯まって {@link atLeast} が真になる時刻を求めるのに使う。丸め誤差のため、この値ちょうどでは
 * `atLeast` が偽になることがある。
 */
export function toleranceFloor(value: Num, tolerance: number = DEFAULT_TOLERANCE): Num {
  return compute(() => toDecimal(value).mul(1 - tolerance));
}

/** number に変換する。number で表せない大きさは `Infinity`・`-Infinity`、小ささは 0 になる。 */
export function toNumber(value: Num): number {
  return toDecimal(value).toNumber();
}

/**
 * 機械が読むための文字列。break_eternity.js の表記で、`1234.5`、`3.3e-12`、`1.5e400`、`ee20` のような形になる。
 * break_eternity.js の `Decimal.fromString` で同じ値に読み戻せる。break_eternity.js が number 1 つで持つ値
 * （layer 0。大きさがおよそ 1e-16 以上 9e15 未満）は JavaScript の数の表記にする。break_eternity.js の表記は 1e-7 未満
 * で末尾の桁がずれ、読み戻すと値が変わるため。それより大きい・小さい値は break_eternity.js の表記のままで、
 * `1.5000000000000004e16` のように末尾の桁が付くことがあるが、読み戻すと同じ値になる。
 */
export function toText(value: Num): string {
  const decimal = toDecimal(value);
  return decimal.layer === 0 ? String(decimal.sign * decimal.mag) : decimal.toString();
}

/** 表示で端数をどちらへ丸めるか。`down` は 0 の方向、`up` は大きいほうへ。 */
export type Rounding = "down" | "up";

const roundings: Readonly<Record<Rounding, (value: number) => number>> = {
  down: Math.trunc,
  up: Math.ceil,
};

/**
 * 表示用の文字列。絶対値が 10 億未満なら整数、それ以上は仮数を小数第 2 位までにした指数表記（`1.23e45`）。
 * 端数は `rounding` の方向へ丸める（持っている額は切り捨て、値段は切り上げて、足りない額を足りるように
 * 見せない）。指数も 9e15 以上の大きさは break_eternity.js の表記（`ee20` など）。
 * 丸める前に有効数字 12 桁に丸め、7.999… のような誤差で 1 小さく見せない。
 */
export function format(value: Num, rounding: Rounding = "down"): string {
  const round = roundings[rounding];
  const decimal = toDecimal(value);
  // number で表せない大きさは Infinity になり、次の比較で指数表記へ進む。
  const small = Number(decimal.toNumber().toPrecision(12));
  if (Math.abs(round(small)) < 1e9) {
    return round(small).toString();
  }
  if (decimal.layer >= 2) {
    return decimal.toString();
  }
  // 100 倍でも 1.13 * 100 = 112.99… のような誤差が出るため、もう一度丸めてから端数を丸める。
  const hundredths = round(Number((decimal.m * 100).toPrecision(12)));
  // 仮数は誤差や切り上げで 10（つまり指数が 1 つ上）になりうる。
  const carry = Math.abs(hundredths) >= 1000 ? 1 : 0;
  return `${(hundredths / 100 / 10 ** carry).toFixed(2)}e${decimal.e + carry}`;
}

/** 保存用の表現。Num と同じく `sign * 10^10^…(layer 回)…^mag` を表す。 */
export interface NumParts {
  readonly sign: number;
  readonly layer: number;
  readonly mag: number;
}

export function toParts(value: Num): NumParts {
  const { sign, layer, mag } = value;
  return { sign, layer, mag };
}

/**
 * 保存用の表現から Num を作る。正規化された表現（{@link toParts} が返す形）でなければ `undefined` を返す。
 */
export function fromParts(parts: NumParts): Num | undefined {
  const { sign, layer, mag } = parts;
  if (
    !(sign === -1 || sign === 0 || sign === 1) ||
    !Number.isSafeInteger(layer) ||
    layer < 0 ||
    !Number.isFinite(mag) ||
    // 正規化された表現では layer 1 以上の mag は 0 にならない。break_eternity.js の正規化はこの入力で
    // layer を 1 ずつ減らし続け、layer が大きいと戻らない。
    (layer > 0 && mag === 0)
  ) {
    return undefined;
  }
  const value = compute(() => Decimal.fromComponents(sign, layer, mag));
  if (!Object.is(value.sign, sign) || value.layer !== layer || !Object.is(value.mag, mag)) {
    return undefined;
  }
  return value;
}
