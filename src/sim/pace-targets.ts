// 設計記録の目標値のファイル（docs/design/*.targets.json）の形と、読み込んだ値の検査。
// 各項目の意味は docs/design/README.md にある。時間はすべて秒、生産量は常用対数で書く。
import type { PurchaseRule } from "./bot.ts";
import { purchaseRules } from "./bot.ts";
import { largest } from "./metrics.ts";

/** 値の範囲。どちらかを省くと、その側は制限しない。 */
export interface Band {
  readonly min?: number;
  readonly max?: number;
}

export interface Targets {
  /** 遊ばせる時間。 */
  readonly duration: number;
  /** シミュレーターの刻み幅。 */
  readonly step: number;
  /** 生産量を記録する間隔。対数成長速度・壁・選択の重みはこの間隔の時刻で測る。 */
  readonly sampleEvery: number;
  /** 妥当なボットとみなす購入規則。節目・成長・購入・新要素・壁と放置の指標は、この規則のボットで測る。 */
  readonly reasonable: readonly PurchaseRule[];
  readonly milestones: {
    /** 節目にする生産量の常用対数（昇順）。 */
    readonly levels: readonly number[];
    /** 続けて達した節目どうしの時刻の比。 */
    readonly ratio: Band;
  };
  readonly growth: {
    /** 対数成長速度を測る区間の区切り（昇順、0 から `duration` まで）。 */
    readonly bounds: readonly number[];
    /** 区間ごとの対数成長速度（1 時間あたりの桁数）。 */
    readonly speed: Band;
    /** 隣り合う区間の速度の比。 */
    readonly change: Band;
  };
  readonly purchases: {
    /** ボットの購入の時刻の間隔の中央値。 */
    readonly median: Band;
    /** ボットの購入の時刻の間隔の最長。 */
    readonly longest: Band;
  };
  readonly novelty: {
    /** 1 日あたりに解放される要素の数。 */
    readonly perDay: Band;
    /** 解放の時刻の間隔（最後の解放から終わりまでを含む）の最長。 */
    readonly longestGap: Band;
  };
  readonly walls: {
    /** 速度を測る区間の長さ。 */
    readonly window: number;
    /** この速度（1 時間あたりの桁数）を下回る区間を壁とみなす。 */
    readonly below: number;
    /** 壁の最長の長さ。 */
    readonly longest: Band;
  };
  readonly choice: {
    /** 最良とみなす購入規則。 */
    readonly best: PurchaseRule;
    /** 最良の規則と比べる、選び方を制限した購入規則。 */
    readonly restricted: readonly PurchaseRule[];
    /** 最良の規則のボットが生産量で先行した最大の桁数。 */
    readonly lead: Band;
  };
  readonly idle: {
    /** 局面の始まりの時刻（昇順）。常に開いているボットがその時刻まで遊んだ状態から測る。 */
    readonly phases: readonly number[];
    /** 局面ごとに遊ばせる長さ。 */
    readonly window: number;
    /** 効率（常に開いているボットに対する生産の割合）がこれ以上なら、損をしていないとみなす。 */
    readonly efficiency: number;
    /** この時刻以降の局面では、放置の許容間隔が `reach` 以上になる。 */
    readonly reachBy: number;
    readonly reach: number;
    /** 戻ったときの報酬曲線と不変条件で、局面の始まりから離れる時間（昇順）。 */
    readonly away: readonly number[];
  };
}

/** 目標値のファイルの誤り。どの項目が、なぜ受け付けられないかを書く。 */
export class TargetsError extends Error {
  override readonly name = "TargetsError";
}

type Reader<T> = (value: unknown, path: string) => T;

const fail = (path: string, reason: string): never => {
  throw new TargetsError(`${path}: ${reason}`);
};

const record = (
  value: unknown,
  path: string,
  keys: readonly string[],
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "オブジェクトで書く");
  }
  const entries: Readonly<Record<string, unknown>> = Object.fromEntries(Object.entries(value));
  const unknown = Object.keys(entries).find((key) => !keys.includes(key));
  return unknown === undefined ? entries : fail(`${path}.${unknown}`, "知らない項目");
};

const finite: Reader<number> = (value, path) =>
  typeof value === "number" && Number.isFinite(value) ? value : fail(path, "有限の数で書く");

const positive: Reader<number> = (value, path) =>
  finite(value, path) > 0 ? finite(value, path) : fail(path, "正の数で書く");

const list =
  <T>(item: Reader<T>): Reader<readonly T[]> =>
  (value, path) =>
    Array.isArray(value) && value.length > 0
      ? value.map((element: unknown, index) => item(element, `${path}[${index}]`))
      : fail(path, "空でない配列で書く");

const ascending: Reader<readonly number[]> = (value, path) => {
  const numbers = list(finite)(value, path);
  return numbers.every((number, index) => index === 0 || (numbers[index - 1] ?? number) < number)
    ? numbers
    : fail(path, "昇順（同じ値を含まない）で書く");
};

/**
 * 2 つ以上の昇順の数。1 つだと、隣り合う組を比べる指標（節目の比、区間の速度、局面の傾向、報酬曲線）が比べる組を持た
 * ず、検査が何もしないまま通る。
 */
const series: Reader<readonly number[]> = (value, path) => {
  const numbers = ascending(value, path);
  return numbers.length >= 2 ? numbers : fail(path, "2 つ以上の値を書く");
};

const rule: Reader<PurchaseRule> = (value, path) =>
  purchaseRules.find((candidate) => candidate === value) ??
  fail(path, `購入規則（${purchaseRules.join("・")}）で書く`);

const band: Reader<Band> = (value, path) => {
  const fields = record(value, path, ["min", "max"]);
  const min = fields["min"] === undefined ? undefined : finite(fields["min"], `${path}.min`);
  const max = fields["max"] === undefined ? undefined : finite(fields["max"], `${path}.max`);
  if (min === undefined && max === undefined) {
    return fail(path, "min か max の少なくとも一方を書く");
  }
  return min !== undefined && max !== undefined && min > max
    ? fail(path, "min を max 以下にする")
    : { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
};

/** 節の項目を名前で読む。知らない項目があれば失敗する。 */
const fieldsOf = (
  value: unknown,
  path: string,
  keys: readonly string[],
): (<T>(key: string, read: Reader<T>) => T) => {
  const fields = record(value, path, keys);
  return (key, read) => read(fields[key], `${path}.${key}`);
};

const milestones: Reader<Targets["milestones"]> = (value, path) => {
  const field = fieldsOf(value, path, ["levels", "ratio"]);
  return { levels: field("levels", series), ratio: field("ratio", band) };
};

const growth: Reader<Targets["growth"]> = (value, path) => {
  const field = fieldsOf(value, path, ["bounds", "speed", "change"]);
  return {
    bounds: field("bounds", series),
    speed: field("speed", band),
    change: field("change", band),
  };
};

const purchases: Reader<Targets["purchases"]> = (value, path) => {
  const field = fieldsOf(value, path, ["median", "longest"]);
  return { median: field("median", band), longest: field("longest", band) };
};

const novelty: Reader<Targets["novelty"]> = (value, path) => {
  const field = fieldsOf(value, path, ["perDay", "longestGap"]);
  return { perDay: field("perDay", band), longestGap: field("longestGap", band) };
};

const walls: Reader<Targets["walls"]> = (value, path) => {
  const field = fieldsOf(value, path, ["window", "below", "longest"]);
  return {
    window: field("window", positive),
    below: field("below", finite),
    longest: field("longest", band),
  };
};

const choice: Reader<Targets["choice"]> = (value, path) => {
  const field = fieldsOf(value, path, ["best", "restricted", "lead"]);
  return {
    best: field("best", rule),
    restricted: field("restricted", list(rule)),
    lead: field("lead", band),
  };
};

const idle: Reader<Targets["idle"]> = (value, path) => {
  const field = fieldsOf(value, path, [
    "phases",
    "window",
    "efficiency",
    "reachBy",
    "reach",
    "away",
  ]);
  const phases = field("phases", series);
  const reachBy = field("reachBy", finite);
  // 最後の局面より後の reachBy では、許容間隔の到達を確かめる局面が無く、検査が何もしないまま通る。
  return reachBy > largest(phases)
    ? fail(`${path}.reachBy`, "最後の局面（phases の最後）以下にする")
    : {
        phases,
        window: field("window", positive),
        efficiency: field("efficiency", finite),
        reachBy,
        reach: field("reach", positive),
        away: field("away", series),
      };
};

/**
 * 目標値のファイルの内容を検査して返す。
 *
 * @throws {TargetsError} 項目が欠けている、知らない項目がある、値の種類や範囲が違うとき。
 */
export function parseTargets(value: unknown): Targets {
  const field = fieldsOf(value, "targets", [
    "duration",
    "step",
    "sampleEvery",
    "reasonable",
    "milestones",
    "growth",
    "purchases",
    "novelty",
    "walls",
    "choice",
    "idle",
  ]);
  return {
    duration: field("duration", positive),
    step: field("step", positive),
    sampleEvery: field("sampleEvery", positive),
    reasonable: field("reasonable", list(rule)),
    milestones: field("milestones", milestones),
    growth: field("growth", growth),
    purchases: field("purchases", purchases),
    novelty: field("novelty", novelty),
    walls: field("walls", walls),
    choice: field("choice", choice),
    idle: field("idle", idle),
  };
}
