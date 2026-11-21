import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { baseFiles, commitOn, createCheckRepository, runCheck } from "./check-repository.ts";
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
  gitIn(repository, ["switch", "--quiet", "main"]);
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

test.each([
  {
    name: "作業ブランチが commit した規則の変更",
    branch: "rules-changed",
    change: { files: { "scripts/protect/cli/hook.ts": "export const x = 1;\n" } },
    paths: ["scripts/protect/cli/hook.ts"],
  },
  {
    name: "作業ブランチが commit した規則の追加と削除",
    branch: "rules-added-removed",
    change: {
      files: { "scripts/protect/extra/rule.ts": "export const x = 1;\n" },
      removed: ["scripts/protect/cli/check.ts"],
    },
    paths: ["scripts/protect/cli/check.ts", "scripts/protect/extra/rule.ts"],
  },
  {
    name: "作業ブランチが commit した判定の基盤の一覧の変更",
    branch: "list-changed",
    change: { files: { "foundation-paths.txt": `${baseFiles["foundation-paths.txt"]}src/*\n` } },
    paths: ["foundation-paths.txt"],
  },
] as const)(
  "作業ブランチの作業ツリーで $name があれば、検査せずに終了コード 2 で止める",
  ({ branch, change, paths }) => {
    commitOn(repository, branch, change);
    gitIn(repository, ["switch", "--quiet", branch]);

    // サブディレクトリから実行しても、作業ツリーのルートからのパスで挙げる。
    const result = runCheck(join(repository, "src"), ["main", branch]);

    expect(result).toStrictEqual({
      status: 2,
      stdout: "",
      stderr: `検出の規則か判定の基盤の一覧が main の版と違うため、検査しない（取り込み先の作業ツリーで実行する）:\n${paths.map((path) => `- ${path}\n`).join("")}`,
    });
  },
);

test("分岐の後に base で規則を変えていれば、base より前の作業ツリーでは止める", () => {
  commitOn(repository, "rules-on-base", {
    files: { "scripts/protect/cli/hook.ts": "export const x = 1;\n" },
  });

  const result = runCheck(repository, ["rules-on-base", "main"]);

  expect(result).toStrictEqual({
    status: 2,
    stdout: "",
    stderr:
      "検出の規則か判定の基盤の一覧が rules-on-base の版と違うため、検査しない（取り込み先の作業ツリーで実行する）:\n- scripts/protect/cli/hook.ts\n",
  });
});

test("HEAD が base でなくても、規則と一覧が base の版と同じなら検査する", () => {
  commitOn(repository, "game-changed", {
    files: { "src/core/game.ts": `${baseFiles["src/core/game.ts"]}// @ts-expect-error\n` },
  });
  gitIn(repository, ["switch", "--quiet", "game-changed"]);

  const result = runCheck(repository, ["main", "game-changed"]);

  expect(result).toStrictEqual({
    status: 1,
    stdout: `保護範囲に当たる変更がある（${gitIn(repository, ["rev-parse", "main"]).trim()}..game-changed）:\n- 抑制の印: src/core/game.ts（追加した行: // @ts-expect-error）\n`,
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
  args: readonly string[] = ["main", "main"],
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
    [join(copy, "scripts/protect/cli/check.ts"), ...args],
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

// 作業ブランチの作業ツリーで、ブランチが commit した壊れたモジュール（読み込むと終了コード 1 になる）を読み込む前に
// 止める。
const commitBrokenModules = (copy: string, modules: readonly string[]): void => {
  gitIn(copy, ["switch", "--quiet", "--create", "broken"]);
  writeFiles(copy, Object.fromEntries(modules.map((path) => [path, BROKEN])));
  gitIn(copy, ["commit", "--quiet", "--all", "--message=broken"]);
};

test("入口のほかの規則のモジュールは、base の版と同じと確かめるまで読み込まない", () => {
  const modules = Object.keys(copiedRules())
    .filter((path) => path !== "scripts/protect/cli/check.ts")
    .toSorted();

  expect(
    runCopied(
      (copy) => {
        commitBrokenModules(copy, modules);
      },
      ["main", "broken"],
    ),
  ).toStrictEqual({
    status: 2,
    stdout: "",
    stderr: `検出の規則か判定の基盤の一覧が main の版と違うため、検査しない（取り込み先の作業ツリーで実行する）:\n${modules.map((path) => `- ${path}\n`).join("")}`,
  });
});

test.each(["main..main", "main^!", "--", "--output=out"])(
  "base に 1 つの commit でない %s を渡せば、規則を読み込まずに終了コード 2 で失敗する",
  (base) => {
    let copy = "";
    const result = runCopied(
      (created) => {
        copy = created;
        commitBrokenModules(created, ["scripts/protect/cli/check-diff.ts"]);
      },
      [base, "broken"],
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^保護範囲の検査に失敗した: Error: git -C .+ rev-parse /v);
    expect(result.stderr).not.toContain("SyntaxError");
    expect(gitIn(copy, ["status", "--porcelain"])).toBe("");
  },
);

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
