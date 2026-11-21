import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { gitIn } from "../../protect/cli/fixture.ts";
import type { Context } from "./fixture.ts";
import {
  calls,
  createContext,
  lockedWorktree,
  removeContext,
  rounds,
  runDriver,
  runDriverWith,
  scenarios,
  startDriver,
} from "./fixture.ts";

// 無人運転のドライバが、最初の回を始める前の待機と確認で止まることを、模擬の claude・axon で確かめる。

vi.setConfig({ testTimeout: 120_000 });

let context: Context = { repository: "", mock: "", logDir: "", stopFile: "" };

beforeEach(() => {
  context = createContext();
});

afterEach(() => {
  removeContext(context);
});

test("待機ファイルが消えるまで最初の回を始めない", async () => {
  scenarios(context, "nothing-stop");
  const waitFile = join(context.mock, "wait");
  writeFileSync(waitFile, "");
  const running = startDriver(context, ["--wait-file", waitFile, "--poll", "1s"]);
  while (!running.output().includes("が消えるまで最初の回を始めない")) {
    await sleep(100);
  }
  await sleep(3000);
  expect(calls(context)).toBe("");
  expect(readFileSync(join(context.logDir, "driver.pid"), "utf8")).toBe(
    `${String(running.child.pid)}\n`,
  );
  rmSync(waitFile);
  await expect(running.exited).resolves.toBe(0);
  expect(running.output()).toContain("待機ファイルが消えた");
  expect(calls(context)).toContain("scenario=nothing-stop");
});

test("停止用ファイルを指定しなければ、ログの置き場の stop を使う", () => {
  const local = { ...context, stopFile: join(context.logDir, "stop") };
  scenarios(local, "nothing", "nothing-stop");
  const { status, log } = runDriver(local);
  expect(status).toBe(0);
  expect(rounds(local)).toHaveLength(2);
  expect(log).toContain(`停止用ファイル ${join(context.logDir, "stop")}`);
  expect(log).toContain("ドライバを止める: 停止用ファイルがある");
});

test("前の回の最終報告を相対パスで渡すと、最初の回に絶対パスで渡す", () => {
  scenarios(context, "nothing-stop");
  const report = join(context.mock, "previous.md");
  writeFileSync(report, "# 前の回\n");
  const relativePath = relative(context.repository, report);
  const { status } = runDriver(context, ["--previous-report", relativePath]);
  expect(status).toBe(0);
  const called = calls(context);
  expect(called).toContain(
    `INCREMENTAL_GAME_PREVIOUS_REPORT=${resolve(context.repository, relativePath)}\n`,
  );
  expect(called).toContain("previous-report-begin\n# 前の回\nprevious-report-end");
});

test("待っている間に停止用ファイルが置かれたら、回を始めずに止まる", async () => {
  scenarios(context, "nothing-stop");
  const waitFile = join(context.mock, "wait");
  writeFileSync(waitFile, "");
  const running = startDriver(context, ["--wait-file", waitFile, "--poll", "1s"]);
  while (!running.output().includes("が消えるまで最初の回を始めない")) {
    await sleep(100);
  }
  writeFileSync(context.stopFile, "");
  await expect(running.exited).resolves.toBe(0);
  expect(running.output()).toContain("ドライバを止める: 停止用ファイルがある");
  expect(calls(context)).toBe("");
});

test("ディスクの空きが閾値を下回っていれば回を始めない", () => {
  scenarios(context, "ready-stop");
  const { status, log } = runDriver(context, ["--min-free-gb", "1000000000"]);
  expect(status).toBe(1);
  expect(log).toContain("ドライバを止める: ディスクの空き");
  expect(calls(context)).toBe("");
});

test("main checkout の作業ツリーがきれいでなければ回を始めない", () => {
  scenarios(context, "ready-stop");
  writeFileSync(join(context.repository, "dirty.txt"), "x\n");
  const { status, log } = runDriver(context);
  expect(status).toBe(1);
  expect(log).toContain("ドライバを止める: main checkout の作業ツリーがきれいでない");
  expect(calls(context)).toBe("");
});

test("誤った引数では起動しない", () => {
  const { status, stderr } = runDriverWith(context, ["--log-dir", context.logDir]);
  expect(status).toBe(2);
  expect(stderr).toContain("--until と --log-dir は必ず指定する");
  expect(existsSync(context.logDir)).toBe(false);
});

test("前の実行の停止用ファイルが残っていれば起動しない", () => {
  scenarios(context, "nothing-stop");
  writeFileSync(context.stopFile, "");
  const { status, log } = runDriver(context);
  expect(status).toBe(1);
  expect(log).toContain(`停止用ファイル ${context.stopFile} が起動時からある`);
  expect(calls(context)).toBe("");
});

const DRIVER_LOCK = (): string => join(context.repository, ".git/incremental-game-driver.pid");

test("同じ main checkout で別のドライバが動いていれば、ログの置き場が違っても起動しない", async () => {
  scenarios(context, "nothing-stop");
  const waitFile = join(context.mock, "wait");
  writeFileSync(waitFile, "");
  const first = startDriver(context, ["--wait-file", waitFile, "--poll", "1s"]);
  while (!first.output().includes("が消えるまで最初の回を始めない")) {
    await sleep(100);
  }
  for (const logDir of [context.logDir, join(context.mock, "other-logs")]) {
    const { status, log } = runDriver({ ...context, logDir });
    expect(status).toBe(1);
    expect(log).toContain(
      `この main checkout で別のドライバ（pid ${String(first.child.pid)}）が動いている`,
    );
  }
  first.child.kill("SIGTERM");
  await expect(first.exited).resolves.toBe(1);
  expect(calls(context)).toBe("");
  // 止まったドライバは lock ファイルを消す。
  expect(existsSync(DRIVER_LOCK())).toBe(false);
});

test("lock ファイルの中身が読めなければ、置き換えずに起動しない", () => {
  scenarios(context, "nothing-stop");
  writeFileSync(DRIVER_LOCK(), "");
  const { status, log } = runDriver(context);
  expect(status).toBe(1);
  expect(log).toContain("の中身が読めない");
  expect(readFileSync(DRIVER_LOCK(), "utf8")).toBe("");
  expect(calls(context)).toBe("");
});

test("lock ファイルの識別子が終わったプロセスか別のプロセスのものなら起動する", () => {
  for (const pid of [99_999_991, process.pid]) {
    scenarios(context, "nothing-stop");
    rmSync(context.stopFile, { force: true });
    writeFileSync(DRIVER_LOCK(), `${String(pid)}\n`);
    expect(runDriver(context).status).toBe(0);
  }
  expect(calls(context).match(/scenario=nothing-stop/gv)).toHaveLength(2);
  expect(existsSync(DRIVER_LOCK())).toBe(false);
});

test("動いている監督セッションの worktree があれば回を始めない", () => {
  scenarios(context, "nothing-stop");
  lockedWorktree(
    context,
    "supervise-live",
    `claude session supervise-live (pid ${String(process.pid)} start x)`,
  );
  const { status, log } = runDriver(context);
  expect(status).toBe(1);
  expect(log).toContain("動いている監督セッションがある");
  expect(calls(context)).toBe("");
});

test("main checkout が main 以外をチェックアウトしていれば回を始めない", () => {
  scenarios(context, "nothing-stop");
  gitIn(context.repository, ["switch", "--quiet", "-c", "other"]);
  const { status, log } = runDriver(context);
  expect(status).toBe(1);
  expect(log).toContain("ドライバを止める: main checkout のブランチが main でない（other）");
  expect(calls(context)).toBe("");
});

test("main checkout のルート以外から起動しても回を始めない", () => {
  scenarios(context, "nothing-stop");
  const linked = join(context.mock, "linked");
  gitIn(context.repository, ["worktree", "add", "--quiet", "--detach", linked]);
  const subdirectory = join(context.repository, "sub");
  mkdirSync(subdirectory);
  for (const cwd of [linked, subdirectory]) {
    const { status, log } = runDriver(context, [], cwd);
    expect(status).toBe(1);
    expect(log).toContain("main checkout のルートで起動する");
  }
  expect(calls(context)).toBe("");
});
