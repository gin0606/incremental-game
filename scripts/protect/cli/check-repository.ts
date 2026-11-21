import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRepository, gitIn, isolatedEnv, repositoryRoot, writeFiles } from "./fixture.ts";

// 取り込み前の検査（check.ts）のテストが使う、使い捨てのリポジトリ。

const check = fileURLToPath(new URL("check.ts", import.meta.url));

const real = (path: string): string => readFileSync(join(repositoryRoot, path), "utf8");

export const manifest = (fields: Readonly<Record<string, unknown>>): string =>
  `${JSON.stringify({ name: "x", ...fields }, undefined, 2)}\n`;
export const scripts = { typecheck: "tsrs --noEmit -p tsconfig.sim.json", test: "vitest run" };
export const devDependencies = { vitest: "5.1.1" };

// 判定の基盤の一覧と AGENTS.md はこのリポジトリのものを使い、ほかは中身を問わない。
export const baseFiles: {
  readonly "foundation-paths.txt": string;
  readonly "AGENTS.md": string;
  readonly "package.json": string;
  readonly "src/core/game.ts": string;
  readonly [path: string]: string;
} = {
  "foundation-paths.txt": real("foundation-paths.txt"),
  "AGENTS.md": real("AGENTS.md"),
  "package.json": manifest({ scripts, devDependencies }),
  "src/core/game.ts":
    "export const a = 1;\n// mutator-critical\nexport const f = (): number => 1;\n",
  "src/ui/view.ts": "// oxlint-disable no-console\nconsole.log(1);\n// oxlint-enable no-console\n",
  "src/sim/bot.ts": "export const b = 1;\n",
  "src/sim/minimal-game.ts": "export const m = 1;\n",
  "docs/design/minimal-game.md": "# 設計\n",
  "docs/design/minimal-game.targets.json": "{}\n",
  "tsconfig.json": "{}\n",
  ".oxlintrc.json": "{}\n",
  ".oxfmtrc.json": "{}\n",
  "lefthook.yml": "pre-commit: {}\n",
  "mutator.config.ts": "export {};\n",
  "mutator.accepted.json": "{}\n",
  "vitest.mutation.config.ts": "export {};\n",
  ".claude/settings.json": "{}\n",
  "scripts/protect/cli/hook.ts": "export {};\n",
  "scripts/protect/cli/check.ts": "export {};\n",
};

export const replace = (text: string, from: string, to: string): string => {
  if (!text.includes(from)) {
    throw new Error(`${from} が無い。`);
  }
  return text.replace(from, to);
};

/** baseFiles を main に commit したリポジトリを作る。 */
export const createCheckRepository = (): string => {
  const repository = createRepository(baseFiles);
  // 利用者の設定で差分の出力が変わっても、検出が変わらないことを確かめる。外部の diff とテキストへの変換は、
  // 何も出力しないコマンド（true）にする。
  for (const [key, value] of [
    ["diff.relative", "true"],
    ["diff.noprefix", "true"],
    ["diff.renames", "copies"],
    ["color.ui", "always"],
    ["diff.external", "true"],
    ["diff.hide.textconv", "true"],
  ]) {
    gitIn(repository, ["config", key ?? "", value ?? ""]);
  }
  writeFiles(repository, { ".git/info/attributes": "src/ui/* diff=hide\n" });
  return repository;
};

/** `from`（既定は main）から `branch` を作ってファイルを書き・消して commit し、main に戻る。 */
export const commitOn = (
  repository: string,
  branch: string,
  {
    files = {},
    removed = [],
    from = "main",
  }: {
    readonly files?: Readonly<Record<string, string>>;
    readonly removed?: readonly string[];
    readonly from?: string;
  },
): void => {
  gitIn(repository, ["switch", "--quiet", "--create", branch, from]);
  writeFiles(repository, files);
  for (const path of removed) {
    gitIn(repository, ["rm", "--quiet", path]);
  }
  gitIn(repository, ["add", "--all"]);
  gitIn(repository, ["commit", "--quiet", "--message=change"]);
  gitIn(repository, ["switch", "--quiet", "main"]);
};

export const runCheck = (
  cwd: string,
  args: readonly string[],
): { status: number | null; stdout: string; stderr: string } => {
  const result = spawnSync(process.execPath, [check, ...args], {
    cwd,
    encoding: "utf8",
    env: isolatedEnv(),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};
