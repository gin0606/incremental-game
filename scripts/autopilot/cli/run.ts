import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import type { SessionEnd } from "../round.ts";
import { commandEnv } from "../session.ts";

export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** ログの 1 行。時刻は UTC の ISO 8601。 */
export const log = (message: string): void => {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
};

/**
 * 回の後のコマンド（`axon`、commit の hook が全検査を回す `git commit`、`pnpm install`）を待つ上限。止まったまま
 * 終わらないコマンドで、ドライバが終了時刻・停止用ファイル・シグナルを見られなくならないようにする。
 */
const COMMAND_TIMEOUT_MS = 3_600_000;

/** コマンドを実行して出力を受け取る。起動できない・時間の上限に達したときは終了コード null と理由を返す。 */
export const run = (
  command: string,
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string | undefined>> = commandEnv(process.env),
): CommandResult => {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 1024 ** 3,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
    // SIGTERM を無視するコマンドで止まらないように、時間の上限では SIGKILL を送る。
    killSignal: "SIGKILL",
  });
  return {
    status: result.status,
    // 起動できなかったときは出力が無い。
    stdout: result.error === undefined ? result.stdout : "",
    stderr: result.error === undefined ? result.stderr : String(result.error),
  };
};

/** git を英語の出力で実行する。 */
export const git = (cwd: string, args: readonly string[]): CommandResult =>
  run("git", args, cwd, { ...commandEnv(process.env), LC_ALL: "C" });

export const gitOrThrow = (cwd: string, args: readonly string[]): string => {
  const result = git(cwd, args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} が失敗した: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

/** プロセスグループにシグナルを送る。グループがもう無ければ何もしない。 */
const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    // グループの全員が終わっている。
  }
};

/** 時間切れやシグナルで SIGTERM を送ってから、SIGKILL を送るまでの猶予。 */
const KILL_GRACE_MS = 30_000;

/** SIGTERM を送り、猶予の後もグループが残っていれば SIGKILL を送る。 */
const terminateGroup = (pid: number): NodeJS.Timeout => {
  signalGroup(pid, "SIGTERM");
  return setTimeout(() => {
    signalGroup(pid, "SIGKILL");
  }, KILL_GRACE_MS);
};

let running: ChildProcess | undefined;
let stopping: NodeJS.Timeout | undefined;

/** 実行中のセッションを止める（ドライバが終了のシグナルを受け取ったとき）。 */
export const stopRunningSession = (): void => {
  if (running?.pid !== undefined && stopping === undefined) {
    stopping = terminateGroup(running.pid);
  }
};

const groupExists = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * セッションが終わった後に残ったグループのプロセス（セッションがバックグラウンドで起動したものなど）を止め、
 * 終わるまで待つ。残ったプロセスが回の一時ディレクトリや worktree に書き続けると、後始末と競合するため。
 */
const reapGroup = async (pid: number): Promise<void> => {
  if (!groupExists(pid)) {
    return;
  }
  signalGroup(pid, "SIGTERM");
  const deadline = Date.now() + KILL_GRACE_MS;
  while (groupExists(pid) && Date.now() < deadline) {
    await sleep(200);
  }
  if (groupExists(pid)) {
    signalGroup(pid, "SIGKILL");
    log(`セッションの後に残ったプロセスが SIGTERM で終わらなかったので SIGKILL を送った`);
  } else {
    log(`セッションの後に残ったプロセスを SIGTERM で止めた`);
  }
};

export interface SessionLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly timeout: number;
}

/** セッションの終わり方と、セッションのプロセスの識別子（起動できなければ undefined）。 */
export interface SessionRun {
  readonly end: SessionEnd;
  readonly pid: number | undefined;
}

/**
 * 監督セッションを起動して終わるまで待つ。標準入力は渡さず、出力はファイルに書かせる。自分のプロセスグループで
 * 動かし、時間切れのときと、終わった後に残ったプロセス（セッションがバックグラウンドで起動したものなど）を、
 * グループごと止める。
 */
export const runSession = async (launch: SessionLaunch): Promise<SessionRun> => {
  const stdout = openSync(launch.stdoutPath, "a");
  const stderr = openSync(launch.stderrPath, "a");
  try {
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: launch.env,
      stdio: ["ignore", stdout, stderr],
      detached: true,
    });
    running = child;
    const { pid } = child;
    const state: { timedOut: boolean; kill: NodeJS.Timeout | undefined } = {
      timedOut: false,
      kill: undefined,
    };
    const timer = setTimeout(() => {
      state.timedOut = true;
      if (pid !== undefined) {
        state.kill = terminateGroup(pid);
      }
    }, launch.timeout);
    const end = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      child.on("error", (error: unknown) => {
        log(`監督セッションを起動できなかった: ${String(error)}`);
        resolve({ exitCode: null, signal: null });
      });
      child.on("exit", (exitCode, signal) => {
        resolve({ exitCode, signal });
      });
    });
    clearTimeout(timer);
    clearTimeout(state.kill);
    clearTimeout(stopping);
    stopping = undefined;
    running = undefined;
    if (pid !== undefined) {
      await reapGroup(pid);
    }
    return { end: { ...end, timedOut: state.timedOut }, pid };
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
};

/** プロセスが動いているか。 */
export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // 権限が無いだけなら動いている。
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

/** 失敗の理由を集める先。 */
export interface Sink {
  readonly push: (problem: string) => unknown;
}

/** 失敗をログに残して undefined を返す。回の後始末を、途中の失敗で飛ばさないために使う。 */
export const attempt = <T>(what: string, action: () => T, problems: Sink): T | undefined => {
  try {
    return action();
  } catch (error) {
    const problem = `${what}: ${String(error)}`;
    log(problem);
    problems.push(problem);
    return undefined;
  }
};
