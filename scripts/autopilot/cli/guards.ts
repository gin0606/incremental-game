import { linkSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { lastSegment, lockOwner, parseWorktreeList } from "../worktrees.ts";
import { worktrees } from "./locks.ts";
import { gitOrThrow, isAlive, run } from "./run.ts";

// 起動と各回の前の確認。ドライバは main checkout のルートで動き、ドライバと監督セッションは main checkout ごとに
// 1 つだけ動かす。ログの置き場が違うドライバが並ぶと、互いの回を前の回の残りとして扱い、取り込みの途中の worktree
// を消しうる。

const LOCK_NAME = "incremental-game-driver.pid";

const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

/** 中身を書き終えたファイルを、まだ無ければ path に置く。置けたか。 */
const place = (path: string, content: string): boolean => {
  const temp = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temp, content);
  try {
    linkSync(temp, path);
    return true;
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) {
      return false;
    }
    throw error;
  } finally {
    rmSync(temp, { force: true });
  }
};

const readIfExists = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
};

/** 持ち主が終わった lock ファイルを置き換える。置き換えは、`.takeover` のファイルを排他的に作れた 1 つだけが行う。 */
const takeOver = (path: string, own: string): string | undefined => {
  const takeover = `${path}.takeover`;
  if (!place(takeover, own)) {
    return `別のドライバが lock ファイルを取り直している（${takeover}。動いているドライバが無ければ消してから起動する）`;
  }
  try {
    const text = readIfExists(path);
    if (text !== undefined) {
      if (!/^[1-9]\d*\n$/v.test(text)) {
        return `lock ファイル ${path} の中身が読めない（動いているドライバが無ければ消してから起動する）`;
      }
      const holder = Number(text);
      if (isDriver(holder)) {
        return `この main checkout で別のドライバ（pid ${String(holder)}）が動いている（${path}）`;
      }
      rmSync(path, { force: true });
    }
    return place(path, own) ? undefined : `別のドライバが同時に lock ファイル ${path} を作った`;
  } finally {
    rmSync(takeover, { force: true });
  }
};

/**
 * Git の共通ディレクトリに、このプロセスの識別子を書いたファイルを排他的に置く。動いているドライバが持っていれば
 * 理由を返し、持ち主が終わっていれば置き換える。ファイルはこのプロセスの終了時に消す。
 */
export const acquireDriverLock = (repository: string): string | undefined => {
  const path = join(
    resolve(repository, gitOrThrow(repository, ["rev-parse", "--git-common-dir"]).trim()),
    LOCK_NAME,
  );
  const own = `${String(process.pid)}\n`;
  const problem = place(path, own) ? undefined : takeOver(path, own);
  if (problem === undefined) {
    process.on("exit", () => {
      if (readIfExists(path) === own) {
        rmSync(path, { force: true });
      }
    });
  }
  return problem;
};

/**
 * pid のプロセスがドライバか（lock ファイルの識別子が別のプロセスに再利用されていないか）。動いているプロセスの
 * コマンド行を読めなければ、ドライバとみなす（2 つ目のドライバを起動しない側に倒す）。
 */
const isDriver = (pid: number): boolean => {
  if (pid === process.pid || !isAlive(pid)) {
    return false;
  }
  const command = run("ps", ["-o", "command=", "-p", String(pid)], process.cwd());
  return command.status !== 0 || command.stdout.includes("scripts/autopilot/cli/main.ts");
};

/**
 * lock の持ち主が動いている監督セッションの worktree があれば理由を返す。ドライバが後始末をせずに終わると、監督
 * セッションは別のプロセスグループで動き続けるため、並べて回を始めない。
 */
export const liveSession = (repository: string): string | undefined => {
  const running = worktrees(repository).filter((entry) => {
    const owner = entry.lock === undefined ? undefined : lockOwner(entry.lock);
    return (
      lastSegment(entry.path).startsWith("supervise-") && owner !== undefined && isAlive(owner)
    );
  });
  return running.length === 0
    ? undefined
    : `動いている監督セッションがある: ${running.map((entry) => `${entry.path}（${entry.lock ?? ""}）`).join("、")}`;
};

/** 起動したディレクトリが main checkout のルート（linked worktree でない）なら、そのパスを返す。 */
export const mainCheckout = (): string => {
  const root = realpathSync(gitOrThrow(process.cwd(), ["rev-parse", "--show-toplevel"]).trim());
  const [first] = parseWorktreeList(gitOrThrow(root, ["worktree", "list", "--porcelain", "-z"]));
  if (
    first === undefined ||
    realpathSync(first.path) !== root ||
    realpathSync(process.cwd()) !== root
  ) {
    throw new Error(
      "main checkout のルートで起動する（linked worktree やサブディレクトリでは起動しない）",
    );
  }
  return root;
};
