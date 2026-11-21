import { join } from "node:path";

import type { Worktree } from "../worktrees.ts";
import {
  afterSession,
  lockOwner,
  parseWorktreeList,
  roundWorkers,
  unlockTargets,
} from "../worktrees.ts";
import { git, gitOrThrow, isAlive, log } from "./run.ts";

// 監督セッションが終わった後に残る worktree の lock を外す。Claude Code は `--worktree` の worktree と worker の
// worktree を lock したまま終わることがあり、lock された worktree は次の回の監督役が消せない。

export const worktrees = (repository: string): readonly Worktree[] =>
  parseWorktreeList(gitOrThrow(repository, ["worktree", "list", "--porcelain", "-z"]));

/** lock を外す。外せないもの（すでに外れているものを含む）はログに残して続ける。 */
const unlock = (repository: string, targets: readonly Worktree[]): void => {
  for (const target of targets) {
    const result = git(repository, ["worktree", "unlock", target.path]);
    log(
      `git worktree unlock ${target.path}: ${result.status === 0 ? "外した" : result.stderr.trim()}`,
    );
  }
};

/**
 * lock の持ち主が終わった監督セッションの worktree と、その worker の worktree の lock を外す（前のドライバのプロセスが
 * 中断した回のもの）。
 */
export const releaseStaleLocks = (repository: string): void => {
  unlock(
    repository,
    unlockTargets(worktrees(repository), join(repository, ".claude/worktrees"), isAlive),
  );
};

/**
 * 実行中のセッションの worker の worktree。持ち主は、セッション用の worktree の lock が示すプロセス。`before` は
 * セッションを起動する前から在った worktree のパス。
 */
export const currentWorkers = (
  repository: string,
  paths: { readonly worktree: string; readonly worktreesDirectory: string },
  before: readonly string[],
): readonly Worktree[] => {
  const entries = worktrees(repository);
  const lock = entries.find((entry) => entry.path === paths.worktree)?.lock;
  const owner = lock === undefined ? undefined : lockOwner(lock);
  return owner === undefined
    ? []
    : roundWorkers(entries, paths.worktreesDirectory, [owner], before);
};

/**
 * この回の worker の worktree を調べてから、残った lock を外す（選び方は `afterSession`）。`before` はセッションを
 * 起動する前から在った worktree のパス、`seen` はセッションの間に見つけていた worker の worktree。
 */
export const releaseLocks = (
  repository: string,
  paths: { readonly worktree: string; readonly worktreesDirectory: string },
  run: {
    readonly pid: number | undefined;
    readonly before: readonly string[];
    readonly seen: readonly Worktree[];
  },
): readonly Worktree[] => {
  const after = worktrees(repository);
  for (const entry of after) {
    if (
      entry.path.startsWith(`${paths.worktreesDirectory}/`) &&
      entry.lock !== undefined &&
      lockOwner(entry.lock) === undefined
    ) {
      log(`lock の理由からプロセスの識別子を読めない: ${entry.path}（${entry.lock}）`);
    }
  }
  const { unlock: targets, workers } = afterSession({
    worktrees: after,
    directory: paths.worktreesDirectory,
    session: paths.worktree,
    pid: run.pid,
    before: run.before,
    seen: run.seen.map((worker) => worker.path),
    isAlive,
  });
  unlock(repository, targets);
  return workers;
};
