// 測り方（src/sim/pace-settings.json）と目標値のファイル（docs/design/*.targets.json）の項目を読み、形と値を検査する
// 読み取りの部品。

/** 測り方か目標値のファイルの誤り。どの項目が、なぜ受け付けられないかを書く。 */
export class TargetsError extends Error {
  override readonly name = "TargetsError";
}

export type Reader<T> = (value: unknown, path: string) => T;

export const fail = (path: string, reason: string): never => {
  throw new TargetsError(`${path}: ${reason}`);
};

export const record = (
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

export const finite: Reader<number> = (value, path) =>
  typeof value === "number" && Number.isFinite(value) ? value : fail(path, "有限の数で書く");

export const positive: Reader<number> = (value, path) =>
  finite(value, path) > 0 ? finite(value, path) : fail(path, "正の数で書く");

export const list =
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
export const series: Reader<readonly number[]> = (value, path) => {
  const numbers = ascending(value, path);
  return numbers.length >= 2 ? numbers : fail(path, "2 つ以上の値を書く");
};

export type Fields = <T>(key: string, read: Reader<T>) => T;

export const reader =
  (fields: Readonly<Record<string, unknown>>, path: string): Fields =>
  (key, read) =>
    read(fields[key], `${path}.${key}`);

/** 節の項目を名前で読む。知らない項目があれば失敗する。 */
export const fieldsOf = (value: unknown, path: string, keys: readonly string[]): Fields =>
  reader(record(value, path, keys), path);
