import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SessionEnd } from "../round.ts";
import { parseSessionOutput, resultDigest } from "../session-output.ts";
import { sessionArgs, sessionEnv } from "../session.ts";
import type { Worktree } from "../worktrees.ts";
import { currentWorkers } from "./locks.ts";
import type { Sink } from "./run.ts";
import { attempt, log, runSession } from "./run.ts";

// 1 回の監督セッションを起動して終わるまで待ち、その間に worker の worktree を調べ、出力の要約をログに残す。

export const describeEnd = (end: SessionEnd): string => {
  if (end.timedOut) {
    return `1 回の時間の上限に達してドライバが止めた（終了コード ${String(end.exitCode)}、シグナル ${String(end.signal)}）`;
  }
  return end.signal === null ? `終了コード ${String(end.exitCode)}` : `シグナル ${end.signal}`;
};

/** セッションの間に worker の worktree を調べる間隔。worker が終わって lock が外れる前に見つけるため。 */
const WORKER_POLL_MS = 10_000;

/** 実行中のセッションの worker の worktree を seen に足す。`before` はセッションを起動する前から在った worktree。 */
const remember = (
  repository: string,
  paths: { readonly worktree: string; readonly worktreesDirectory: string },
  before: readonly string[],
  seen: { readonly set: (path: string, worker: Worktree) => unknown },
): void => {
  try {
    for (const worker of currentWorkers(repository, paths, before)) {
      seen.set(worker.path, worker);
    }
  } catch (error) {
    log(`worker の worktree を調べられなかった: ${String(error)}`);
  }
};

/** セッションの出力を読み、要約をログに残して、利用上限に達したことを示すメッセージを返す。 */
const digest = (roundDir: string, problems: Sink): readonly string[] => {
  const output =
    attempt(
      "セッションの出力を読めなかった",
      () => parseSessionOutput(readFileSync(join(roundDir, "stream.jsonl"), "utf8")),
      problems,
    ) ?? parseSessionOutput("");
  for (const line of [
    ...resultDigest(output.result),
    ...output.usageLimit,
    ...(output.unreadableLines > 0
      ? [`JSON として読めなかった出力の行: ${String(output.unreadableLines)} 行`]
      : []),
  ]) {
    log(`  ${line}`);
  }
  return output.usageLimit;
};

export const session = async (
  settings: {
    readonly repository: string;
    readonly direction: string | undefined;
    readonly previousReport: string | undefined;
    readonly timeout: number;
  },
  paths: {
    readonly name: string;
    readonly worktree: string;
    readonly worktreesDirectory: string;
    readonly roundDir: string;
    readonly claudeTemp: string;
    readonly temp: string;
  },
  /** セッションを起動する前から在った worktree のパス。 */
  before: readonly string[],
  problems: Sink,
): Promise<{
  readonly end: SessionEnd;
  readonly pid: number | undefined;
  readonly usageLimit: readonly string[];
  readonly seen: readonly Worktree[];
}> => {
  const seen = new Map<string, Worktree>();
  const poll = setInterval(() => {
    remember(settings.repository, paths, before, seen);
  }, WORKER_POLL_MS);
  const { end, pid } = await runSession({
    command: "claude",
    args: sessionArgs(paths.name, settings.direction),
    cwd: settings.repository,
    env: sessionEnv(process.env, { ...paths, previousReport: settings.previousReport }),
    stdoutPath: join(paths.roundDir, "stream.jsonl"),
    stderrPath: join(paths.roundDir, "stderr.log"),
    timeout: settings.timeout,
  }).finally(() => {
    clearInterval(poll);
  });
  log(`回 ${paths.name} のセッションが終わった: ${describeEnd(end)}`);
  const usageLimit = digest(paths.roundDir, problems);
  return { end, pid, usageLimit, seen: [...seen.values()] };
};
