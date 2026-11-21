import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseResultFile } from "../result-file.ts";
import type { RoundKind } from "../round.ts";
import { branchName, judgeSession, roundKind } from "../round.ts";
import { previousReport, roundName } from "../session.ts";
import type { Worktree } from "../worktrees.ts";
import { releaseLocks, worktrees } from "./locks.ts";
import type { Decided } from "./merge.ts";
import { revParse, settle } from "./merge.ts";
import type { Sink } from "./run.ts";
import { attempt, git, gitOrThrow, log } from "./run.ts";
import { describeEnd, session } from "./session.ts";

// 1 回の監督セッションを起動し、結果ファイルを読んで取り込み、後始末をする。取り込みの手順は
// .claude/skills/supervise/SKILL.md の「結果ファイル」節による。

export interface RoundSettings {
  /** main checkout のルート。 */
  readonly repository: string;
  readonly logDir: string;
  readonly direction: string | undefined;
  readonly previousReport: string | undefined;
  readonly timeout: number;
}

export interface RoundOutcome {
  readonly name: string;
  readonly kind: RoundKind;
  /** 利用上限に達したことを示すメッセージ。 */
  readonly usageLimit: readonly string[];
  /** 次の回に渡す前の回の最終報告。書けなければ undefined。 */
  readonly previousReport: string | undefined;
}

/** セッションの worktree の結果ファイルを回のディレクトリへ写す。`git worktree remove` で消えるため。 */
const copySessionFiles = (worktree: string, roundDir: string): void => {
  for (const file of ["report.md", "result.json", "round.md"]) {
    const source = join(worktree, ".tmp/supervise", file);
    if (existsSync(source)) {
      copyFileSync(source, join(roundDir, file));
    }
  }
};

const readIfExists = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

/** 取り込んだ回のセッション用の worktree とブランチを消す。 */
const removeSession = (repository: string, worktree: string, branch: string): void => {
  if (existsSync(worktree)) {
    const removed = git(repository, ["worktree", "remove", worktree]);
    log(
      `git worktree remove ${worktree}: ${removed.status === 0 ? "消した" : removed.stderr.trim()}`,
    );
  }
  const deleted = git(repository, ["branch", "-d", branch]);
  log(`git branch -d ${branch}: ${deleted.status === 0 ? "消した" : deleted.stderr.trim()}`);
};

interface RoundPaths {
  readonly name: string;
  readonly branch: string;
  /** セッション用の worktree。 */
  readonly worktree: string;
  readonly worktreesDirectory: string;
  /** 回のログの置き場。 */
  readonly roundDir: string;
  readonly claudeTemp: string;
  readonly temp: string;
}

/**
 * 使われていない回の名前（worktree・ブランチ・回のログのどれにも無いもの）を選び、回のディレクトリと一時ディレクトリを
 * 作る。
 */
const prepare = (repository: string, logDir: string): RoundPaths => {
  const worktreesDirectory = join(repository, ".claude/worktrees");
  const name = roundName(
    Date.now(),
    (candidate) =>
      existsSync(join(worktreesDirectory, candidate)) ||
      existsSync(join(logDir, "rounds", candidate)) ||
      revParse(repository, `refs/heads/${branchName(candidate)}`) !== undefined,
  );
  const roundDir = join(logDir, "rounds", name);
  const paths = {
    name,
    branch: branchName(name),
    worktree: join(worktreesDirectory, name),
    worktreesDirectory,
    roundDir,
    claudeTemp: join(roundDir, "cctmp"),
    temp: join(roundDir, "tmp"),
  };
  mkdirSync(paths.claudeTemp, { recursive: true });
  mkdirSync(paths.temp, { recursive: true });
  return paths;
};

/**
 * 回の後始末。取り込んだ回のセッション用の worktree とブランチ、回の一時ディレクトリを消し、次の回に渡す前の回の
 * 最終報告を書いて、そのパスを返す。消せなかったものはログに残して続ける。
 */
const finish = (
  repository: string,
  paths: RoundPaths,
  decided: Decided,
  facts: {
    readonly report: string | undefined;
    readonly ended: string;
    readonly workers: readonly Worktree[];
  },
): string | undefined => {
  const problems: string[] = [];
  if (!decided.failed) {
    attempt(
      "セッション用の worktree とブランチを消せなかった",
      () => {
        removeSession(repository, paths.worktree, paths.branch);
      },
      problems,
    );
  }
  for (const directory of [paths.claudeTemp, paths.temp]) {
    attempt(
      `一時ディレクトリ ${directory} を消せなかった`,
      () => {
        rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
      },
      problems,
    );
  }
  const handover = join(paths.roundDir, "previous-report.md");
  return attempt(
    "次の回に渡す最終報告を書けなかった",
    () => {
      writeFileSync(
        handover,
        previousReport(facts.report, {
          name: paths.name,
          ended: facts.ended,
          outcome: decided.outcome,
          failedCompletions: decided.failedCompletions,
          agentWorktrees: facts.workers,
        }),
      );
      return handover;
    },
    problems,
  );
};

/** セッションの後の、取り込むかの判断に使う事実を集める。集められなかったものは problems に入れる。 */
const collect = (
  settings: RoundSettings,
  paths: RoundPaths,
  run: {
    readonly pid: number | undefined;
    readonly before: readonly string[];
    readonly seen: readonly Worktree[];
  },
  problems: Sink,
): {
  readonly report: string | undefined;
  readonly result: ReturnType<typeof parseResultFile> | undefined;
  readonly workers: readonly Worktree[];
} => {
  attempt(
    "結果ファイルを回のログの置き場へ写せなかった",
    () => {
      copySessionFiles(paths.worktree, paths.roundDir);
    },
    problems,
  );
  const report = attempt(
    "report.md を読めなかった",
    () => readIfExists(join(paths.roundDir, "report.md")),
    problems,
  );
  const resultText = attempt(
    "result.json を読めなかった",
    () => readIfExists(join(paths.roundDir, "result.json")),
    problems,
  );
  const workers =
    attempt(
      "worktree の lock を外せなかった",
      () => releaseLocks(settings.repository, paths, run),
      problems,
    ) ?? [];
  return {
    report,
    result: resultText === undefined ? undefined : parseResultFile(resultText),
    workers,
  };
};

/** 1 回を回す。セッションの後の手順が途中で失敗しても、後始末と次の回への申し送りは行う。 */
export const runRound = async (settings: RoundSettings): Promise<RoundOutcome> => {
  const { repository } = settings;
  // 回の前から在る worktree は、lock の持ち主がこの回のセッションのプロセスに見えても、この回の worker にしない。
  const before = worktrees(repository).map((entry) => entry.path);
  const paths = prepare(repository, settings.logDir);
  const mainBefore = gitOrThrow(repository, ["rev-parse", "refs/heads/main"]).trim();
  log(`回 ${paths.name} を始める（main ${mainBefore}、ログ ${paths.roundDir}）`);
  const problems: string[] = [];
  const { end, pid, usageLimit, seen } = await session(settings, paths, before, problems);
  const { report, result, workers } = collect(settings, paths, { pid, before, seen }, problems);
  const completionIds = result?.ok === true ? result.result.completions.map(({ id }) => id) : [];
  const verdict =
    problems.length > 0
      ? { kind: "failed" as const, reason: problems.join("、") }
      : judgeSession({
          end,
          result,
          roundName: paths.name,
          branchTip: revParse(repository, `refs/heads/${paths.branch}`),
          mainAtStart: mainBefore,
          reportWritten: report !== undefined,
        });
  const decided = attempt(
    "取り込みの途中で失敗した",
    () => settle(repository, paths.worktree, verdict, { mainBefore, completionIds }),
    problems,
  ) ?? {
    failed: true,
    outcome: `取り込みの途中で失敗した（${problems.at(-1) ?? ""}）`,
    failedCompletions: completionIds,
  };
  log(`回 ${paths.name}: ${decided.failed ? "失敗" : "成功"}。${decided.outcome}`);
  const handover = finish(repository, paths, decided, { report, ended: describeEnd(end), workers });
  return {
    name: paths.name,
    kind: roundKind(decided.failed, verdict),
    usageLimit,
    previousReport: handover,
  };
};
