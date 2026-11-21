import { rmSync } from "node:fs";

import { afterAll, beforeAll, expect, test, vi } from "vitest";

import {
  baseFiles,
  commitOn,
  createCheckRepository,
  replace,
  runCheck,
} from "./check-repository.ts";
import { gitIn } from "./fixture.ts";

// 1 件で git を何度も起動する。機械が混み合っても結果と関係なく落ちないよう、時間切れを広げる。
vi.setConfig({ testTimeout: 120_000 });

let repository = "";

beforeAll(() => {
  repository = createCheckRepository();
});

afterAll(() => {
  rmSync(repository, { recursive: true, force: true });
});

test("base が分岐の後に進んでも、分岐点から head までの変更だけを見る", () => {
  commitOn(repository, "moved", { files: { "src/core/upgrade.ts": "export const u = 1;\n" } });
  commitOn(repository, "protected-on-main", {
    files: { "lefthook.yml": "pre-commit: { jobs: [] }\n" },
  });

  const result = runCheck(repository, ["protected-on-main", "moved"]);

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("分岐の後に base で判定の基盤の一覧に足したパスも検出する", () => {
  commitOn(repository, "metrics", { files: { "src/metrics/score.ts": "export const s = 1;\n" } });
  commitOn(repository, "listed", {
    files: {
      "foundation-paths.txt": `${baseFiles["foundation-paths.txt"]}src/metrics/*\n`,
    },
  });

  // 一覧が base の版と違う作業ツリーでは止まるため、取り込み先の作業ツリー（HEAD が base）で実行する。
  gitIn(repository, ["switch", "--quiet", "listed"]);
  const result = runCheck(repository, ["listed", "metrics"]);
  gitIn(repository, ["switch", "--quiet", "main"]);

  expect(result.stderr).toBe("");
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(
    "）:\n- 判定の基盤: src/metrics/score.ts（foundation-paths.txt の一覧）\n",
  );
});

test("package.json と AGENTS.md を消す・足すと、内容を比べる項目と節を検出する", () => {
  commitOn(repository, "deleted", { removed: ["package.json", "AGENTS.md"] });
  commitOn(repository, "re-added", {
    files: { "package.json": baseFiles["package.json"], "AGENTS.md": "## 検証\n" },
    from: "deleted",
  });
  const packageFindings = [
    "- 検査の設定: package.json（package.json の devDependencies）",
    "- 検査の設定: package.json（package.json の scripts）",
  ];

  const deleted = runCheck(repository, ["main", "deleted"]);
  const added = runCheck(repository, ["deleted", "re-added"]);

  expect(deleted.stderr).toBe("");
  expect(deleted.stdout.trimEnd().split("\n").slice(1).toSorted()).toStrictEqual(
    [
      ...["ゲームの設計原則", "設計と根拠", "検証", "技術方針", "保護範囲"].map(
        (name) => `- AGENTS.md の保護対象の節: AGENTS.md（AGENTS.md の「${name}」節）`,
      ),
      ...packageFindings,
    ].toSorted(),
  );
  expect(added.stderr).toBe("");
  expect(added.stdout.trimEnd().split("\n").slice(1).toSorted()).toStrictEqual(
    [
      "- AGENTS.md の保護対象の節: AGENTS.md（AGENTS.md の「検証」節）",
      ...packageFindings,
    ].toSorted(),
  );
});

test("追加した行は、base ではなく分岐点からの差分で読む", () => {
  commitOn(repository, "marker", {
    files: { "src/core/game.ts": `${baseFiles["src/core/game.ts"]}// @ts-expect-error\n` },
  });
  commitOn(repository, "marker-on-main", {
    files: {
      "src/core/game.ts": `${baseFiles["src/core/game.ts"]}// @ts-expect-error\nexport const z = 1;\n`,
    },
  });

  const result = runCheck(repository, ["marker-on-main", "marker"]);

  expect(result.stderr).toBe("");
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(
    "）:\n- 抑制の印: src/core/game.ts（追加した行: // @ts-expect-error）\n",
  );
});

test("変更前の内容は、base ではなく分岐点の版と比べる", () => {
  commitOn(repository, "renamed", {
    files: { "package.json": replace(baseFiles["package.json"], '"name": "x"', '"name": "y"') },
  });
  commitOn(repository, "scripts-on-main", {
    files: {
      "package.json": replace(baseFiles["package.json"], "vitest run", "vitest run --bail"),
    },
  });

  const result = runCheck(repository, ["scripts-on-main", "renamed"]);

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test(".gitattributes でバイナリ扱いにしたファイルの追加した行も読む", () => {
  commitOn(repository, "attributes", {
    files: {
      ".gitattributes": "*.ts -diff\n",
      "src/core/upgrade.ts": "// @ts-nocheck\nexport const u = 1;\n",
    },
  });
  // git は作業ツリーの .gitattributes を読むため、そのブランチに切り替えて検査する。
  gitIn(repository, ["switch", "--quiet", "attributes"]);

  const result = runCheck(repository, ["main", "attributes"]);
  gitIn(repository, ["switch", "--quiet", "main"]);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain(
    "- 抑制の印: src/core/upgrade.ts（追加した行: // @ts-nocheck）\n",
  );
});

test.each([
  { name: "引数が無い", args: [] },
  { name: "head が無い", args: ["main"] },
  { name: "引数が多い", args: ["main", "main", "main"] },
] as const)("$name と終了コード 2 で使い方を示す", ({ args }) => {
  expect(runCheck(repository, args)).toStrictEqual({
    status: 2,
    stdout: "",
    stderr: "使い方: pnpm run check:protected <base> <head>\n",
  });
});

test.each([
  { name: "base", args: ["no-such-branch", "main"], command: "rev-parse" },
  { name: "head", args: ["main", "no-such-branch"], command: "merge-base" },
] as const)("読めない $name は終了コード 2 で失敗する", ({ args, command }) => {
  const result = runCheck(repository, args);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(
    new RegExp(`^保護範囲の検査に失敗した: Error: git -C .+ ${command} `, "v"),
  );
});
