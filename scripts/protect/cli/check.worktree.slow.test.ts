import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { createCheckRepository, runCheck } from "./check-repository.ts";
import { createRepository, gitIn, isolatedEnv, repositoryRoot, writeFiles } from "./fixture.ts";

// 1 件で git を何度も起動する。機械が混み合っても結果と関係なく落ちないよう、時間切れを広げる。
vi.setConfig({ testTimeout: 120_000 });

let repository = "";
const copies: string[] = [];

beforeAll(() => {
  repository = createCheckRepository();
});

afterEach(() => {
  gitIn(repository, ["reset", "--quiet", "--hard"]);
  gitIn(repository, ["clean", "--quiet", "--force", "-d"]);
});

afterAll(() => {
  for (const directory of [repository, ...copies]) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  {
    name: "規則の変更",
    prepare: (): void => {
      writeFiles(repository, { "scripts/protect/cli/check.ts": "export const x = 1;\n" });
    },
    entries: [" M scripts/protect/cli/check.ts"],
  },
  {
    name: "stage した規則の変更",
    prepare: (): void => {
      writeFiles(repository, { "scripts/protect/cli/hook.ts": "export const x = 1;\n" });
      gitIn(repository, ["add", "--all"]);
    },
    entries: ["M  scripts/protect/cli/hook.ts"],
  },
  {
    name: "stage した規則の名前の変更",
    prepare: (): void => {
      gitIn(repository, ["mv", "scripts/protect/cli/hook.ts", "scripts/protect/cli/hook-moved.ts"]);
    },
    entries: ["A  scripts/protect/cli/hook-moved.ts", "D  scripts/protect/cli/hook.ts"],
  },
  {
    name: "未追跡の規則のファイル",
    prepare: (): void => {
      writeFiles(repository, { "scripts/protect/extra/rule.ts": "export const x = 1;\n" });
    },
    entries: ["?? scripts/protect/extra/rule.ts"],
  },
  {
    name: "判定の基盤の一覧の変更",
    prepare: (): void => {
      writeFiles(repository, { "foundation-paths.txt": "src/*\n" });
    },
    entries: [" M foundation-paths.txt"],
  },
] as const)(
  "作業ツリーに $name があれば、検査せずに終了コード 2 で止める",
  ({ prepare, entries }) => {
    prepare();

    // サブディレクトリから実行しても、作業ツリーのルートからのパスで調べる。
    const result = runCheck(join(repository, "src"), ["main", "main"]);

    expect(result).toStrictEqual({
      status: 2,
      stdout: "",
      stderr: `検出の規則か判定の基盤の一覧に commit していない変更があるため、検査しない:\n${entries.map((entry) => `- ${entry}\n`).join("")}`,
    });
  },
);

test("規則と一覧の外にある commit していない変更では止めない", () => {
  writeFiles(repository, {
    "src/core/game.ts": "export const a = 2;\n",
    "src/core/new.ts": "export const n = 1;\n",
    "scripts/autopilot.sh": "#!/bin/sh\n",
    "scripts/protect.md": "# 覚え書き\n",
  });

  const result = runCheck(repository, ["main", "main"]);

  expect(result).toStrictEqual({
    status: 0,
    stdout: `保護範囲に当たる変更は無い（${gitIn(repository, ["rev-parse", "main"]).trim()}..main）。\n`,
    stderr: "",
  });
});

// 規則を読み込む前に確かめることは、このリポジトリの scripts/protect を写したリポジトリで、写した check.ts を
// 動かして確かめる（ほかのテストは、このリポジトリの check.ts を使い捨てのリポジトリで動かす）。
const copiedRules = (): Readonly<Record<string, string>> =>
  Object.fromEntries(
    readdirSync(join(repositoryRoot, "scripts/protect"), { recursive: true, encoding: "utf8" })
      .filter((path) => path.endsWith(".ts") && !path.includes(".test."))
      .map((path) => [
        `scripts/protect/${path}`,
        readFileSync(join(repositoryRoot, "scripts/protect", path), "utf8"),
      ]),
  );

const runCopied = (
  prepare?: (copy: string) => void,
): { status: number | null; stdout: string; stderr: string } => {
  const copy = createRepository({
    ...copiedRules(),
    "package.json": '{ "type": "module" }\n',
    "foundation-paths.txt": "src/*\n",
  });
  copies.push(copy);
  prepare?.(copy);
  const result = spawnSync(
    process.execPath,
    [join(copy, "scripts/protect/cli/check.ts"), "main", "main"],
    { cwd: copy, encoding: "utf8", env: isolatedEnv() },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const BROKEN = "export const = ;\n";

test("入口のほかの規則のモジュールは、commit していない変更が無いと確かめるまで読み込まない", () => {
  // 入口がどれかを先に import していれば、壊れたモジュールの読み込みで終了コード 1 になる。
  const modules = Object.keys(copiedRules())
    .filter((path) => path !== "scripts/protect/cli/check.ts")
    .toSorted();

  expect(
    runCopied((copy) => {
      writeFiles(copy, Object.fromEntries(modules.map((path) => [path, BROKEN])));
    }),
  ).toStrictEqual({
    status: 2,
    stdout: "",
    stderr: `検出の規則か判定の基盤の一覧に commit していない変更があるため、検査しない:\n${modules.map((path) => `-  M ${path}\n`).join("")}`,
  });
});

test("写した規則は、壊さなければそのまま動く", () => {
  const result = runCopied();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("commit した規則を読み込めなければ、終了コード 2 で失敗する", () => {
  const result = runCopied((copy) => {
    writeFiles(copy, { "scripts/protect/rules.ts": BROKEN });
    gitIn(copy, ["commit", "--quiet", "--all", "--message=broken"]);
  });

  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("保護範囲の検査に失敗した: SyntaxError");
});
