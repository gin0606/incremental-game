/**
 * `value` を `min` 以上 `max` 以下に収める。引数に NaN を渡さない（比較がすべて偽になり、範囲に収まらない）。
 *
 * @throws {RangeError} `min` が `max` より大きいとき。
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`min (${min}) が max (${max}) より大きい`);
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
