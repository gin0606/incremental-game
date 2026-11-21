import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { gitIn } from "../../protect/cli/fixture.ts";
import type { Context } from "./fixture.ts";
import {
  calls,
  createContext,
  hangPid,
  lockedPaths,
  lockedWorktree,
  readIf,
  removeContext,
  round,
  rounds,
  runDriver,
  scenarios,
  startDriver,
  worktreeList,
} from "./fixture.ts";

// 無人運転のドライバが回を回し、取り込み、失敗と中断を扱って止まることを、模擬の claude・axon で確かめる。

// 1 件でドライバを数回の回まで動かす。機械が混み合っても結果と関係なく落ちないよう、時間切れを広げる。
vi.setConfig({ testTimeout: 120_000 });

let context: Context = { repository: "", mock: "", logDir: "", stopFile: "" };

beforeEach(() => {
  context = createContext();
});

afterEach(() => {
  removeContext(context);
});

test("監督セッションを取り決めの引数と環境変数で起動し、起動元のセッションの変数を渡さない", () => {
  scenarios(context, "ready-stop");
  expect(runDriver(context).status).toBe(0);
  const name = round(context, 0);
  expect(name).toMatch(/^supervise-\d{8}-\d{6}$/v);
  const called = calls(context);
  expect(called).toContain(
    `args=-p --worktree ${name} --permission-mode auto --permission-prompts none --output-format stream-json --verbose /supervise 基盤の試運転`,
  );
  for (const line of [
    "INCREMENTAL_GAME_SUPERVISOR=1",
    "CLAUDECODE=unset",
    "CLAUDE_CODE_RETRY_WATCHDOG=unset",
    "CLAUDE_CODE_OAUTH_TOKEN=token",
    "BASH_DEFAULT_TIMEOUT_MS=600000",
    "BASH_MAX_TIMEOUT_MS=1800000",
    "CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=7200000",
    `CLAUDE_CODE_TMPDIR=${join(context.logDir, "rounds", name, "cctmp")}`,
    `TMPDIR=${join(context.logDir, "rounds", name, "tmp")}`,
    "INCREMENTAL_GAME_PREVIOUS_REPORT=unset",
  ]) {
    expect(called).toContain(`\n${line}\n`);
  }
});

test("取り込める状態の回の完了を実行して main に取り込み、停止用ファイルが置かれたら回の後に止まる", () => {
  scenarios(context, "ready-stop", "nothing-stop");
  const mainBefore = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { status, log } = runDriver(context);
  expect(status).toBe(0);
  expect(log).toContain("ドライバを止める: 停止用ファイルがある");
  expect(rounds(context)).toHaveLength(1);
  const name = round(context, 0);
  const worktree = join(context.repository, ".claude/worktrees", name);
  // 完了を順に実行し、失敗しても残りを続ける。
  expect(readIf(join(context.mock, "axon.log"))).toBe(
    [
      `cwd=${worktree} args=complete --no-color --reason=--reason with a leading hyphen task-1`,
      `cwd=${worktree} args=complete --no-color --reason=r fail-1`,
      `cwd=${worktree} args=complete --no-color --reason=all done group-1`,
      `cwd=${worktree} args=storage check --no-color ${worktree}`,
      "",
    ].join("\n"),
  );
  expect(log).toContain("axon complete fail-1: 終了コード 1 failed fail-1");
  // 記録を commit し、main をその commit へ fast-forward する。
  const main = gitIn(context.repository, ["rev-parse", "main"]).trim();
  expect(gitIn(context.repository, ["rev-parse", "main~2"]).trim()).toBe(mainBefore);
  expect(
    gitIn(context.repository, ["diff-tree", "--no-commit-id", "--name-only", "-r", main]).trim(),
  ).toBe(".axon/group-1\n.axon/task-1");
  // 完了の記録者は、起動元のセッションではなくドライバにする。
  expect(readFileSync(join(context.repository, ".axon/task-1"), "utf8")).toContain(
    "actor=incremental-game-driver claudecode=unset",
  );
  expect(gitIn(context.repository, ["log", "-1", "--format=%s", main]).trim()).toBe(
    "chore: Record the work a supervisor round completed",
  );
  expect(readFileSync(join(context.repository, `work-${name}.txt`), "utf8")).toBe(`${name}\n`);
  expect(log).toContain('permission_denials（1 件）: [{"tool_name":"Bash"}]');
  expect(log).toContain('subagent_stats: {"spawned":1}');
});

test("取り込んだ回の worktree・ブランチ・一時ディレクトリを消し、結果と報告をログの置き場に残す", () => {
  scenarios(context, "ready-stop");
  const { log } = runDriver(context);
  const name = round(context, 0);
  expect(worktreeList(context)).not.toContain(name);
  expect(gitIn(context.repository, ["branch", "--list", "worktree-*"])).toBe("");
  const roundDir = join(context.logDir, "rounds", name);
  expect(readdirSync(roundDir).toSorted()).toStrictEqual([
    "previous-report.md",
    "report.md",
    "result.json",
    "stderr.log",
    "stream.jsonl",
  ]);
  expect(readFileSync(join(roundDir, "report.md"), "utf8")).toContain("# 報告");
  expect(readFileSync(join(roundDir, "previous-report.md"), "utf8")).toContain(
    "- 実行できなかった完了（次の回が拾い直す）: `fail-1`\n",
  );
  expect(readFileSync(join(context.logDir, "driver.pid"), "utf8")).toMatch(/^\d+\n$/v);
  expect(log).toContain("main に取り込まれていないセッション用・worker のブランチ:\nなし");
  expect(log).toContain("main checkout 以外の worktree:\nなし");
});

test("決めた回数だけ続けて失敗したら止まり、取り込まれていないブランチと worktree を挙げる", () => {
  scenarios(context, "no-report", "move-main", "ready-stop");
  const { status, log } = runDriver(context, ["--max-failures", "2"]);
  expect(status).toBe(1);
  expect(log).toContain("ドライバを止める: 取り込めた回を挟まずに 2 回失敗した");
  expect(rounds(context)).toHaveLength(2);
  const [first, second] = [round(context, 0), round(context, 1)];
  expect(log).toContain(`回 ${first}: 失敗。取り込まなかった: result.json が書かれていない`);
  expect(log).toContain("取り込まない: main が回の開始時から動いた");
  expect(log).toContain(`回 ${second}: 失敗。取り込めなかった`);
  // 2 回目は前の回の最終報告として、ドライバの記録を受け取る。
  expect(calls(context)).toContain("（この回の監督セッションは最終報告を書かずに終わった。）");
  // 失敗した回の worktree とブランチは次の回の監督役に任せて残し、lock だけを外す。一時ディレクトリは残さない。
  expect(worktreeList(context)).not.toContain("locked");
  expect(log).toMatch(new RegExp(`ブランチ:\nworktree-${second} [0-9a-f]{40}\n`, "v"));
  for (const name of [first, second]) {
    expect(log).toContain(
      `${join(context.repository, ".claude/worktrees", name)} worktree-${name}`,
    );
    expect(existsSync(join(context.logDir, "rounds", name, "tmp"))).toBe(false);
    expect(existsSync(join(context.logDir, "rounds", name, "cctmp"))).toBe(false);
  }
});

test("強制終了された回の lock を外し、その回の worker の worktree を次の回に伝えて再開する", async () => {
  scenarios(context, "hang", "nothing-stop");
  const running = startDriver(context);
  process.kill(await hangPid(context), "SIGKILL");
  await expect(running.exited).resolves.toBe(0);
  expect(rounds(context)).toHaveLength(2);
  const [killed, resumed] = [round(context, 0), round(context, 1)];
  const log = running.output();
  expect(log).toContain(
    `回 ${killed}: 失敗。取り込まなかった: セッションがシグナル SIGKILL で終わった`,
  );
  const called = calls(context);
  expect(called).toContain(`round=${resumed} scenario=nothing-stop`);
  expect(called).toContain(
    `INCREMENTAL_GAME_PREVIOUS_REPORT=${join(context.logDir, "rounds", killed, "previous-report.md")}\n`,
  );
  expect(called).toContain("- セッションの終わり方: シグナル SIGKILL\n");
  expect(called).toContain(
    `\`${join(context.repository, ".claude/worktrees/agent-k1")}\`（\`worktree-agent-k1\`）`,
  );
  expect(worktreeList(context)).not.toContain("locked");
  expect(log).toContain(`回 ${resumed}: 成功。取り込むものが無かった（nothing）`);
});

test("セッションの間に終わった worker の worktree も、その回の worker として次の回に伝える", () => {
  scenarios(context, "worker-finished");
  expect(runDriver(context).status).toBe(0);
  expect(
    readFileSync(join(context.logDir, "rounds", round(context, 0), "previous-report.md"), "utf8"),
  ).toContain(
    `\`${join(context.repository, ".claude/worktrees/agent-w1")}\`（\`worktree-agent-w1\`）`,
  );
});

test("回の前から在る worktree は、lock の識別子がこの回のセッションと同じでも、lock を外さず、この回の worker として伝えない", () => {
  const stale = lockedWorktree(
    context,
    "agent-stale",
    "claude agent stale (pid 99999993 start Thu Nov 19 09:00:00 2026)",
  );
  scenarios(context, "stale-pid");
  expect(runDriver(context).status).toBe(0);
  // 回の後も、セッションのプロセスと同じ識別子で lock されたまま残る。
  expect(lockedPaths(context)).toStrictEqual([stale]);
  const sessionPid = /scenario=stale-pid pid=(?<pid>\d+)\n/v.exec(calls(context))?.groups;
  expect(sessionPid).toBeDefined();
  expect(
    /locked claude agent stale \(pid (?<pid>\d+) start Thu Nov 19 09:00:00 2026\)\n/v.exec(
      worktreeList(context),
    )?.groups,
  ).toStrictEqual(sessionPid);
  const handover = readFileSync(
    join(context.logDir, "rounds", round(context, 0), "previous-report.md"),
    "utf8",
  );
  for (const worker of ["agent-n1", "agent-n2"]) {
    expect(handover).toContain(
      `\`${join(context.repository, ".claude/worktrees", worker)}\`（\`worktree-${worker}\`）`,
    );
  }
  expect(handover).not.toContain("agent-stale");
});

test("lock の理由を読めなくても、回のセッション用の worktree と worker の worktree の lock は外す", async () => {
  writeFileSync(join(context.mock, "odd-lock"), "");
  scenarios(context, "hang", "nothing-stop");
  const running = startDriver(context);
  process.kill(await hangPid(context), "SIGKILL");
  await expect(running.exited).resolves.toBe(0);
  expect(existsSync(join(context.repository, ".claude/worktrees", round(context, 0)))).toBe(true);
  expect(lockedPaths(context)).toStrictEqual([]);
  expect(running.output()).toContain("lock の理由からプロセスの識別子を読めない");
});

test("回の後に動いている監督セッションがあれば、次の回を始めない", () => {
  scenarios(context, "stray-session", "nothing-stop");
  const { status, log } = runDriver(context);
  expect(status).toBe(1);
  expect(rounds(context)).toHaveLength(1);
  expect(log).toContain("ドライバを止める: 動いている監督セッションがある");
});

test("時間の上限に達した回を止め、利用上限に達したら次の回を始めない", () => {
  scenarios(context, "hang", "limit", "ready-stop");
  const { status, log } = runDriver(context, ["--round-timeout", "3s"]);
  expect(status).toBe(1);
  expect(rounds(context)).toHaveLength(2);
  expect(log).toContain("失敗。取り込まなかった: 1 回の時間の上限に達したので止めた");
  expect(log).toContain(
    'ドライバを止める: 利用上限に達した（自動では再開しない）: assistant の error が "rate_limit"、結果の api_error_status が 429',
  );
});

test("前のドライバが中断した回の lock を外し、ほかのセッションの worktree には触れない", () => {
  const old = lockedWorktree(
    context,
    "supervise-old",
    "claude session supervise-old (pid 99999991 start Fri Nov 20 16:02:54 2026)",
  );
  const oldWorker = lockedWorktree(
    context,
    "agent-o1",
    "claude agent o1 (pid 99999991 start Fri Nov 20 16:03:00 2026)",
  );
  const other = lockedWorktree(context, "agent-other", "claude agent other (pid 99999992)");
  const manual = lockedWorktree(context, "agent-manual", "manual");
  scenarios(context, "nothing-stop");
  const { status } = runDriver(context);
  expect(status).toBe(0);
  // 最初の回を始める前に外す（回の監督役が前の回の残りを消せるように）。
  expect(calls(context)).toContain("locked-at-start=2\n");
  expect(lockedPaths(context).toSorted()).toStrictEqual([manual, other]);
  expect([old, oldWorker].every((path) => existsSync(path))).toBe(true);
  // 最終報告が名前を挙げたほかのセッションの worktree を、この回の worker として伝えない。
  expect(
    readFileSync(join(context.logDir, "rounds", round(context, 0), "previous-report.md"), "utf8"),
  ).toContain("lock を外した結果はドライバのログにある）: なし\n");
});

test("シグナルを受け取ったら、実行中のセッションを止めて次の回を始めない", async () => {
  scenarios(context, "hang", "ready-stop");
  const running = startDriver(context);
  const pid = await hangPid(context);
  running.child.kill("SIGTERM");
  await expect(running.exited).resolves.toBe(1);
  expect(rounds(context)).toHaveLength(1);
  const log = running.output();
  expect(log).toContain("シグナル SIGTERM を受け取った");
  expect(log).toContain("セッションがシグナル SIGTERM で終わった");
  expect(log).toContain("ドライバを止める: シグナル SIGTERM を受け取った");
  expect(() => process.kill(pid, 0)).toThrow("ESRCH");
});
