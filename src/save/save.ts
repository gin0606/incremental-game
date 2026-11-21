import type { GameState } from "../core/game.ts";
import type { Num, NumParts } from "../core/num.ts";
import { atLeast, fromParts, toParts } from "../core/num.ts";

/**
 * 保存形式の版。形式を変えるときは版を上げ、古い版を読み込んで今の状態へ変換する処理を足す。
 *
 * - 1: 採集機・工場・自動購入。
 * - 2: 1 に造幣所の数（`mints`）を足した。1 の保存は造幣所 0 として読む。
 */
export const SAVE_VERSION = 2;

/** 保存する内容。オフラインの経過時間を求めるため、保存した時刻（Unix 時刻のミリ秒）を持つ。 */
export interface SaveData {
  readonly state: GameState;
  readonly savedAt: number;
}

export type LoadResult =
  | { readonly ok: true; readonly data: SaveData }
  | { readonly ok: false; readonly error: string };

interface SavedStateV2 {
  readonly coins: NumParts;
  readonly totalEarned: NumParts;
  readonly collectors: number;
  readonly factories: number;
  readonly mints: number;
  readonly autoBuyer: boolean;
}

interface SaveFileV2 {
  readonly version: 2;
  readonly savedAt: number;
  readonly state: SavedStateV2;
}

export function serialize(data: SaveData): string {
  const { state, savedAt } = data;
  const file: SaveFileV2 = {
    version: SAVE_VERSION,
    savedAt,
    state: {
      coins: toParts(state.coins),
      totalEarned: toParts(state.totalEarned),
      collectors: state.collectors,
      factories: state.factories,
      mints: state.mints,
      autoBuyer: state.autoBuyer,
    },
  };
  return JSON.stringify(file);
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/** 0 以上の Num に変換する。不正なら `undefined`。 */
const readAmount = (value: unknown): Num | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const { sign, layer, mag } = value;
  if (typeof sign !== "number" || typeof layer !== "number" || typeof mag !== "number") {
    return undefined;
  }
  return sign >= 0 ? fromParts({ sign, layer, mag }) : undefined;
};

const readMints = (value: Readonly<Record<string, unknown>>, version: 1 | 2): number | string => {
  if (version === 1) {
    return 0;
  }
  const { mints } = value;
  return isCount(mints) ? mints : "mints が 0 以上の整数でない";
};

const readState = (value: unknown, version: 1 | 2): GameState | string => {
  if (!isRecord(value)) {
    return "state がオブジェクトでない";
  }
  const coins = readAmount(value["coins"]);
  if (coins === undefined) {
    return "coins が 0 以上の数でない";
  }
  const totalEarned = readAmount(value["totalEarned"]);
  if (totalEarned === undefined || !atLeast(totalEarned, coins)) {
    return "totalEarned が coins 以上の数でない";
  }
  const { collectors, factories, autoBuyer } = value;
  if (!isCount(collectors)) {
    return "collectors が 0 以上の整数でない";
  }
  if (!isCount(factories)) {
    return "factories が 0 以上の整数でない";
  }
  const mints = readMints(value, version);
  if (typeof mints === "string") {
    return mints;
  }
  if (typeof autoBuyer !== "boolean") {
    return "autoBuyer が真偽値でない";
  }
  return { coins, totalEarned, collectors, factories, mints, autoBuyer };
};

// 版の値はどんな JSON でもありうる。`String(value)` は `{"toString": null}` のようなオブジェクトで例外を投げるため、
// プリミティブ以外は型の名前だけを示す。
const describeVersion = (version: unknown): string => {
  if (typeof version === "number" || typeof version === "string" || typeof version === "boolean") {
    return JSON.stringify(version);
  }
  return version === null ? "null" : typeof version;
};

// Date が表せる時刻の範囲（ECMAScript の time value の上限、Unix 時刻のミリ秒）。
const MAX_TIMESTAMP = 8.64e15;

const unreadable = Symbol("unreadable");

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return unreadable;
  }
};

/**
 * 保存した文字列を読み込む。JSON として読めない、未知の版、値が不正などのときは理由を返す。
 */
export function deserialize(text: string): LoadResult {
  const parsed = parseJson(text);
  if (parsed === unreadable) {
    return { ok: false, error: "JSON として読めない" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "保存データがオブジェクトでない" };
  }
  const { version, savedAt } = parsed;
  if (version !== 1 && version !== SAVE_VERSION) {
    return { ok: false, error: `未知の版: ${describeVersion(version)}` };
  }
  // Date.now() が返しうる値に限る。それより先の時刻を受け入れると、時計が追いつくまで生産が止まる。
  if (
    typeof savedAt !== "number" ||
    !Number.isInteger(savedAt) ||
    Math.abs(savedAt) > MAX_TIMESTAMP
  ) {
    return { ok: false, error: "savedAt が Date の範囲の整数ミリ秒でない" };
  }
  const state = readState(parsed["state"], version);
  if (typeof state === "string") {
    return { ok: false, error: state };
  }
  return { ok: true, data: { state, savedAt } };
}
