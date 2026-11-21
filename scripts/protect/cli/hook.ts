import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { denial, parseHookInput, restricted } from "../hook-input.ts";
import type { HookInput } from "../hook-input.ts";
import { formatFinding, inGitDirectory, parsePathList, pathFindings } from "../rules.ts";
import { runGit } from "./git.ts";

// 監督セッションで、メインエージェントと protected-worker 以外のサブエージェントによる保護範囲のパスへの
// Edit・Write を拒否する PreToolUse hook。.claude/settings.json が、監督セッションの環境変数
// INCREMENTAL_GAME_SUPERVISOR があるときだけ呼ぶ。
// - パスは、編集先のファイルが属する worktree のルートからの相対パスで照合する。判定の基盤の一覧は監督セッションの
//   worktree（CLAUDE_PROJECT_DIR）の版を読み、サブエージェントが自分の worktree で一覧を変えても効かないようにする。
// - 拒否は標準出力の JSON で返す。失敗は終了コード 2（Claude Code は 2 のときだけ呼び出しを止める）で返し、
//   読めない入力で書き込みを通さない。

// 編集先のパスを、存在する祖先まで遡って実際のパス（symlink を解いたもの）にする。新規のファイルとディレクトリは
// まだ無いため、存在する祖先の実際のパスに残りをつなぐ。
const realTarget = (input: HookInput): string => {
  const target = isAbsolute(input.filePath)
    ? input.filePath
    : resolve(input.cwd ?? process.cwd(), input.filePath);
  const rest: string[] = [];
  let existing = target;
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync.native(existing), ...rest);
};

// 実際のパスが属する worktree のルートからの相対パス。git の作業ツリーの外なら undefined。
const worktreePath = (target: string): string | undefined => {
  let directory = dirname(target);
  while (!existsSync(directory)) {
    directory = dirname(directory);
  }
  const result = runGit(["-C", directory, "rev-parse", "--show-toplevel"]);
  if (result.status !== 0) {
    if (result.stderr.includes("not a git repository")) {
      return undefined;
    }
    throw new Error(`git rev-parse --show-toplevel が失敗した: ${result.stderr.trim()}`);
  }
  return relative(result.stdout.trim(), target);
};

const reasons = (target: string): readonly string[] => {
  if (inGitDirectory(target)) {
    return [`保護の仕組み: ${target}（git の内部。hook を含む）`];
  }
  const path = worktreePath(target);
  if (path === undefined) {
    return [];
  }
  const projectDir = process.env["CLAUDE_PROJECT_DIR"];
  if (projectDir === undefined || projectDir === "") {
    throw new Error("CLAUDE_PROJECT_DIR が無く、判定の基盤の一覧を読めない。");
  }
  const foundation = parsePathList(readFileSync(join(projectDir, "foundation-paths.txt"), "utf8"));
  return pathFindings(path, foundation).map((finding) => formatFinding(finding));
};

const main = (): void => {
  const input = parseHookInput(JSON.parse(readFileSync(0, "utf8")));
  if (!restricted(input.agentType)) {
    return;
  }
  const found = reasons(realTarget(input));
  if (found.length > 0) {
    process.stdout.write(`${denial(found)}\n`);
  }
};

try {
  main();
} catch (error) {
  process.stderr.write(`保護範囲の hook が失敗したため、書き込みを止めた: ${String(error)}\n`);
  process.exitCode = 2;
}
