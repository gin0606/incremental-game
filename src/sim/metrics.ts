// シミュレーターの時系列から、ペースの指標（節目、対数成長速度、2 つの時刻の毎秒の生産量の比、購入間隔、
// 新要素、壁、選択の重み）を求める。
// 指標の意味と、目標値と比べる理由は docs/design/README.md にある。
import type { Num } from "../core/num.ts";
import { ZERO, atLeast, div, log10, toNumber } from "../core/num.ts";
import type { Entry } from "./simulate.ts";

const HOUR = 3600;

/** 隣り合う 2 つの組。 */
export function consecutive<T>(values: readonly T[]): (readonly [T, T])[] {
  const pairs: (readonly [T, T])[] = [];
  let previous: { readonly value: T } | undefined;
  for (const value of values) {
    if (previous !== undefined) {
      pairs.push([previous.value, value]);
    }
    previous = { value };
  }
  return pairs;
}

/** 同じ位置の 2 つの組。長さが違えば短いほうに合わせる。 */
export function zip<A, B>(left: readonly A[], right: readonly B[]): (readonly [A, B])[] {
  const others = right[Symbol.iterator]();
  return left.flatMap((value) => {
    const other = others.next();
    return other.done === true ? [] : [[value, other.value] as const];
  });
}

/**
 * `end` が `every` の整数倍とみなせるかの相対誤差。0.3 / 0.1 が 2.9999… になるような割り算と掛け算の丸め誤差（数 ulp）
 * だけを吸収し、最後の時刻を落とさないようにする。本当に `end` を超える時刻は含めない。
 */
const GRID_TOLERANCE = 8 * Number.EPSILON;

/** 0 から `end` まで `every` ごとの時刻。 */
export function grid(every: number, end: number): number[] {
  const whole = Math.floor(end / every);
  const count = (whole + 1) * every <= end * (1 + GRID_TOLERANCE) ? whole + 1 : whole;
  return Array.from({ length: count + 1 }, (_, index) => index * every);
}

/**
 * 生産量の常用対数が `from` から `to` に伸びた桁数。どちらも同じ有限の値か、どちらも生産量 0（`-Infinity`）なら 0。
 * どちらも対数が number を超える（`Infinity`）ときは伸びを測れず `NaN`（帯の外になる）。
 */
const rise = (from: number, to: number): number =>
  from === to && from !== Number.POSITIVE_INFINITY ? 0 : to - from;

/**
 * 最大値。空なら `-Infinity`、`NaN` を含めば `NaN`（測れなかった値を帯の外にする）。`Math.max(...values)` と違い、要素が
 * 多くても呼び出しの引数の上限に当たらない。
 */
export function largest(values: readonly number[]): number {
  return values.reduce(
    (found, value) => (value > found || Number.isNaN(value) ? value : found),
    Number.NEGATIVE_INFINITY,
  );
}

/**
 * 時刻 `times`（昇順）それぞれでの生産量の常用対数。その時刻までの最後の記録（出来事の後の値）を使う。最初の記録より
 * 前の時刻は `-Infinity`。生産量が 0 の時期も `-Infinity` になる。速度や差を求める側は、両端が同じ値なら伸びを 0 とみなす。
 */
export function levelsAt(timeline: readonly Entry[], times: readonly number[]): number[] {
  return ratesAt(timeline, times).map((rate) => log10(rate));
}

/** 時刻 `times`（昇順）それぞれでの生産量。その時刻までの最後の記録（出来事の後の値）を使い、最初の記録より前は 0。 */
function ratesAt(timeline: readonly Entry[], times: readonly number[]): Num[] {
  const entries = timeline[Symbol.iterator]();
  let pending = entries.next();
  let rate = ZERO;
  return times.map((time) => {
    for (; pending.done !== true && pending.value.t <= time; pending = entries.next()) {
      rate = pending.value.rate;
    }
    return rate;
  });
}

/** 生産量の常用対数が `levels` のそれぞれに初めて達した時刻（秒）。達しなければ `undefined`。 */
export function milestoneTimes(
  timeline: readonly Entry[],
  levels: readonly number[],
): (number | undefined)[] {
  return levels.map((level) => timeline.find((entry) => log10(entry.rate) >= level)?.t);
}

/** 続けて達した節目どうしの時刻の比（後 / 前）。前の時刻が 0 の組と、達していない節目を含む組は除く。 */
export function milestoneRatios(times: readonly (number | undefined)[]): number[] {
  return consecutive(times).flatMap(([earlier, later]) =>
    earlier === undefined || later === undefined || earlier === 0 ? [] : [later / earlier],
  );
}

/** 区切り `bounds`（秒、昇順）の隣り合う区間ごとの対数成長速度（1 時間あたりに生産量が伸びた桁数）。 */
export function segmentSpeeds(timeline: readonly Entry[], bounds: readonly number[]): number[] {
  return consecutive(zip(bounds, levelsAt(timeline, bounds))).map(
    ([[start, from], [end, to]]) => rise(from, to) / ((end - start) / HOUR),
  );
}

/** 生産量が 0 か。 */
const none = (rate: Num): boolean => atLeast(ZERO, rate, 0);

/**
 * 時刻 `times`（秒、昇順）の隣り合う組ごとの、毎秒の生産量の比（後 / 前）。どちらも生産量 0 なら 1、前だけが 0 なら
 * `Infinity`。比が number で表せないほど大きければ `Infinity`。常用対数の差からは求めない（50 / 5 が
 * 9.999999999999998 になり、下限ちょうどの比を下回るとみなすため）。
 */
export function rateRatios(timeline: readonly Entry[], times: readonly number[]): number[] {
  return consecutive(ratesAt(timeline, times)).map(([from, to]) => {
    if (none(from)) {
      return none(to) ? 1 : Number.POSITIVE_INFINITY;
    }
    return toNumber(div(to, from));
  });
}

/** 隣り合う区間の速度の比（後 / 前）。前の速度が 0 以下の組は除く。 */
export function speedChanges(speeds: readonly number[]): number[] {
  return consecutive(speeds).flatMap(([earlier, later]) => (earlier > 0 ? [later / earlier] : []));
}

/**
 * 時刻 `times` の重なりを除いて昇順に並べたときの、隣り合う時刻の間隔。`end` を渡すと、最後の時刻から `end` までも
 * 間隔に含める。
 */
export function gaps(times: readonly number[], end?: number): number[] {
  const distinct = [...new Set(times)].toSorted((a, b) => a - b);
  return consecutive(end === undefined ? distinct : [...distinct, end]).map(
    ([earlier, later]) => later - earlier,
  );
}

/** 中央値。要素数が偶数なら中央の 2 つの平均。空なら `undefined`。 */
export function median(values: readonly number[]): number | undefined {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const centre =
    sorted.length % 2 === 1
      ? sorted.slice(middle, middle + 1)
      : sorted.slice(middle - 1, middle + 1);
  return centre.length === 0
    ? undefined
    : centre.reduce((sum, value) => sum + value, 0) / centre.length;
}

/** 壁を探す設定。 */
export interface WallSettings {
  /** 速度を測る区間の長さ（秒）。 */
  readonly window: number;
  /** この速度（1 時間あたりの桁数）を下回る区間を壁とみなす。 */
  readonly below: number;
  /** 区間の始まりをずらす間隔（秒）。 */
  readonly every: number;
  /** 遊んだ時間（秒）。区間の終わりがこれを超える始まりは使わない。 */
  readonly duration: number;
}

/**
 * 壁の最長の長さ（秒）。始まりを `every` ごとにずらした長さ `window` の区間のうち、速度が `below` を下回る区間が
 * 続いた範囲の長さ（最初の区間の始まりから最後の区間の終わりまで）の最大。壁が無ければ 0。
 */
export function longestWall(timeline: readonly Entry[], settings: WallSettings): number {
  const { window, below, every, duration } = settings;
  // 区間の終わりを duration と比べる（duration - window から数えると、引き算の丸めで最後の区間を落としうる）。
  const starts = grid(every, duration).filter(
    (start) => start + window <= duration * (1 + GRID_TOLERANCE),
  );
  const speeds = zip(
    levelsAt(timeline, starts),
    levelsAt(
      timeline,
      starts.map((start) => start + window),
    ),
  ).map(([from, to]) => rise(from, to) / (window / HOUR));
  let longest = 0;
  let first: number | undefined;
  for (const [start, speed] of zip(starts, speeds)) {
    // 測れない速度（NaN）も、伸びていると確かめられないため壁に数える。
    first = speed >= below ? undefined : (first ?? start);
    // 区間の終わりは、丸め誤差で duration を超えても duration で止める。
    longest =
      first === undefined ? longest : Math.max(longest, Math.min(start + window, duration) - first);
  }
  return longest;
}

/**
 * `best` が `other` より生産量で先行した最大の桁数。時刻 0 から `every` ごとに `duration` まで比べる。`other` が
 * 常に先行していれば負になる。
 */
export function largestLead(
  best: readonly Entry[],
  other: readonly Entry[],
  every: number,
  duration: number,
): number {
  const times = grid(every, duration);
  return largest(
    zip(levelsAt(best, times), levelsAt(other, times)).map(([leading, trailing]) =>
      rise(trailing, leading),
    ),
  );
}
