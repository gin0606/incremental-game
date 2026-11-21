import { expect, test } from "vitest";

import type { FileChange } from "./rules.ts";
import { changeFindings, formatFinding, parsePathList } from "./rules.ts";

const foundation = parsePathList("src/sim/*\n");

const change = (fields: Partial<FileChange>): FileChange => ({
  path: "src/core/game.ts",
  added: [],
  removed: [],
  ...fields,
});

test.each([
  "// oxlint-disable-next-line no-console",
  "/* OXLINT-DISABLE */",
  "// eslint-disable-line",
  "// @ts-expect-error",
  "// @ts-nocheck",
  "// @TS-NOCHECK",
  "// @ts-ignore: 理由",
  "// mutator-disable-next-line: 等価",
  "// Stryker disable next-line all",
])("追加した行の抑制の印（%s）を検出する", (line) => {
  expect(changeFindings(change({ added: [`  ${line}  `] }), foundation)).toStrictEqual([
    { category: "抑制の印", path: "src/core/game.ts", detail: `追加した行: ${line}` },
  ]);
});

test.each([
  "// oxlint-enable no-console",
  "// ESLINT-ENABLE",
  "// mutator-enable",
  "// Stryker restore all",
])("抑制の範囲の終わり（%s）を消した行を検出する", (line) => {
  expect(changeFindings(change({ removed: [line] }), foundation)).toStrictEqual([
    {
      category: "抑制の印",
      path: "src/core/game.ts",
      detail: `抑制の範囲の終わりを消した行: ${line}`,
    },
  ]);
});

test.each(["// mutator-critical", "  // MUTATOR-CRITICAL"])("%s を消した行を検出する", (line) => {
  expect(changeFindings(change({ removed: [line] }), foundation)).toStrictEqual([
    {
      category: "ミューテーションテストの設定と除外",
      path: "src/core/game.ts",
      detail: `mutator-critical を消した行: ${line.trim()}`,
    },
  ]);
});

test("検査を強める印、抑制の印を消した行、@ts-check を消した行、ゲームのコードは検出しない", () => {
  expect(
    changeFindings(
      change({
        added: [
          "// oxlint-enable",
          "// mutator-critical",
          "// @ts-check",
          "const tsx = 1;",
          "import x from '@tsconfig/x';",
          'import { initContract } from "@ts-rest/core";',
        ],
        removed: [
          "// oxlint-disable-next-line",
          "// @ts-expect-error",
          "// @ts-check",
          "const ts = 1;",
        ],
      }),
      foundation,
    ),
  ).toStrictEqual([]);
});

test("パス・追加した行・消した行の検出をすべて挙げる", () => {
  expect(
    changeFindings(
      change({
        path: "src/sim/bot.ts",
        added: ["x", "// @ts-ignore"],
        removed: ["// mutator-critical", "// mutator-enable"],
      }),
      foundation,
    ).map((finding) => formatFinding(finding)),
  ).toStrictEqual([
    "判定の基盤: src/sim/bot.ts（foundation-paths.txt の一覧）",
    "抑制の印: src/sim/bot.ts（追加した行: // @ts-ignore）",
    "抑制の印: src/sim/bot.ts（抑制の範囲の終わりを消した行: // mutator-enable）",
    "ミューテーションテストの設定と除外: src/sim/bot.ts（mutator-critical を消した行: // mutator-critical）",
  ]);
});

test("package.json と AGENTS.md は内容を比べる", () => {
  expect(
    changeFindings(
      change({
        path: "package.json",
        contents: { before: '{"scripts":{"a":"x"}}', after: '{"scripts":{"a":"y"}}' },
      }),
      foundation,
    ),
  ).toStrictEqual([
    { category: "検査の設定", path: "package.json", detail: "package.json の scripts" },
  ]);
  expect(
    changeFindings(
      change({ path: "AGENTS.md", contents: { before: "## 検証\na\n", after: "## 検証\nb\n" } }),
      foundation,
    ),
  ).toStrictEqual([
    { category: "AGENTS.md の保護対象の節", path: "AGENTS.md", detail: "AGENTS.md の「検証」節" },
  ]);
});

test("ほかのパスは内容を見ない", () => {
  expect(
    changeFindings(
      change({ path: "src/package.json", contents: { before: "{}", after: '{"scripts":{}}' } }),
      foundation,
    ),
  ).toStrictEqual([]);
});

test.each(["package.json", "AGENTS.md"])("%s の内容を渡さなければ失敗する", (path) => {
  expect(() => changeFindings(change({ path }), foundation)).toThrow(
    `${path} は変更前後の内容を渡す。`,
  );
});
