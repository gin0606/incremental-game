import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";

import type { SessionEnd } from "../round.ts";
import { parseSessionOutput, resultDigest } from "../session-output.ts";
import { sessionArgs, sessionEnv } from "../session.ts";
import type { Worktree } from "../worktrees.ts";
import { currentWorkers } from "./locks.ts";
import type { Sink } from "./run.ts";
import { attempt, log, runSession } from "./run.ts";

// 1 回の監督セッションを起動して終わるまで待ち、その間に worker の worktree を調べ、出力の要約をログに残す。
// セッションが worktree に残したファイル（.tmp/supervise/）を、worktree を消す前に回のログの置き場へ写す。

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

/** 取り込むかの判断に使う、`.tmp/supervise/` の結果ファイル。 */
const RESULT_FILES = ["report.md", "result.json"];

/** 写す 1 つ。ディレクトリは中を写し、symlink は指す先を書き換えずに写す。ほかの種類（FIFO など）は写さない。 */
const copyEntry = (from: string, to: string, skip: readonly string[]): void => {
  const stats = lstatSync(from);
  if (stats.isDirectory()) {
    copyTree(from, to, skip);
  } else if (stats.isSymbolicLink()) {
    symlinkSync(readlinkSync(from), to);
  } else if (stats.isFile()) {
    copyFileSync(from, to);
  } else {
    log(`回のログの置き場へ写さなかった（通常のファイルでない）: ${from}`);
  }
};

/** `source` の下を `destination` へ名前の順に 1 つずつ写す。写せないものはログに残し、残りを写し続ける。 */
function copyTree(source: string, destination: string, skip: readonly string[]): void {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source).toSorted()) {
    const from = join(source, name);
    if (!skip.includes(from)) {
      try {
        copyEntry(from, join(destination, name), skip);
      } catch (error) {
        log(`回のログの置き場へ写せなかった: ${from}: ${String(error)}`);
      }
    }
  }
}

/**
 * セッションの worktree の `.tmp/supervise/`（結果ファイル、回の記録、回の記録が参照する judge の出力など）を、回の
 * ディレクトリの `supervise/` へ写す。`git worktree remove` で消えるため。結果ファイルは先に中身を写し（symlink なら
 * 指す先の中身）、写せなければ回の失敗にする。ほかは後で判断を確かめる材料なので、写せないものがあってもログに残す
 * だけにする。symlink は指す先を書き換えずに写し、相対の symlink が写した先の中を指すようにする。
 */
export const copySessionFiles = (worktree: string, sessionCopy: string, problems: Sink): void => {
  const source = join(worktree, ".tmp/supervise");
  if (!existsSync(source)) {
    return;
  }
  for (const file of RESULT_FILES) {
    attempt(
      `結果ファイル ${file} を回のログの置き場へ写せなかった`,
      () => {
        mkdirSync(sessionCopy, { recursive: true });
        if (existsSync(join(source, file))) {
          copyFileSync(join(source, file), join(sessionCopy, file));
        }
      },
      problems,
    );
  }
  const notFatal: string[] = [];
  attempt(
    ".tmp/supervise/ を回のログの置き場へ写せなかった",
    () => {
      copyTree(
        source,
        sessionCopy,
        RESULT_FILES.map((file) => join(source, file)),
      );
    },
    notFatal,
  );
};
