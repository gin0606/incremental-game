import { contentsNeeded } from "../contents.ts";
import { parseNameStatus, parseUnifiedDiff } from "../git-output.ts";
import type { FileChange, Finding } from "../rules.ts";
import { changeFindings, formatFinding, parsePathList } from "../rules.ts";
import { git } from "./git.ts";

// 取り込み前の検査（check.ts）のうち、検出の規則を読み込んで差分を判定する部分。check.ts が、規則に commit して
// いない変更が無く、規則が `<base>` の版と同じことを確かめてから読み込む。

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

/** `<base>` と `<head>` の分岐点から `<head>` までの差分を判定し、結果を書いて終了コードを返す。 */
export const report = (root: string, base: string, head: string): number => {
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
