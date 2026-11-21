// 監督セッションの出力と結果ファイルに共通する、JSON の読み方。

export type Json = Readonly<Record<string, unknown>>;

export const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** parseJson が JSON として読めなかったことを表す値。JSON の値と区別できるよう symbol にする。 */
export const NOT_JSON: unique symbol = Symbol("JSON として読めない");

export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
};
