import type { RoundResult } from "../result-file.ts";
import type { Verdict } from "../round.ts";
import { mergeProblem, outsideRecords } from "../round.ts";
import { git, gitOrThrow, log, run } from "./run.ts";

// 監督役が取り込める状態にした回を main へ取り込む。手順は .claude/skills/supervise/SKILL.md の「結果ファイル」節
// による。main は fast-forward でだけ動かす。

/** main checkout が main をチェックアウトし、作業ツリーがきれいか。違えば理由を返す。 */
export const checkoutProblem = (repository: string): string | undefined => {
  const branch = git(repository, ["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim();
  if (branch !== "main") {
    return `main checkout のブランチが main でない（${branch === "" ? "detached" : branch}）`;
  }
  const status = gitOrThrow(repository, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return status === "" ? undefined : `main checkout の作業ツリーがきれいでない:\n${status}`;
};

export const revParse = (cwd: string, revision: string): string | undefined => {
  const result = git(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", revision]);
  return result.status === 0 ? result.stdout.trim() : undefined;
};

/** `completions` の順に `axon complete` を実行し、失敗した ID を返す。失敗しても残りを続ける。 */
const runCompletions = (worktree: string, result: RoundResult): readonly string[] => {
  const failed: string[] = [];
  for (const completion of result.completions) {
    const done = run(
      "axon",
      ["complete", "--no-color", `--reason=${completion.reason}`, completion.id],
      worktree,
    );
    log(
      `axon complete ${completion.id}: 終了コード ${String(done.status)} ${(done.stdout + done.stderr).trim()}`,
    );
    if (done.status !== 0) {
      failed.push(completion.id);
    }
  }
  return failed;
};

const COMMIT_MESSAGE = `chore: Record the work a supervisor round completed

The supervisor session runs in an isolated worktree, where Claude Code
refuses to run the completions itself. The unattended driver ran them
from the round's result file in the session worktree and commits the
records there, so main still moves only by a fast-forward.
`;

/** 完了の記録を commit し、取り込む commit を返す。記録の変更が無ければ head のまま。 */
const commitRecords = (worktree: string, head: string): string => {
  const check = run("axon", ["storage", "check", "--no-color", worktree], worktree);
  if (check.status !== 0) {
    throw new Error(`axon storage check が失敗した: ${(check.stdout + check.stderr).trim()}`);
  }
  const status = gitOrThrow(worktree, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
  ]);
  const paths = status
    .split("\0")
    .filter((entry) => entry !== "")
    .map((entry) => entry.slice(3));
  if (paths.length === 0) {
    return head;
  }
  const outside = outsideRecords(paths);
  if (outside.length > 0) {
    throw new Error(`.axon/ の外に変更がある: ${outside.join(", ")}`);
  }
  gitOrThrow(worktree, ["add", "--all", "--", ".axon"]);
  gitOrThrow(worktree, ["commit", "--quiet", "-m", COMMIT_MESSAGE]);
  const changed = outsideRecords(
    gitOrThrow(worktree, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).split("\n"),
  );
  if (changed.length > 0) {
    throw new Error(`記録の commit が .axon/ の外を変えた: ${changed.join(", ")}`);
  }
  return gitOrThrow(worktree, ["rev-parse", "HEAD"]).trim();
};

const DEPENDENCY_FILES = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];

/**
 * main checkout で fast-forward する。`git merge` はチェックアウトしているブランチを動かすので、回の間に main checkout
 * のブランチが変わっていれば取り込まない。
 */
const fastForward = (repository: string, target: string, mainBefore: string): void => {
  const problem =
    checkoutProblem(repository) ??
    (revParse(repository, "refs/heads/main") === mainBefore
      ? undefined
      : "main が回の開始時から動いた");
  if (problem !== undefined) {
    throw new Error(problem);
  }
  gitOrThrow(repository, ["merge", "--ff-only", "--quiet", target]);
};

/**
 * `nothing` の回が取り込めるのは Axon の記録だけの commit（前の回から拾った完了など）に限る。commit ごとに、rename
 * を元と先の 2 つのパスとして見る（両端の差分だけでは、`.axon/` への rename や後の commit で戻した変更が見えない）。
 */
const nothingProblem = (worktree: string, result: RoundResult): string | undefined => {
  if (result.status !== "nothing") {
    return undefined;
  }
  const changed = outsideRecords(
    gitOrThrow(worktree, [
      "log",
      "--format=",
      "--name-only",
      "--no-renames",
      "-m",
      `${result.base}..${result.head}`,
    ]).split("\n"),
  );
  return changed.length === 0
    ? undefined
    : `nothing の回の commit が Axon の記録の外を変えた: ${[...new Set(changed)].join(", ")}`;
};

/**
 * 取り込みの手順。取り込めたかと、実行できなかった完了の ID を返す。完了を実行する前に取り込まないと決めたときと、
 * 記録の commit か取り込みが失敗したとき（実行した完了の記録も捨てる）は、すべての完了を実行できなかったものとして
 * 返す（次の回の監督役が拾い直す）。
 */
const merge = (
  repository: string,
  worktree: string,
  result: RoundResult,
  mainBefore: string,
): { merged: boolean; failedCompletions: readonly string[] } => {
  const all = result.completions.map((completion) => completion.id);
  const refusal =
    checkoutProblem(repository) ??
    (revParse(repository, "refs/heads/main") === mainBefore
      ? undefined
      : "main が回の開始時から動いた") ??
    (revParse(worktree, "HEAD") === result.head
      ? undefined
      : `セッションの worktree の HEAD が head（${result.head}）でない`) ??
    (git(worktree, ["symbolic-ref", "--quiet", "HEAD"]).stdout.trim() ===
    `refs/heads/${result.branch}`
      ? undefined
      : `セッションの worktree が ${result.branch} をチェックアウトしていない`) ??
    nothingProblem(worktree, result);
  if (refusal !== undefined) {
    log(`取り込まない: ${refusal}`);
    return { merged: false, failedCompletions: all };
  }
  const failedCompletions = runCompletions(worktree, result);
  try {
    const target = commitRecords(worktree, result.head);
    fastForward(repository, target, mainBefore);
    log(`main を ${target} へ fast-forward した`);
  } catch (error) {
    log(`記録の commit か取り込みが失敗したので、head だけを取り込む: ${String(error)}`);
    const restored =
      git(worktree, ["reset", "--hard", "--quiet", result.head]).status === 0 &&
      git(worktree, ["clean", "-fd", "--quiet", "--", ".axon"]).status === 0;
    let merged = false;
    try {
      if (restored) {
        fastForward(repository, result.head, mainBefore);
        merged = true;
      }
    } catch (fallbackError) {
      log(`head も取り込めなかった: ${String(fallbackError)}`);
    }
    log(merged ? `main を head（${result.head}）へ fast-forward した` : "何も取り込まなかった");
    return { merged, failedCompletions: all };
  }
  return { merged: true, failedCompletions };
};

/** 依存が変わっていれば main checkout で入れ直す。失敗しても回は失敗にしない（次の回は自分の worktree で入れる）。 */
const reinstall = (repository: string, mainBefore: string, mainAfter: string): void => {
  const diff = git(repository, [
    "diff",
    "--quiet",
    mainBefore,
    mainAfter,
    "--",
    ...DEPENDENCY_FILES,
  ]);
  if (diff.status === 0) {
    return;
  }
  const install = run("pnpm", ["install", "--frozen-lockfile"], repository);
  log(`依存が変わったので pnpm install した: 終了コード ${String(install.status)}`);
};

export interface Decided {
  readonly failed: boolean;
  readonly outcome: string;
  readonly failedCompletions: readonly string[];
}

/**
 * 回の判断に従って取り込む。`completionIds` は result.json が挙げた完了で、取り込まない回では、すべてを実行できなかった
 * ものとして返す。
 */
export const settle = (
  repository: string,
  worktree: string,
  verdict: Verdict,
  facts: { readonly mainBefore: string; readonly completionIds: readonly string[] },
): Decided => {
  const { mainBefore, completionIds } = facts;
  if (verdict.kind === "failed") {
    return {
      failed: true,
      outcome: `取り込まなかった: ${verdict.reason}`,
      failedCompletions: completionIds,
    };
  }
  if (verdict.kind === "skip") {
    return { failed: false, outcome: "取り込むものが無かった（nothing）", failedCompletions: [] };
  }
  const { merged, failedCompletions } = merge(repository, worktree, verdict.result, mainBefore);
  const mainAfter = revParse(repository, "refs/heads/main") ?? mainBefore;
  if (merged) {
    reinstall(repository, mainBefore, mainAfter);
  }
  const problem = mergeProblem(verdict.result, merged, mainBefore, mainAfter);
  return {
    failed: problem !== undefined,
    outcome:
      problem ??
      `${verdict.result.status}: ${mainAfter === mainBefore ? "main は動かなかった" : `main を ${mainAfter} へ進めた`}`,
    failedCompletions,
  };
};
