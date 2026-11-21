import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createRepository, gitIn, isolatedEnv } from "../../protect/cli/fixture.ts";

// 無人運転のドライバのテストが使う、使い捨てのリポジトリと、監督セッションの代わりの模擬の claude・axon・pnpm
// （mock/ の下）。

const DRIVER = fileURLToPath(new URL("main.ts", import.meta.url));
/** 1 件のテストでドライバを動かす時間の上限。テストの時間切れ（120 秒）より短くする。 */
const DRIVER_TIMEOUT_MS = 90_000;

const MOCK_BIN = fileURLToPath(new URL("mock", import.meta.url));

export interface Context {
  /** main checkout（使い捨てのリポジトリ）。 */
  readonly repository: string;
  /** 模擬のコマンドのシナリオと記録を置くディレクトリ。 */
  readonly mock: string;
  readonly logDir: string;
  readonly stopFile: string;
}

export const createContext = (): Context => {
  const repository = realpathSync(
    createRepository({ ".gitignore": ".claude/worktrees/\n.tmp/\n", "README.md": "x\n" }),
  );
  const mock = mkdtempSync(join(tmpdir(), "autopilot-mock-"));
  return { repository, mock, logDir: join(mock, "logs"), stopFile: join(mock, "stop") };
};

/** startDriver で起動したドライバ。テストが途中で失敗しても残さない。 */
const started: ChildProcess[] = [];

const killQuietly = (pid: number): void => {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // もう終わっている。
  }
};

export const removeContext = (context: Context): void => {
  for (const child of started.splice(0)) {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      killQuietly(child.pid);
    }
  }
  // hang のシナリオの模擬の claude は自分のプロセスグループで待ち続ける。
  const hang = Number(readIf(join(context.mock, "hang.pid")));
  if (Number.isSafeInteger(hang) && hang > 0) {
    killQuietly(-hang);
  }
  for (const directory of [context.repository, context.mock]) {
    rmSync(directory, { recursive: true, force: true });
  }
};

const driverEnv = (context: Context): NodeJS.ProcessEnv =>
  isolatedEnv({
    PATH: `${MOCK_BIN}:${process.env["PATH"] ?? ""}`,
    MOCK_DIR: context.mock,
    MOCK_STOP: context.stopFile,
    MOCK_REPOSITORY: context.repository,
    // ドライバが worker の worktree を調べる間隔（10 秒）より長く worker を動かす。
    MOCK_WORKER_SECONDS: "12",
    // 起動元の Claude Code のセッションから受け継ぐ変数。ドライバは監督セッションに渡さない。
    CLAUDECODE: "1",
    CLAUDE_CODE_RETRY_WATCHDOG: "1",
    // 利用者の設定。監督セッションに渡す。
    CLAUDE_CODE_OAUTH_TOKEN: "token",
  });

const UNTIL = new Date(Date.now() + 3_600_000).toISOString();

const driverArgs = (context: Context, extra: readonly string[]): readonly string[] => [
  DRIVER,
  "--until",
  UNTIL,
  "--log-dir",
  context.logDir,
  // 停止用ファイルがログの置き場の stop なら、既定に任せる。
  ...(context.stopFile === join(context.logDir, "stop") ? [] : ["--stop-file", context.stopFile]),
  "--direction",
  "基盤の試運転",
  // 空きの少ない機械でも、ディスクの空きの閾値を確かめるテストのほかは止まらないようにする。
  ...(extra.includes("--min-free-gb") ? [] : ["--min-free-gb", "0"]),
  ...extra,
];

/** 模擬の claude が回ごとに 1 行ずつ使うシナリオ。 */
export const scenarios = (context: Context, ...names: readonly string[]): void => {
  writeFileSync(join(context.mock, "scenarios"), `${names.join("\n")}\n`);
};

/** ドライバを動かし、終わるまで待つ。`cwd` は起動するディレクトリ（既定は main checkout のルート）。 */
export const runDriver = (
  context: Context,
  extra: readonly string[] = [],
  cwd: string = context.repository,
): { readonly status: number | null; readonly log: string } => {
  const result = spawnSync("node", driverArgs(context, extra), {
    cwd,
    encoding: "utf8",
    env: driverEnv(context),
    // spawnSync の間は vitest の時間切れが働かないので、止まらないドライバはここで止める。
    timeout: DRIVER_TIMEOUT_MS,
  });
  return { status: result.status, log: result.stdout + result.stderr };
};

/** テストの既定の引数を付けずにドライバを動かす（引数の誤りを確かめる）。 */
export const runDriverWith = (
  context: Context,
  args: readonly string[],
): { readonly status: number | null; readonly stderr: string } => {
  const result = spawnSync("node", [DRIVER, ...args], {
    cwd: context.repository,
    encoding: "utf8",
    env: driverEnv(context),
    timeout: DRIVER_TIMEOUT_MS,
  });
  return { status: result.status, stderr: result.stderr };
};

export interface Running {
  readonly child: ChildProcess;
  /** ここまでの標準出力。 */
  readonly output: () => string;
  readonly exited: Promise<number | null>;
}

/** ドライバを起動し、終わるのを待たずに返す。 */
export const startDriver = (context: Context, extra: readonly string[] = []): Running => {
  const child = spawn("node", driverArgs(context, extra), {
    cwd: context.repository,
    env: driverEnv(context),
  });
  started.push(child);
  let output = "";
  child.stdout.on("data", (chunk: unknown) => {
    output += String(chunk);
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => {
      resolve(code);
    });
  });
  return { child, output: () => output, exited };
};

export const readIf = (path: string): string =>
  existsSync(path) ? readFileSync(path, "utf8") : "";

/** 模擬の claude が記録した、起動の引数と環境変数と、受け取った前の回の最終報告。 */
export const calls = (context: Context): string => readIf(join(context.mock, "calls.log"));

export const rounds = (context: Context): readonly string[] => {
  const directory = join(context.logDir, "rounds");
  return existsSync(directory) ? readdirSync(directory).toSorted() : [];
};

/** index 番目の回の名前。無ければ例外にする。 */
export const round = (context: Context, index: number): string => {
  const name = rounds(context)[index];
  if (name === undefined) {
    throw new Error(`${String(index)} 番目の回が無い`);
  }
  return name;
};

/** 模擬の claude が hang のシナリオで書いた、自分のプロセスの識別子。書き終わるまで待つ。 */
export const hangPid = async (context: Context): Promise<number> => {
  const path = join(context.mock, "hang.pid");
  for (;;) {
    const pid = Number(readIf(path));
    if (Number.isSafeInteger(pid) && pid > 0) {
      return pid;
    }
    await sleep(100);
  }
};

/**
 * main checkout の .claude/worktrees の下に、回の前から在る worktree を作って lock する（ほかのセッションのものや、
 * 前のドライバが中断した回のもの）。
 */
export const lockedWorktree = (context: Context, name: string, reason: string): string => {
  const path = join(context.repository, ".claude/worktrees", name);
  gitIn(context.repository, ["worktree", "add", "--quiet", "-b", `worktree-${name}`, path, "HEAD"]);
  gitIn(context.repository, ["worktree", "lock", "--reason", reason, path]);
  return path;
};

/** lock されている worktree のパス。 */
export const lockedPaths = (context: Context): readonly string[] =>
  worktreeList(context)
    .split("\n\n")
    .filter((entry) => entry.includes("\nlocked"))
    .map((entry) => entry.split("\n")[0]?.slice("worktree ".length) ?? "");

export const worktreeList = (context: Context): string =>
  gitIn(context.repository, ["worktree", "list", "--porcelain"]);
