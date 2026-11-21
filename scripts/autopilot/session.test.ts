import { expect, test } from "vitest";

import { commandEnv, previousReport, roundName, sessionArgs, sessionEnv } from "./session.ts";

test("回の名前は supervise- と UTC の時刻で、使われていれば番号を付ける", () => {
  const now = Date.UTC(2026, 10, 21, 9, 5, 7, 999);
  expect(roundName(now, () => false)).toBe("supervise-20261121-090507");
  const taken = new Set(["supervise-20261121-090507", "supervise-20261121-090507-2"]);
  expect(roundName(now, (name) => taken.has(name))).toBe("supervise-20261121-090507-3");
});

test("監督セッションを auto mode・stream-json で起動し、方向性を /supervise に渡す", () => {
  expect(sessionArgs("supervise-1", "基盤の試運転")).toStrictEqual([
    "-p",
    "--worktree",
    "supervise-1",
    "--permission-mode",
    "auto",
    "--permission-prompts",
    "none",
    "--output-format",
    "stream-json",
    "--verbose",
    "/supervise 基盤の試運転",
  ]);
  expect(sessionArgs("supervise-1").at(-1)).toBe("/supervise");
});

test("起動元のセッションを指す変数だけを外し、利用者の設定は渡し、監督セッションの変数を設定する", () => {
  const env = sessionEnv(
    {
      PATH: "/bin",
      HOME: "/home",
      UNSET: undefined,
      CLAUDECODE: "1",
      CLAUDE_PID: "1",
      CLAUDE_EFFORT: "high",
      CLAUDE_PROJECT_DIR: "/x",
      CLAUDE_ENV_FILE: "/x",
      CLAUDE_PLUGIN_DATA: "/x",
      CLAUDE_CODE_BRIDGE_SESSION_ID: "s",
      CLAUDE_CODE_CHILD_NOTES_DIR: "/x",
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_EXECPATH: "/x",
      CLAUDE_CODE_MESSAGING_SOCKET: "/x",
      CLAUDE_CODE_MESSAGING_TOKEN: "t",
      CLAUDE_CODE_SESSION_ATTENDED: "1",
      CLAUDE_CODE_SESSION_ID: "s",
      CLAUDE_CODE_SSE_PORT: "1",
      CLAUDE_CODE_RETRY_WATCHDOG: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "token",
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CONFIG_DIR: "/config",
      INCREMENTAL_GAME_PREVIOUS_REPORT: "/old",
      TMPDIR: "/old-tmp",
    },
    { claudeTemp: "/round/cctmp", temp: "/round/tmp", previousReport: "/round/previous.md" },
  );
  expect(env).toStrictEqual({
    PATH: "/bin",
    HOME: "/home",
    CLAUDE_CODE_OAUTH_TOKEN: "token",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CONFIG_DIR: "/config",
    INCREMENTAL_GAME_SUPERVISOR: "1",
    INCREMENTAL_GAME_PREVIOUS_REPORT: "/round/previous.md",
    BASH_DEFAULT_TIMEOUT_MS: "600000",
    BASH_MAX_TIMEOUT_MS: "1800000",
    CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "7200000",
    CLAUDE_CODE_TMPDIR: "/round/cctmp",
    TMPDIR: "/round/tmp",
  });
});

test("ドライバのコマンドには起動元のセッションを指す変数を渡さず、Axon の記録者をドライバにする", () => {
  expect(
    commandEnv({
      PATH: "/bin",
      UNSET: undefined,
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "s",
      CLAUDE_CODE_OAUTH_TOKEN: "token",
      AXON_ACTOR: "someone",
    }),
  ).toStrictEqual({
    PATH: "/bin",
    CLAUDE_CODE_OAUTH_TOKEN: "token",
    AXON_ACTOR: "incremental-game-driver",
  });
});

test("前の回の最終報告が無ければ、その変数を設定しない", () => {
  const env = sessionEnv(
    { INCREMENTAL_GAME_PREVIOUS_REPORT: "/old" },
    { claudeTemp: "/c", temp: "/t", previousReport: undefined },
  );
  expect(Object.keys(env)).not.toContain("INCREMENTAL_GAME_PREVIOUS_REPORT");
});

const RECORD = {
  name: "supervise-1",
  ended: "終了コード 0",
  outcome: "ready: main を x へ進めた",
  failedCompletions: ["g-1", "g-2"],
  agentWorktrees: [
    { path: "/repo/.claude/worktrees/agent-a1", branch: "worktree-agent-a1" },
    { path: "/repo/.claude/worktrees/agent-a2", branch: undefined },
  ],
};

test("前の回の最終報告の後に、ドライバが見た事実を足す", () => {
  expect(previousReport("# 最終報告\n\n本文\n\n", RECORD)).toBe(`# 最終報告

本文

## ドライバの記録

監督セッションを起動したドライバが、回の後に書き足した。

- 回の名前: supervise-1（セッション用ブランチ \`worktree-supervise-1\`）
- セッションの終わり方: 終了コード 0
- 取り込み: ready: main を x へ進めた
- 実行できなかった完了（次の回が拾い直す）: \`g-1\`、\`g-2\`
- この回の worker の worktree とブランチ（lock の持ち主がこの回のセッションのプロセスだったもの。lock を外した結果はドライバのログにある）: \`/repo/.claude/worktrees/agent-a1\`（\`worktree-agent-a1\`）、\`/repo/.claude/worktrees/agent-a2\`（ブランチなし）
`);
});

test("最終報告が無い回と、挙げるものが無い項目は、そうと書く", () => {
  const text = previousReport(undefined, { ...RECORD, failedCompletions: [], agentWorktrees: [] });
  expect(
    text.startsWith(
      "（この回の監督セッションは最終報告を書かずに終わった。）\n\n## ドライバの記録",
    ),
  ).toBe(true);
  expect(text).toContain("- 実行できなかった完了（次の回が拾い直す）: なし\n");
  expect(text).toContain("lock を外した結果はドライバのログにある）: なし\n");
});
