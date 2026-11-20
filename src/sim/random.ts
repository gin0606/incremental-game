/**
 * シード付きの乱数（mulberry32）。状態を変更せず、次の値と次の状態を組で返す。同じシードからは、実行環境によらず
 * 同じ列が出る。
 */
export interface Rng {
  /** 32 ビットの符号なし整数。 */
  readonly state: number;
}

/** `seed` の下位 32 ビットを状態にする。 */
export function seeded(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** 0 以上 1 未満の値。 */
export function nextFloat(rng: Rng): { readonly value: number; readonly rng: Rng } {
  // 0x6D2B79F5。16 進で書くと、oxfmt が小文字にし、lint（unicorn/number-literal-case）が大文字を求めて両立しない。
  const state = (rng.state + 1_831_565_813) >>> 0;
  let mixed = Math.imul(state ^ (state >>> 15), state | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32, rng: { state } };
}

/**
 * `items` から等しい確率で 1 つ選ぶ。
 *
 * @throws {RangeError} `items` が空のとき。
 */
export function pick<T>(rng: Rng, items: readonly T[]): { readonly item: T; readonly rng: Rng } {
  const { value, rng: next } = nextFloat(rng);
  const item = items[Math.floor(value * items.length)];
  if (item === undefined) {
    throw new RangeError("空の候補からは選べない");
  }
  return { item, rng: next };
}
