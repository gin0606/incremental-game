import { contentsNeeded } from "../contents.ts";
import { parseNameStatus, parseUnifiedDiff } from "../git-output.ts";
import type { FileChange, Finding } from "../rules.ts";
import { changeFindings, formatFinding, parsePathList } from "../rules.ts";
import { git } from "./git.ts";

// 取り込み前に、作業ブランチの commit が AGENTS.md「保護範囲」節に当たる変更を含むかを検査する。
// `<base>` と `<head>` の分岐点から `<head>` までの差分を見る（`git diff <base>...<head>` と同じ範囲）。
// commit していない変更は見ない。判定の基盤の一覧（foundation-paths.txt）は `<base>` の版を読む。ブランチが一覧を
// 変えて自身の変更を検出から外せず（一覧の変更そのものも保護の仕組みとして検出する）、分岐の後に `<base>` で一覧に
// 足したパスも検出から漏れない。検出の規則は、実行した場所の作業ツリーにある版を使う。
// 終了コード: 0 は検出なし、1 は検出あり（標準出力に一覧）、2 は検査の失敗（標準エラーに理由）。

// `<head>` は省かせない。取り込み先の作業ツリーで HEAD を見ると、差分が空になり「検出なし」と読めてしまう。
const USAGE = "使い方: pnpm run check:protected <base> <head>\n";

// 利用者の git の設定（外部の diff、テキストへの変換、名前の変更の検出、サブディレクトリからの相対パス、色）と
// .gitattributes（バイナリ扱い）で差分の行が変わらないようにする。
const DIFF_OPTIONS = [
  "--no-renames",
  "--no-relative",
  "--no-ext-diff",
  "--no-textconv",
  "--no-color",
  "--text",
];

const findingsBetween = (
  root: string,
  {
    base,
    mergeBase,
    head,
  }: { readonly base: string; readonly mergeBase: string; readonly head: string },
): readonly Finding[] => {
  const inRoot = (args: readonly string[]): string => git(["-C", root, ...args]);
  const foundation = parsePathList(inRoot(["show", `${base}:foundation-paths.txt`]));
  const changes = parseNameStatus(
    inRoot(["diff", ...DIFF_OPTIONS, "--name-status", "-z", mergeBase, head, "--"]),
  );
  return changes.flatMap(({ status, path }) => {
    const lines = parseUnifiedDiff(
      inRoot(["diff", ...DIFF_OPTIONS, "-U0", mergeBase, head, "--", path]),
    );
    const change: FileChange = contentsNeeded(path)
      ? {
          path,
          ...lines,
          contents: {
            before: status === "A" ? undefined : inRoot(["show", `${mergeBase}:${path}`]),
            after: status === "D" ? undefined : inRoot(["show", `${head}:${path}`]),
          },
        }
      : { path, ...lines };
    return changeFindings(change, foundation);
  });
};

const main = (args: readonly string[]): number => {
  const [base, head, ...rest] = args;
  if (base === undefined || head === undefined || rest.length > 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const mergeBase = git(["-C", root, "merge-base", base, head]).trim();
  const findings = findingsBetween(root, { base, mergeBase, head });
  if (findings.length === 0) {
    process.stdout.write(`保護範囲に当たる変更は無い（${mergeBase}..${head}）。\n`);
    return 0;
  }
  process.stdout.write(
    `保護範囲に当たる変更がある（${mergeBase}..${head}）:\n${findings.map((finding) => `- ${formatFinding(finding)}\n`).join("")}`,
  );
  return 1;
};

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`保護範囲の検査に失敗した: ${String(error)}\n`);
  process.exitCode = 2;
}
