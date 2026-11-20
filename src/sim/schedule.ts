// シミュレーターの時刻の予定（同じ時刻とみなす幅、見積もりで進む時間の下限）と、遊ばせられる設定かの判定。

import type { Bot } from "./bot.ts";
import type { Settings } from "./simulate.ts";

/**
 * 買える時刻の見積もりで進む時間の下限（秒）。見積もりが丸め誤差ほどに短くなっても、時刻が進まずに止まらないように
 * する。刻み幅によらない値にし、刻み幅を変えても買う時刻が変わらないようにする。
 */
export const MIN_WAIT = 1e-6;

/**
 * 同じ時刻とみなす予定の相対誤差。予定の時刻は間隔の掛け算で求めるため、同じはずの予定（4.1 秒ごとの 3 回目と
 * 12.3 秒など）が丸め誤差でずれ、記録・チェックイン・終わりの順が入れ替わるのを防ぐ。掛け算 1 回と秒数の表現の
 * 丸め誤差（相対 2^-52 程度）だけを吸収し、本当に離れた予定はまとめない。
 */
const SCHEDULE_TOLERANCE = 8 * Number.EPSILON;

const notPositive = (name: string, value: number): string | undefined =>
  Number.isFinite(value) && value > 0 ? undefined : `${name} は正の有限の秒数で渡す: ${value}`;

/**
 * 時刻を進める間隔が、遊ぶ時間に比べて丸め誤差と区別できないほど短いときの理由。同じ時刻とみなす幅
 * （{@link SCHEDULE_TOLERANCE}）の 2 倍以下の間隔では、次の予定が今の時刻と同じか手前になり、時刻が進まない。
 */
const tooShort = (name: string, seconds: number, duration: number): string | undefined =>
  seconds > duration * (2 * SCHEDULE_TOLERANCE)
    ? undefined
    : `duration ${duration} 秒に対して ${name} ${seconds} 秒が短すぎ、丸め誤差と区別できない`;

/** `bot` と `settings` で遊ばせられない理由。遊ばせられれば `undefined`。 */
export function settingsProblem(bot: Bot, settings: Settings): string | undefined {
  const { duration, step, sampleEvery } = settings;
  // 上限は、時刻どうしの和（二分探索の中点、今の時刻と進める秒数の和）が number で溢れないようにするため。
  if (!(duration >= 0 && duration <= Number.MAX_VALUE / 2)) {
    return `duration は 0 以上 Number.MAX_VALUE / 2 以下の秒数で渡す: ${duration}`;
  }
  const { checkIn } = bot;
  const intervals: readonly (readonly [string, number])[] = [
    ["step", step],
    ["sampleEvery", sampleEvery],
    checkIn.kind === "every"
      ? ["checkIn.seconds", checkIn.seconds]
      : ["見積もりで進む時間の下限", MIN_WAIT],
  ];
  for (const [name, seconds] of intervals) {
    const problem = notPositive(name, seconds) ?? tooShort(name, seconds, duration);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

/**
 * 予定の時刻のうち最も早いものと、それと丸め誤差の範囲で並ぶもの（{@link SCHEDULE_TOLERANCE}）を一度に扱う時刻。
 * 並ぶもののうち遅いほうの時刻で、`duration` を超えない。
 */
export function gathered(times: readonly number[], duration: number): number {
  const earliest = Math.min(...times);
  const together = times.filter((time) => time - earliest <= earliest * SCHEDULE_TOLERANCE);
  return Math.min(duration, Math.max(...together));
}
