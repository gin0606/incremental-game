import { join } from "node:path";

import type { Worktree } from "../worktrees.ts";
import { lockOwner, parseWorktreeList, sessionWorkers, unlockTargets } from "../worktrees.ts";
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
 * lock の持ち主が終わった監督セッションの worktree と、その worker の worktree の lock を外す。`reaped` は、ドライバが
 * 終わりを見届けたプロセスの識別子（再利用されて動いているように見えても外す）。`also` は持ち主によらず外すもの。
 */
export const releaseStaleLocks = (
  repository: string,
  entries: readonly Worktree[],
  reaped: readonly number[],
  also: readonly Worktree[] = [],
): void => {
  const targets = unlockTargets(
    entries,
    join(repository, ".claude/worktrees"),
    (pid) => !reaped.includes(pid) && isAlive(pid),
  );
  unlock(repository, [
    ...targets,
    ...also.filter((entry) => entry.lock !== undefined && !targets.includes(entry)),
  ]);
};

/** 実行中のセッションの worker の worktree。持ち主は、セッション用の worktree の lock が示すプロセス。 */
export const currentWorkers = (
  repository: string,
  paths: { readonly worktree: string; readonly worktreesDirectory: string },
): readonly Worktree[] => {
  const entries = worktrees(repository);
  const lock = entries.find((entry) => entry.path === paths.worktree)?.lock;
  const owner = lock === undefined ? undefined : lockOwner(lock);
  return owner === undefined ? [] : sessionWorkers(entries, paths.worktreesDirectory, [owner]);
};

/**
 * この回の worker の worktree を調べてから、残った lock を外す。worker の worktree は、lock の持ち主がこの回の
 * セッションのプロセス（起動したプロセスか、セッション用の worktree の lock が示すもの）であるものと、セッションの
 * 間に同じ方法で見つけていた（`seen`。worker が終わると lock が外れるため）もののうち、まだ在るもの。この回の
 * セッション用の worktree の lock は、lock の理由が読めなくても外す。
 */
export const releaseLocks = (
  repository: string,
  paths: { readonly worktree: string; readonly worktreesDirectory: string },
  pid: number | undefined,
  seen: readonly Worktree[],
): readonly Worktree[] => {
  const after = worktrees(repository);
  const session = after.filter((entry) => entry.path === paths.worktree);
  const sessionLock = session[0]?.lock;
  const owners = [pid, sessionLock === undefined ? undefined : lockOwner(sessionLock)].filter(
    (owner) => owner !== undefined,
  );
  const current = sessionWorkers(after, paths.worktreesDirectory, owners);
  const remembered = after.filter(
    (entry) => !current.includes(entry) && seen.some((worker) => worker.path === entry.path),
  );
  for (const entry of after) {
    if (
      entry.path.startsWith(`${paths.worktreesDirectory}/`) &&
      entry.lock !== undefined &&
      lockOwner(entry.lock) === undefined
    ) {
      log(`lock の理由からプロセスの識別子を読めない: ${entry.path}（${entry.lock}）`);
    }
  }
  // この回のセッション用の worktree と worker の worktree は、セッション用の lock の理由を読めなくても外す。
  releaseStaleLocks(repository, after, owners, [...session, ...current]);
  return [...current, ...remembered];
};
