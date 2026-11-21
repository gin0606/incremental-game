import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { denial } from "../hook-input.ts";
import { createRepository, gitIn, isolatedEnv, repositoryRoot, writeFiles } from "./fixture.ts";

// 1 件でシェルと Node.js と git を起動する。機械が混み合っても結果と関係なく落ちないよう、時間切れを広げる。
vi.setConfig({ testTimeout: 120_000 });

// .claude/settings.json に書いた PreToolUse の hook のコマンド。最初のテストで設定と同じことを確かめ、ほかのテストは
// これをそのまま動かす。
const command = `[ -z "\${INCREMENTAL_GAME_SUPERVISOR:-}" ] || node "$CLAUDE_PROJECT_DIR/scripts/protect/cli/hook.ts" || exit 2`;

const SUPERVISOR = { INCREMENTAL_GAME_SUPERVISOR: "1" } as const;

let repository = "";
let worktree = "";
let outside = "";

beforeAll(() => {
  repository = realpathSync(
    createRepository({
      "lefthook.yml": "pre-commit: {}\n",
      "src/core/game.ts": "export {};\n",
      "src/sim/bot.ts": "export {};\n",
    }),
  );
  worktree = `${repository}-worktree`;
  gitIn(repository, ["worktree", "add", "--quiet", worktree]);
  symlinkSync("../lefthook.yml", join(repository, "src/link.yml"));
  outside = mkdtempSync(join(tmpdir(), "protect-outside-"));
  // 中身の読めない .git ファイル。git は作業ツリーの外とは言わずに失敗する。
  writeFiles(outside, { "broken/.git": "xyz\n" });
});

afterAll(() => {
  for (const directory of [repository, worktree, outside]) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const runHook = (
  input: unknown,
  env: Readonly<Record<string, string>>,
): { status: number | null; stdout: string; stderr: string } => {
  // hook のカレントディレクトリは worker の worktree になる。一覧を CLAUDE_PROJECT_DIR から読み、相対パスを入力の
  // cwd から解くことを確かめるため、どちらとも違うディレクトリで起動する。
  const result = spawnSync("sh", ["-c", command], {
    cwd: outside,
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: isolatedEnv({ CLAUDE_PROJECT_DIR: repositoryRoot, ...env }),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const edit = (filePath: string, agentType?: string, cwd?: string): unknown => ({
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: filePath, old_string: "a", new_string: "b" },
  ...(cwd === undefined ? {} : { cwd }),
  ...(agentType === undefined ? {} : { agent_type: agentType, agent_id: "1" }),
});

const denied = (
  reasons: readonly string[],
): { status: number; stdout: string; stderr: string } => ({
  status: 0,
  stdout: `${denial(reasons)}\n`,
  stderr: "",
});

test("hook は Edit と Write に掛ける", () => {
  const settings: unknown = JSON.parse(
    readFileSync(join(repositoryRoot, ".claude/settings.json"), "utf8"),
  );
  expect(settings).toHaveProperty("hooks", {
    PreToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command }] }],
  });
});

test("監督セッションの環境変数が無ければ、何も拒否しない", () => {
  expect(runHook(edit(join(repository, "lefthook.yml"), "worker"), {})).toStrictEqual({
    status: 0,
    stdout: "",
    stderr: "",
  });
  expect(runHook("読めない入力", {})).toStrictEqual({ status: 0, stdout: "", stderr: "" });
});

test.each(["worker", "general-purpose", "Explore"])(
  "監督セッションでは、サブエージェント %s の保護範囲のパスへの書き込みを拒否する",
  (agentType) => {
    expect(runHook(edit(join(repository, "lefthook.yml"), agentType), SUPERVISOR)).toStrictEqual(
      denied([
        "判定の基盤: lefthook.yml（foundation-paths.txt の一覧）",
        "検査の設定: lefthook.yml（lefthook の設定）",
      ]),
    );
  },
);

test.each([
  { name: "メインエージェント", agentType: undefined },
  { name: "protected-worker", agentType: "protected-worker" },
] as const)("監督セッションでも、$name の書き込みは拒否しない", ({ agentType }) => {
  expect(runHook(edit(join(repository, "lefthook.yml"), agentType), SUPERVISOR)).toStrictEqual({
    status: 0,
    stdout: "",
    stderr: "",
  });
});

test("保護範囲でないパスへの書き込みと、git の作業ツリーの外への書き込みは拒否しない", () => {
  for (const path of [
    join(repository, "src/core/game.ts"),
    join(worktree, "src/core/new.ts"),
    join(outside, "x/y.ts"),
  ]) {
    expect(runHook(edit(path, "worker"), SUPERVISOR)).toStrictEqual({
      status: 0,
      stdout: "",
      stderr: "",
    });
  }
});

test.each([
  {
    name: "linked worktree のファイルは、その worktree のルートから照合する",
    input: (): unknown => edit(join(worktree, "src/sim/bot.ts"), "worker"),
    reasons: (): readonly string[] => ["判定の基盤: src/sim/bot.ts（foundation-paths.txt の一覧）"],
  },
  {
    name: "まだ無いディレクトリの新しいファイル",
    input: (): unknown => edit(join(repository, ".claude/skills/new/SKILL.md"), "worker"),
    reasons: (): readonly string[] => [
      "保護の仕組み: .claude/skills/new/SKILL.md（Claude Code の設定・サブエージェント・skill）",
    ],
  },
  {
    name: "相対パスは入力の cwd から解く",
    input: (): unknown => edit("bot.ts", "worker", join(repository, "src/sim")),
    reasons: (): readonly string[] => ["判定の基盤: src/sim/bot.ts（foundation-paths.txt の一覧）"],
  },
  {
    name: "symlink は指す先で照合する",
    input: (): unknown => edit(join(repository, "src/link.yml"), "worker"),
    reasons: (): readonly string[] => [
      "判定の基盤: lefthook.yml（foundation-paths.txt の一覧）",
      "検査の設定: lefthook.yml（lefthook の設定）",
    ],
  },
  {
    name: "公開・デプロイの workflow",
    input: (): unknown => edit(join(repository, ".github/workflows/deploy.yml"), "worker"),
    reasons: (): readonly string[] => [
      "リポジトリの外に出る操作: .github/workflows/deploy.yml（GitHub の workflow などの設定）",
    ],
  },
  {
    name: "ルート以外の指示",
    input: (): unknown => edit(join(repository, "src/core/CLAUDE.md"), "worker"),
    reasons: (): readonly string[] => ["保護の仕組み: src/core/CLAUDE.md（エージェントへの指示）"],
  },
  {
    name: "git の内部",
    input: (): unknown => edit(join(repository, ".git/hooks/pre-commit"), "worker"),
    reasons: (): readonly string[] => [
      `保護の仕組み: ${repository}/.git/hooks/pre-commit（git の内部。hook を含む）`,
    ],
  },
] as const)("$name", ({ input, reasons }) => {
  expect(runHook(input(), SUPERVISOR)).toStrictEqual(denied(reasons()));
});

test.each([
  { name: "読めない入力", input: (): unknown => "{", env: SUPERVISOR, message: "SyntaxError" },
  {
    name: "編集先のディレクトリで git が失敗する",
    input: (): unknown => edit(join(outside, "broken/x.ts"), "worker"),
    env: SUPERVISOR,
    message: "git rev-parse --show-toplevel",
  },
  {
    name: "hook のスクリプトが無い",
    input: (): unknown => edit(join(repository, "lefthook.yml"), "worker"),
    env: { ...SUPERVISOR, CLAUDE_PROJECT_DIR: outside },
    message: "hook.ts",
  },
] as const)("$name ときは、終了コード 2 で書き込みを止める", ({ input, env, message }) => {
  const result = runHook(input(), env);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(message);
});

test("判定の基盤の一覧の場所が分からないときは、終了コード 2 で書き込みを止める", () => {
  const result = spawnSync(
    process.execPath,
    [join(repositoryRoot, "scripts/protect/cli/hook.ts")],
    {
      input: JSON.stringify(edit(join(repository, "lefthook.yml"), "worker")),
      encoding: "utf8",
      env: isolatedEnv(SUPERVISOR),
    },
  );

  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    "保護範囲の hook が失敗したため、書き込みを止めた: Error: CLAUDE_PROJECT_DIR が無く、判定の基盤の一覧を読めない。\n",
  );
});
