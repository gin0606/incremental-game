import type { GameState } from "../core/game.ts";
import type { Num, NumParts } from "../core/num.ts";
import { atLeast, fromParts, toParts } from "../core/num.ts";

/**
 * 保存形式の版。形式を変えるときは版を上げ、古い版を読み込んで今の状態へ変換する処理を足す。
 *
 * - 1: 採集機・工場・自動購入。
 * - 2: 1 に造幣所の数（`mints`）を足した。1 の保存は造幣所 0 として読む。
 * - 3: 2 に改良の数（`upgrades`）を足した。1 と 2 の保存は改良 0 として読む。
 * - 4: 3 に控えめな自動購入を持つか（`cautiousAutoBuyer`）を足した。1〜3 の保存は持たないとして読む。
 * - 5: 4 に精錬所の数（`refineries`）を足した。1〜4 の保存は精錬所 0 として読む。
 * - 6: 5 に交易所の数（`exchanges`）を足した。1〜5 の保存は交易所 0 として読む。
 * - 7: 6 に採集機の改修の数（`collectorUpgrades`）を足した。1〜6 の保存は採集機の改修 0 として読む。
 * - 8: 7 に工場の連携の数（`factoryLinks`）を足した。1〜7 の保存は工場の連携 0 として読む。
 * - 9: 8 に工具の支給の数（`toolSupplies`）を足した。1〜8 の保存は工具の支給 0 として読む。
 */
export const SAVE_VERSION = 9;

/** 保存する内容。オフラインの経過時間を求めるため、保存した時刻（Unix 時刻のミリ秒）を持つ。 */
export interface SaveData {
  readonly state: GameState;
  readonly savedAt: number;
}

export type LoadResult =
  | { readonly ok: true; readonly data: SaveData }
  | { readonly ok: false; readonly error: string };

interface SavedStateV9 {
  readonly coins: NumParts;
  readonly totalEarned: NumParts;
  readonly collectors: number;
  readonly factories: number;
  readonly mints: number;
  readonly refineries: number;
  readonly exchanges: number;
  readonly upgrades: number;
  readonly collectorUpgrades: number;
  readonly factoryLinks: number;
  readonly toolSupplies: number;
  readonly autoBuyer: boolean;
  readonly cautiousAutoBuyer: boolean;
}

interface SaveFileV9 {
  readonly version: 9;
  readonly savedAt: number;
  readonly state: SavedStateV9;
}

type Version = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function serialize(data: SaveData): string {
  const { state, savedAt } = data;
  const file: SaveFileV9 = {
    version: SAVE_VERSION,
    savedAt,
    state: {
      coins: toParts(state.coins),
      totalEarned: toParts(state.totalEarned),
      collectors: state.collectors,
      factories: state.factories,
      mints: state.mints,
      refineries: state.refineries,
      exchanges: state.exchanges,
      upgrades: state.upgrades,
      collectorUpgrades: state.collectorUpgrades,
      factoryLinks: state.factoryLinks,
      toolSupplies: state.toolSupplies,
      autoBuyer: state.autoBuyer,
      cautiousAutoBuyer: state.cautiousAutoBuyer,
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

/** 版 `since` で足した数の項目 `key` を読む。それより前の版の保存は 0 として読む。 */
const readAddedCount = (
  value: Readonly<Record<string, unknown>>,
  version: Version,
  key:
    | "collectorUpgrades"
    | "exchanges"
    | "factoryLinks"
    | "mints"
    | "refineries"
    | "toolSupplies"
    | "upgrades",
  since: Version,
): number | string => {
  if (version < since) {
    return 0;
  }
  const count = value[key];
  return isCount(count) ? count : `${key} が 0 以上の整数でない`;
};

/** 版 1 より後に足した数の項目。それぞれの版より前の保存は 0 として読む。 */
const readAddedCounts = (
  value: Readonly<Record<string, unknown>>,
  version: Version,
):
  | Pick<
      GameState,
      | "mints"
      | "refineries"
      | "exchanges"
      | "upgrades"
      | "collectorUpgrades"
      | "factoryLinks"
      | "toolSupplies"
    >
  | string => {
  const mints = readAddedCount(value, version, "mints", 2);
  if (typeof mints === "string") {
    return mints;
  }
  const refineries = readAddedCount(value, version, "refineries", 5);
  if (typeof refineries === "string") {
    return refineries;
  }
  const exchanges = readAddedCount(value, version, "exchanges", 6);
  if (typeof exchanges === "string") {
    return exchanges;
  }
  const upgrades = readAddedCount(value, version, "upgrades", 3);
  if (typeof upgrades === "string") {
    return upgrades;
  }
  const collectorUpgrades = readAddedCount(value, version, "collectorUpgrades", 7);
  if (typeof collectorUpgrades === "string") {
    return collectorUpgrades;
  }
  const factoryLinks = readAddedCount(value, version, "factoryLinks", 8);
  if (typeof factoryLinks === "string") {
    return factoryLinks;
  }
  const toolSupplies = readAddedCount(value, version, "toolSupplies", 9);
  if (typeof toolSupplies === "string") {
    return toolSupplies;
  }
  return { mints, refineries, exchanges, upgrades, collectorUpgrades, factoryLinks, toolSupplies };
};

const readState = (value: unknown, version: Version): GameState | string => {
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
  const added = readAddedCounts(value, version);
  if (typeof added === "string") {
    return added;
  }
  if (typeof autoBuyer !== "boolean") {
    return "autoBuyer が真偽値でない";
  }
  const cautiousAutoBuyer = version < 4 ? false : value["cautiousAutoBuyer"];
  if (typeof cautiousAutoBuyer !== "boolean") {
    return "cautiousAutoBuyer が真偽値でない";
  }
  return {
    coins,
    totalEarned,
    collectors,
    factories,
    ...added,
    autoBuyer,
    cautiousAutoBuyer,
  };
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
  if (
    version !== 1 &&
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== 6 &&
    version !== 7 &&
    version !== 8 &&
    version !== SAVE_VERSION
  ) {
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
