import { existsSync, mkdirSync, statfsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { Options } from "../options.ts";
import { parseOptions, USAGE } from "../options.ts";
import type { Counts, Stop } from "../round.ts";
import { nextCounts, stopReason } from "../round.ts";
import { acquireDriverLock, liveSession, mainCheckout } from "./guards.ts";
import { releaseStaleLocks, worktrees } from "./locks.ts";
import { checkoutProblem } from "./merge.ts";
import { runRound } from "./round.ts";
import { gitOrThrow, log, stopRunningSession } from "./run.ts";

// 無人運転のドライバ。main checkout から監督セッション（`/supervise`）を 1 回ずつ起動し、監督役が取り込める状態に
// したセッション用ブランチを main へ fast-forward で取り込む。取り決めは AGENTS.md「役割」と
// .claude/skills/supervise/SKILL.md の「結果ファイル」節による。
//
// 起動: main checkout のルートで `nohup caffeinate -i node scripts/autopilot/cli/main.ts --until <時刻> --log-dir
// <ディレクトリ> ... > <ログ> 2>&1 &`。caffeinate は起動の形が担う。ドライバは起動時に読み込んだ版で最後まで動く
// （取り込みで scripts/autopilot が変わっても、変わった版は次の起動から使う）。

let signal: string | undefined;
const onSignal = (name: string): void => {
  signal = name;
  log(`シグナル ${name} を受け取った。実行中のセッションを止める`);
  stopRunningSession();
};
process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);

const freeBytes = (path: string): number => {
  const stats = statfsSync(path);
  return stats.bavail * stats.bsize;
};

/** 止まるときに、main に取り込まれていないセッション用ブランチと、main checkout 以外の worktree を挙げる。 */
const reportLeftovers = (repository: string): void => {
  const branches = gitOrThrow(repository, [
    "branch",
    "--list",
    "--no-merged",
    "refs/heads/main",
    "--format=%(refname:short) %(objectname)",
    "worktree-*",
  ]).trim();
  log(
    `main に取り込まれていないセッション用・worker のブランチ:\n${branches === "" ? "なし" : branches}`,
  );
  const others = worktrees(repository).slice(1);
  const lines = others.map(
    (entry) =>
      `${entry.path} ${entry.branch ?? "(detached)"}${entry.lock === undefined ? "" : ` locked: ${entry.lock}`}`,
  );
  log(`main checkout 以外の worktree:\n${lines.length === 0 ? "なし" : lines.join("\n")}`);
};

interface Paths {
  readonly repository: string;
  readonly logDir: string;
  readonly stopFile: string;
  readonly waitFile: string | undefined;
}

const stopFor = (
  options: Options,
  paths: Paths,
  counts: Counts,
  usageLimit: readonly string[],
): Stop | undefined =>
  stopReason({
    now: Date.now(),
    until: options.until,
    stopFileExists: existsSync(paths.stopFile),
    consecutiveFailures: counts.failures,
    maxFailures: options.maxFailures,
    consecutiveIdle: counts.idle,
    maxIdle: options.maxIdle,
    // 回は main checkout の下に worktree と依存を、ログの置き場に出力を書く。少ない方で判断する。
    freeBytes: Math.min(freeBytes(paths.repository), freeBytes(paths.logDir)),
    minFreeBytes: options.minFreeBytes,
    usageLimit,
    signal,
  });

/** 待機ファイルが消えるまで待つ。待っている間も、終了時刻・停止用ファイル・シグナルでは止まる。 */
const waitForRelease = async (options: Options, paths: Paths): Promise<Stop | undefined> => {
  if (paths.waitFile === undefined) {
    return undefined;
  }
  log(`待機ファイル ${paths.waitFile} が消えるまで最初の回を始めない`);
  while (existsSync(paths.waitFile)) {
    const stop = stopFor(options, paths, { failures: 0, idle: 0 }, []);
    if (stop !== undefined) {
      return stop;
    }
    await sleep(options.poll);
  }
  log("待機ファイルが消えた");
  return undefined;
};

/** 止める理由が見つかるまで回を続ける。 */
const roundLoop = async (options: Options, paths: Paths): Promise<Stop> => {
  const { repository } = paths;
  let counts: Counts = { failures: 0, idle: 0 };
  let usageLimit: readonly string[] = [];
  let previousReport =
    options.previousReport === undefined ? undefined : resolve(options.previousReport);
  for (;;) {
    // 前の回の後始末（同期の処理）の間に届いたシグナルの処理を先に走らせてから、止めるかを決める。シグナルは
    // イベントループの I/O の段で読まれるので、タイマーで 1 周待つ。
    await sleep(10);
    const stop = stopFor(options, paths, counts, usageLimit);
    if (stop !== undefined) {
      return stop;
    }
    const problem = checkoutProblem(repository) ?? liveSession(repository);
    if (problem !== undefined) {
      return { reason: problem, expected: false };
    }
    try {
      const round = await runRound({
        repository,
        logDir: paths.logDir,
        direction: options.direction,
        previousReport,
        timeout: options.roundTimeout,
      });
      counts = nextCounts(counts, round.kind);
      ({ usageLimit } = round);
      ({ previousReport } = round);
    } catch (error) {
      counts = nextCounts(counts, "failed");
      log(`回の途中でドライバの処理が失敗した: ${String(error)}`);
    }
  }
};

/**
 * 起動してよいか。前の実行の停止用ファイルが残っているか、この main checkout で別のドライバか監督セッションが
 * 動いていれば理由を返す。
 */
const startProblem = (paths: Paths): string | undefined => {
  if (existsSync(paths.stopFile)) {
    return `停止用ファイル ${paths.stopFile} が起動時からある（前の実行のものなら消してから起動する）`;
  }
  return acquireDriverLock(paths.repository) ?? liveSession(paths.repository);
};

const drive = async (options: Options): Promise<Stop> => {
  const repository = mainCheckout();
  const logDir = resolve(options.logDir);
  mkdirSync(logDir, { recursive: true });
  const paths: Paths = {
    repository,
    logDir,
    stopFile: resolve(options.stopFile ?? join(logDir, "stop")),
    waitFile: options.waitFile === undefined ? undefined : resolve(options.waitFile),
  };
  const problem = startProblem(paths);
  if (problem !== undefined) {
    return { reason: problem, expected: false };
  }
  writeFileSync(join(logDir, "driver.pid"), `${String(process.pid)}\n`);
  log(
    `ドライバを起動した: pid ${String(process.pid)}、main checkout ${repository}、終了時刻 ${new Date(options.until).toISOString()}、停止用ファイル ${paths.stopFile}`,
  );
  const waited = await waitForRelease(options, paths);
  if (waited !== undefined) {
    return waited;
  }
  // 前のドライバのプロセスが中断した回の lock を外す。
  releaseStaleLocks(repository);
  return roundLoop(options, paths);
};

const main = async (args: readonly string[]): Promise<number> => {
  const parsed = parseOptions(args, Date.now());
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    return 2;
  }
  let stop: Stop = { reason: "ドライバの処理が失敗した", expected: false };
  try {
    stop = await drive(parsed.options);
  } catch (error) {
    log(`ドライバの処理が失敗した: ${String(error)}`);
  }
  log(`ドライバを止める: ${stop.reason}`);
  try {
    reportLeftovers(process.cwd());
  } catch (error) {
    log(`残った worktree とブランチを一覧にできなかった: ${String(error)}`);
  }
  return stop.expected ? 0 : 1;
};

process.exitCode = await main(process.argv.slice(2));
