import type { Contents } from "./contents.ts";
import { contentChanges, contentsNeeded, PACKAGE_JSON } from "./contents.ts";

// AGENTS.md「保護範囲」節に当たる変更を見分ける規則。取り込み前の検査（cli/check.ts）と、監督セッションで
// サブエージェントの Edit・Write を拒否する hook（cli/hook.ts）が使う。

/** 検出した変更の種類。AGENTS.md「保護範囲」節の対象を、検出の単位に分けたもの。 */
export type Category =
  | "判定の基盤"
  | "検査の設定"
  | "抑制の印"
  | "ミューテーションテストの設定と除外"
  | "保護の仕組み"
  | "AGENTS.md の保護対象の節"
  | "リポジトリの外に出る操作";

export interface Finding {
  readonly category: Category;
  /** リポジトリ（worktree）のルートからの相対パス。 */
  readonly path: string;
  readonly detail: string;
}

export type PathMatcher = (path: string) => boolean;

/** 判定の基盤のパスの一覧（foundation-paths.txt）。書式はそのファイルの先頭にある。 */
export interface PathList {
  readonly includes: readonly PathMatcher[];
  readonly excludes: readonly PathMatcher[];
}

const ESCAPED = new Set("^$.+()]{}|/");

/**
 * POSIX sh の `case` のパターンのうち `*`（`/` を含む任意の文字列）と `?`（任意の 1 文字）だけを特殊文字として扱い、
 * 大文字と小文字を区別せずに照合する。macOS の既定のファイルシステムは大文字と小文字を区別せず、綴りの違う
 * パスへの書き込みも同じファイルに届くため。`[` と `\` を含むパターンは、読み違えて検出から漏らさないよう拒む。
 */
export const casePattern = (pattern: string): PathMatcher => {
  if (pattern.includes("[") || pattern.includes("\\")) {
    throw new Error(`パターンに [ と \\ は使えない: ${pattern}`);
  }
  let source = "";
  for (const char of pattern) {
    if (char === "*") {
      source += ".*";
    } else if (char === "?") {
      source += ".";
    } else {
      source += ESCAPED.has(char) ? `\\${char}` : char;
    }
  }
  const regex = new RegExp(`^${source}$`, "isv");
  return (path) => regex.test(path);
};

export const parsePathList = (text: string): PathList => {
  const includes: PathMatcher[] = [];
  const excludes: PathMatcher[] = [];
  for (const line of text.split("\n").map((raw) => raw.trim())) {
    if (line.startsWith("!")) {
      excludes.push(casePattern(line.slice(1)));
    } else if (line !== "" && !line.startsWith("#")) {
      includes.push(casePattern(line));
    }
  }
  if (includes.length === 0) {
    throw new Error("パスの一覧に、除外でないパターンが一つも無い。");
  }
  return { includes, excludes };
};

export const inPathList = (list: PathList, path: string): boolean =>
  list.includes.some((matches) => matches(path)) && !list.excludes.some((matches) => matches(path));

interface PathRule {
  readonly category: Category;
  readonly matches: PathMatcher;
  readonly detail: string;
}

const rule = (category: Category, matches: PathMatcher, detail: string): PathRule => ({
  category,
  matches,
  detail,
});

// 判定の基盤（foundation-paths.txt が列挙する）のほかに、パスで見分ける保護範囲。大文字と小文字を区別しない。
// - 検査の設定: tsrs・oxlint・oxfmt・lefthook が読む設定と除外の一覧。.gitignore は oxlint と oxfmt が対象から
//   外すファイルの一覧として読む。lefthook は yml・yaml・toml・json・jsonc の拡張子の lefthook と lefthook-local
//   （先頭にドットを付けた名前と、.config/ の下を含む）を設定として読み、.lefthook/・.lefthook-local/ の下の
//   スクリプトを動かす。lefthook.yml の rc・extends・remotes・source_dir・source_dir_local は、ほかのパス（remotes
//   はリポジトリの外）のファイルを読ませる・動かさせる。これらのキーを足す変更は lefthook.yml の変更として検出する
//   が、指した先のファイルのその後の編集は検出しない（今はどのキーも使っていない）。
// - 検査の設定（pnpm）: pnpm-workspace.yaml（overrides・patchedDependencies・pnpmfile などの設定）、.npmrc、
//   pnpmfile（.pnpmfile.mjs・.pnpmfile.cjs。readPackage で依存の package.json を書き換えられる）、patches/
//   （pnpm patch の既定の置き場）。どれも oxlint・tsrs などの検査の道具を、版を変えずに何もしないものへ差し替え
//   られる。patches/ の外に置くパッチは、それを使わせる patchedDependencies の変更として検出するが、その後の
//   パッチの編集は検出しない（今は patchedDependencies を使っていない）。pnpm の pnpmfile の設定で既定の名前以外の
//   pnpmfile を指す場合も、その設定の変更（pnpm-workspace.yaml・.npmrc・package.json の pnpm）として検出するが、
//   その後の pnpmfile の編集は検出しない（今は pnpmfile を設定していない）。
//   pnpm-lock.yaml は含めない。lockfile の解決先を書き換えても検査の道具を差し替えられるが、ゲームの依存を足す
//   たびに書き換わるファイルで、パスで検出するとそのたびに独立判断が要る。検査の道具の項目だけを比べる方法は
//   作っていない。
// - 保護の仕組み: hook と検出のスクリプト（scripts/ の下に置く。検査のスクリプトと無人運転のドライバも scripts/ に
//   置く）、判定の基盤の一覧、Claude Code の設定・サブエージェントの定義・skill、指示のファイル（どのディレクトリの
//   CLAUDE.md・CLAUDE.local.md・AGENTS.override.md と、ルート以外の AGENTS.md。AGENTS.override.md は、レビューに使う
//   Codex が同じディレクトリの AGENTS.md の代わりに読む）。ルート以外の指示に「ここでは独立判断は要らない」と
//   書けば、ルートの AGENTS.md の保護対象の節を書き換えずに保護範囲を外せるため。ルートの AGENTS.md は保護対象の
//   節だけを内容で比べる（contents.ts）。Claude Code が作る worktree の置き場（.claude/worktrees/）は Git 管理外で、
//   そこにある worktree のファイルはその worktree のルートからのパスで照合する。
// - リポジトリの外に出る操作: GitHub の workflow など .github/ の下の設定。公開・デプロイを足せる。
const PATH_RULES: readonly PathRule[] = [
  rule("検査の設定", (path) => /(?:^|\/)tsconfig[^\/]*\.json$/iv.test(path), "TypeScript の設定"),
  rule(
    "検査の設定",
    (path) => /(?:^|\/)(?:\.oxlintrc[^\/]*|oxlint\.config\.[^\/]*|\.eslintignore)$/iv.test(path),
    "oxlint の設定",
  ),
  rule(
    "検査の設定",
    (path) => /(?:^|\/)(?:\.oxfmtrc[^\/]*|oxfmt\.config\.[^\/]*|\.prettierignore)$/iv.test(path),
    "oxfmt の設定",
  ),
  rule(
    "検査の設定",
    (path) => /(?:^|\/)\.gitignore$/iv.test(path),
    "oxlint と oxfmt が読む除外の一覧",
  ),
  rule(
    "検査の設定",
    (path) =>
      /(?:^|\/)(?:\.?lefthook(?:-local)?\.(?:ya?ml|toml|jsonc?)$|\.lefthook(?:-local)?\/)/iv.test(
        path,
      ),
    "lefthook の設定",
  ),
  rule(
    "検査の設定",
    (path) =>
      /(?:^|\/)(?:pnpm-workspace\.yaml|\.npmrc|\.pnpmfile\.[^\/]*)$|^patches\//iv.test(path),
    "pnpm の設定と依存のパッチ",
  ),
  rule(
    "ミューテーションテストの設定と除外",
    (path) =>
      /(?:^|\/)(?:mutator\.config\.[^\/]*|mutator\.accepted\.json|vitest\.mutation\.config\.[^\/]*)$/iv.test(
        path,
      ),
    "ミューテーションテストの設定と受け入れた変異",
  ),
  rule(
    "保護の仕組み",
    (path) => /^scripts\//iv.test(path),
    "検査・保護範囲の検出・無人運転のスクリプト",
  ),
  rule("保護の仕組み", (path) => /^foundation-paths\.txt$/iv.test(path), "判定の基盤のパスの一覧"),
  rule(
    "保護の仕組み",
    (path) => /^\.claude\/(?!worktrees\/)/iv.test(path),
    "Claude Code の設定・サブエージェント・skill",
  ),
  rule(
    "保護の仕組み",
    (path) => /(?:^|\/)(?:CLAUDE(?:\.local)?|AGENTS\.override)\.md$|\/AGENTS\.md$/iv.test(path),
    "エージェントへの指示",
  ),
  rule(
    "リポジトリの外に出る操作",
    (path) => /^\.github\//iv.test(path),
    "GitHub の workflow などの設定",
  ),
];

/** パスだけで見分ける保護範囲。hook はこれで拒否し、取り込み前の検査は変更・追加・削除したパスに当てる。 */
export const pathFindings = (path: string, foundation: PathList): readonly Finding[] => [
  ...(inPathList(foundation, path)
    ? [{ category: "判定の基盤" as const, path, detail: "foundation-paths.txt の一覧" }]
    : []),
  ...PATH_RULES.filter((pathRule) => pathRule.matches(path)).map((pathRule) => ({
    category: pathRule.category,
    path,
    detail: pathRule.detail,
  })),
];

/**
 * 絶対パスが git の内部（.git の下。hook を含む）を指すか。lefthook が入れる hook を書き換えると commit の検査が
 * 外れる。git の作業ツリーの外になるため、worktree のルートからのパスではなく絶対パスで見る。
 */
export const inGitDirectory = (absolutePath: string): boolean =>
  /(?:^|\/)\.git(?:\/|$)/iv.test(absolutePath);

// 追加された行にあれば、検査を抑制する印。TypeScript の印は抑制するものだけを挙げ、`@ts-check`（JavaScript の
// ファイルを型検査させる。このリポジトリに JavaScript のファイルは無く、tsconfig も読ませない）と、`@ts-rest/...`
// のような `@ts-` で始まるパッケージ名は含めない。検査を強める印（`@ts-check`、範囲の終わり、mutator-critical）
// を足す変更は止めない。保護範囲は検査を弱める変更を対象にするため。
const SUPPRESSION_MARKERS = [
  "oxlint-disable",
  "eslint-disable",
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck",
  "mutator-disable",
  "stryker disable",
];
// 消された行にあれば、抑制する範囲を広げる印（範囲の終わり）。
const SUPPRESSION_END_MARKERS = [
  "oxlint-enable",
  "eslint-enable",
  "mutator-enable",
  "stryker restore",
];
// 消された行にあれば、関数の変異をすべて検出させる指定を外す印。
const CRITICAL_MARKER = "mutator-critical";

// 大文字と小文字を区別しない。
const containsAny = (line: string, markers: readonly string[]): boolean =>
  markers.some((marker) => line.toLowerCase().includes(marker));

/** 1 つのファイルの変更。`added`・`removed` は差分の追加・削除された行（先頭の `+`・`-` を除く）。 */
export interface FileChange {
  readonly path: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** contentsNeeded が真のパスだけ、変更前後の内容。ファイルが無い側は undefined。 */
  readonly contents?: Contents;
}

const contentFindings = (change: FileChange): readonly Finding[] => {
  if (!contentsNeeded(change.path)) {
    return [];
  }
  if (change.contents === undefined) {
    throw new Error(`${change.path} は変更前後の内容を渡す。`);
  }
  return contentChanges(change.path, change.contents).map(({ path, part }) => ({
    category: path === PACKAGE_JSON ? "検査の設定" : "AGENTS.md の保護対象の節",
    path,
    detail: part,
  }));
};

const lineFindings = (
  change: FileChange,
  category: Category,
  lines: readonly string[],
  matches: (line: string) => boolean,
  label: string,
): readonly Finding[] =>
  lines
    .filter((line) => matches(line))
    .map((line) => ({ category, path: change.path, detail: `${label}: ${line.trim()}` }));

/** 取り込み前の検査で、1 つのファイルの変更から保護範囲に当たるものを挙げる。 */
export const changeFindings = (change: FileChange, foundation: PathList): readonly Finding[] => [
  ...pathFindings(change.path, foundation),
  ...lineFindings(
    change,
    "抑制の印",
    change.added,
    (line) => containsAny(line, SUPPRESSION_MARKERS),
    "追加した行",
  ),
  ...lineFindings(
    change,
    "抑制の印",
    change.removed,
    (line) => containsAny(line, SUPPRESSION_END_MARKERS),
    "抑制の範囲の終わりを消した行",
  ),
  ...lineFindings(
    change,
    "ミューテーションテストの設定と除外",
    change.removed,
    (line) => containsAny(line, [CRITICAL_MARKER]),
    "mutator-critical を消した行",
  ),
  ...contentFindings(change),
];

export const formatFinding = (finding: Finding): string =>
  `${finding.category}: ${finding.path}（${finding.detail}）`;
