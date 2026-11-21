// ファイルの一部だけが保護範囲に当たるもの（package.json の項目と AGENTS.md の節）を、変更前後の内容で比べる。

/** 変更前後の内容。ファイルが無い側は undefined。 */
export interface Contents {
  readonly before: string | undefined;
  readonly after: string | undefined;
}

/** 内容を比べた結果の、変わった保護範囲の部分。 */
export interface ContentChange {
  readonly path: string;
  readonly part: string;
}

export const PACKAGE_JSON = "package.json";
export const AGENTS_MD = "AGENTS.md";

const fields = (value: object): ReadonlyMap<string, unknown> => new Map(Object.entries(value));

/** 読んだ値。読めなければ ok が偽。 */
type Read = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

const parseJson = (text: string): Read => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

// JSON の値が等しいか。オブジェクトはキーの順序によらず比べる。
const sameJson = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item: unknown, index) => sameJson(item, b[index]))
    );
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const x = fields(a);
    const y = fields(b);
    return x.size === y.size && [...x.keys()].every((key) => sameJson(x.get(key), y.get(key)));
  }
  return a === b;
};

// 項目の値（無ければ undefined）。ファイルが無ければ項目も無いものとし、読めないか、オブジェクトでなければ ok を偽にする。
const packageField = (text: string | undefined, field: string): Read => {
  if (text === undefined) {
    return { ok: true, value: undefined };
  }
  const parsed = parseJson(text);
  return parsed.ok &&
    typeof parsed.value === "object" &&
    parsed.value !== null &&
    !Array.isArray(parsed.value)
    ? { ok: true, value: fields(parsed.value).get(field) }
    : { ok: false };
};

// package.json のうち、検査とミューテーションテストを動かすコマンド（scripts）と、検査のツール（devDependencies）と、
// 依存を別のものに差し替える指定を書く項目（pnpm の overrides・patchedDependencies などを書く pnpm、overrides、
// resolutions）。dependencies・optionalDependencies に devDependencies と同じ名前で別のものを書いても差し替えられ
// うるが、ゲームの依存も書く項目なので比べない。
const PACKAGE_FIELDS = ["scripts", "devDependencies", "pnpm", "overrides", "resolutions"];

const packageChanges = (before: string | undefined, after: string | undefined): ContentChange[] =>
  PACKAGE_FIELDS.filter((field) => {
    // 読めない版は、どの版とも等しくないものとして扱う（検出から漏らさない）。
    const old = packageField(before, field);
    const current = packageField(after, field);
    return !(old.ok && current.ok && sameJson(old.value, current.value));
  }).map((field) => ({ path: PACKAGE_JSON, part: `package.json の ${field}` }));

const PROTECTED_SECTIONS = ["ゲームの設計原則", "設計と根拠", "検証", "技術方針", "保護範囲"];

// `## 見出し` の節ごとに、見出しの行から次の `#`・`##` の見出しの前までの行を集め、同じ見出しの節をすべて順に並べる。
const sectionText = (text: string | undefined, name: string): string => {
  // ファイルが無ければ、節も無い。
  if (text === undefined) {
    return "[]";
  }
  const lines = text.split("\n");
  const starts = lines.flatMap((line, index) => (/^##? /v.test(line) ? [index] : []));
  const ends = [...starts.slice(1), lines.length];
  return JSON.stringify(
    starts.flatMap((start, index) =>
      lines[start] === `## ${name}` ? [lines.slice(start, ends[index])] : [],
    ),
  );
};

const agentsChanges = (before: string | undefined, after: string | undefined): ContentChange[] =>
  PROTECTED_SECTIONS.filter((name) => sectionText(before, name) !== sectionText(after, name)).map(
    (name) => ({ path: AGENTS_MD, part: `AGENTS.md の「${name}」節` }),
  );

/** 内容を比べて検出するファイル（リポジトリのルートの package.json と AGENTS.md）か。 */
export const contentsNeeded = (path: string): boolean =>
  path === PACKAGE_JSON || path === AGENTS_MD;

/** 変更前後の内容から、変わった保護範囲の部分を挙げる。 */
export const contentChanges = (
  path: string,
  { before, after }: Contents,
): readonly ContentChange[] => {
  if (path === PACKAGE_JSON) {
    return packageChanges(before, after);
  }
  return path === AGENTS_MD ? agentsChanges(before, after) : [];
};
