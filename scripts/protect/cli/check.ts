import { spawnSync } from "node:child_process";

// 取り込み前に、作業ブランチの commit が AGENTS.md「保護範囲」節に当たる変更を含むかを検査する。
// `<base>` と `<head>` の分岐点から `<head>` までの差分を見る（`git diff <base>...<head>` と同じ範囲）。
// commit していない変更は見ない。判定の基盤の一覧（foundation-paths.txt）は `<base>` の版を読む。ブランチが一覧を
// 変えて自身の変更を検出から外せず（一覧の変更そのものも保護の仕組みとして検出する）、分岐の後に `<base>` で一覧に
// 足したパスも検出から漏れない。検出の規則は、実行した場所の作業ツリーにある版を使う。
// 終了コード: 0 は検出なし、1 は検出あり（標準出力に一覧）、2 は検査の失敗（標準エラーに理由）。

// 実行した作業ツリーで、検出の規則（scripts/protect/）と判定の基盤の一覧に commit していない変更（stage した変更と
// 未追跡のファイルを含む）があれば、検査せずに終了コード 2 で止める。規則は作業ツリーのファイルを動かすため、
// commit されていない規則で「検出なし」と判定させられる。一覧はこの検査では `<base>` の版を読むため判定に効かないが、
// 規則と同じく、検出の仕組みを commit した版で動かす前提にそろえる。
// 規則のモジュールは、確かめた後で読み込む。先に読み込むと、壊れた規則は読み込みの失敗（Node.js の終了コード 1 で、
// 検出ありと区別できない）になり、読み込みで動くコードが確かめる前に動く。そのため、この入口は scripts/protect の
// ほかのファイルを import しない。この入口自体と、検査を起動する package.json・pnpm の設定の変更は防げない（入口が
// 読み込めなければ、Node.js の終了コード 1 になる）。
const DETECTION_PATHS = ["scripts/protect", "foundation-paths.txt"];

// `<head>` は省かせない。取り込み先の作業ツリーで HEAD を見ると、差分が空になり「検出なし」と読めてしまう。
const USAGE = "使い方: pnpm run check:protected <base> <head>\n";

// cli/git.ts の git と同じく、英語の出力に固定し、パスを pathspec の特殊な書き方として読ませない。
const git = (args: readonly string[]): string => {
  const result = spawnSync("git", ["--literal-pathspecs", ...args], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} が失敗した: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

const main = async (args: readonly string[]): Promise<number> => {
  const [base, head, ...rest] = args;
  if (base === undefined || head === undefined || rest.length > 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const uncommitted = git([
    "-C",
    root,
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
    "--",
    ...DETECTION_PATHS,
  ])
    .split("\0")
    .filter((entry) => entry !== "");
  if (uncommitted.length > 0) {
    process.stderr.write(
      `検出の規則か判定の基盤の一覧に commit していない変更があるため、検査しない:\n${uncommitted.map((entry) => `- ${entry}\n`).join("")}`,
    );
    return 2;
  }
  const { report } = await import("./check-diff.ts");
  return report(root, base, head);
};

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`保護範囲の検査に失敗した: ${String(error)}\n`);
  process.exitCode = 2;
}
