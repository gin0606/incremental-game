import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { Category } from "./rules.ts";
import { casePattern, inGitDirectory, inPathList, parsePathList, pathFindings } from "./rules.ts";

// 照合の参照の実装。`*` は任意の文字列、`?` は任意の 1 文字に一致し、大文字と小文字を区別しない。
const reference = (pattern: string, path: string): boolean => {
  const [head, ...rest] = pattern;
  if (head === undefined) {
    return path === "";
  }
  const tail = rest.join("");
  if (head === "*") {
    return [...Array.from({ length: path.length + 1 }).keys()].some((index) =>
      reference(tail, path.slice(index)),
    );
  }
  const [first, ...others] = path;
  if (first === undefined) {
    return false;
  }
  return (
    (head === "?" || head.toLowerCase() === first.toLowerCase()) && reference(tail, others.join(""))
  );
};

test("`*` と `?` を特殊文字とし、大文字と小文字を区別せずに照合する", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: fc.constantFrom("a", "B", "/", ".", "(", "*", "?"), maxLength: 6 }),
      fc.string({ unit: fc.constantFrom("a", "A", "b", "/", ".", "("), maxLength: 6 }),
      (pattern, path) => {
        expect(casePattern(pattern)(path)).toBe(reference(pattern, path));
      },
    ),
  );
});

test("正規表現の特殊文字は、その文字そのものに一致する", () => {
  const literal = "^$.+()]{}|/";
  expect(casePattern(literal)(literal)).toBe(true);
  expect(casePattern(".")("x")).toBe(false);
  expect(casePattern("a+")("aa")).toBe(false);
  expect(casePattern("(a|b)")("a")).toBe(false);
  expect(casePattern("a{2}")("aa")).toBe(false);
  expect(casePattern("x$")("x")).toBe(false);
  expect(casePattern("^x")("x")).toBe(false);
});

test("パス全体に一致させる", () => {
  expect(casePattern("src/sim/*")("src/sim/cli/main.ts")).toBe(true);
  expect(casePattern("src/sim/*")("x/src/sim/a.ts")).toBe(false);
  expect(casePattern("lefthook.yml")("lefthook.yml.bak")).toBe(false);
  expect(casePattern("*")("a\nb")).toBe(true);
  expect(casePattern("a?b")("a\nb")).toBe(true);
});

test.each(["src/[ab].ts", String.raw`src/\*.ts`])("%s は書式の外として拒む", (pattern) => {
  expect(() => casePattern(pattern)).toThrow(`パターンに [ と \\ は使えない: ${pattern}`);
});

test("空行・コメントを読まず、`!` で始まる行を除外にする", () => {
  const list = parsePathList(
    "# コメント\n\n  src/sim/*  \r\n\t# 字下げしたコメント\n!src/sim/minimal-game.ts\nlefthook.yml\n",
  );
  expect(list.includes).toHaveLength(2);
  expect(list.excludes).toHaveLength(1);
  expect(inPathList(list, "src/sim/bot.ts")).toBe(true);
  expect(inPathList(list, "lefthook.yml")).toBe(true);
  expect(inPathList(list, "src/sim/minimal-game.ts")).toBe(false);
  expect(inPathList(list, "src/core/game.ts")).toBe(false);
  expect(inPathList(list, "# コメント")).toBe(false);
  expect(inPathList(list, "")).toBe(false);
});

test("除外は行の順序によらず効く", () => {
  const list = parsePathList("!src/sim/a.ts\nsrc/sim/*");
  expect(inPathList(list, "src/sim/a.ts")).toBe(false);
  expect(inPathList(list, "src/sim/b.ts")).toBe(true);
});

test.each(["", "# コメントだけ\n", "!src/sim/*\n"])(
  "除外でないパターンが無い一覧（%j）は拒む",
  (text) => {
    expect(() => parsePathList(text)).toThrow("パスの一覧に、除外でないパターンが一つも無い。");
  },
);

const foundation = parsePathList("src/sim/*\n!src/sim/minimal-game.ts\ndocs/design/README.md\n");

const categories = (path: string): readonly Category[] =>
  pathFindings(path, foundation).map((finding) => finding.category);

test.each([
  { path: "src/sim/bot.ts", expected: ["判定の基盤"] },
  { path: "SRC/Sim/bot.ts", expected: ["判定の基盤"] },
  { path: "docs/design/README.md", expected: ["判定の基盤"] },
  { path: "tsconfig.json", expected: ["検査の設定"] },
  { path: "tsconfig.check.json", expected: ["検査の設定"] },
  { path: "src/sim/cli/tsconfig.json", expected: ["判定の基盤", "検査の設定"] },
  { path: "e2e/TSCONFIG.json", expected: ["検査の設定"] },
  { path: ".oxlintrc.json", expected: ["検査の設定"] },
  { path: "src/.oxlintrc.jsonc", expected: ["検査の設定"] },
  { path: "oxlint.config.ts", expected: ["検査の設定"] },
  { path: ".eslintignore", expected: ["検査の設定"] },
  { path: ".oxfmtrc.json", expected: ["検査の設定"] },
  { path: "oxfmt.config.mts", expected: ["検査の設定"] },
  { path: ".prettierignore", expected: ["検査の設定"] },
  { path: ".gitignore", expected: ["検査の設定"] },
  { path: "src/.gitignore", expected: ["検査の設定"] },
  { path: "lefthook.yml", expected: ["検査の設定"] },
  { path: "lefthook-local.yml", expected: ["検査の設定"] },
  { path: ".config/lefthook.yaml", expected: ["検査の設定"] },
  { path: ".lefthook/pre-commit/check.sh", expected: ["検査の設定"] },
  { path: "mutator.config.ts", expected: ["ミューテーションテストの設定と除外"] },
  { path: "mutator.config.json", expected: ["ミューテーションテストの設定と除外"] },
  { path: "mutator.accepted.json", expected: ["ミューテーションテストの設定と除外"] },
  { path: "vitest.mutation.config.ts", expected: ["ミューテーションテストの設定と除外"] },
  { path: "scripts/check-tsconfig-references.sh", expected: ["保護の仕組み"] },
  { path: "scripts/protect/cli/hook.ts", expected: ["保護の仕組み"] },
  { path: "Scripts/autopilot.sh", expected: ["保護の仕組み"] },
  { path: "foundation-paths.txt", expected: ["保護の仕組み"] },
  { path: ".claude/settings.json", expected: ["保護の仕組み"] },
  { path: ".claude/agents/worker.md", expected: ["保護の仕組み"] },
  { path: ".claude/skills/supervise/SKILL.md", expected: ["保護の仕組み"] },
  { path: "CLAUDE.md", expected: ["保護の仕組み"] },
] as const)("$path は $expected", ({ path, expected }) => {
  expect(categories(path)).toStrictEqual(expected);
});

test.each([
  "src/sim/minimal-game.ts",
  "src/core/game.ts",
  "docs/design/minimal-game.targets.json",
  "docs/design/minimal-game.md",
  "tsconfig.json.bak",
  "tsconfig/base.json",
  "mytsconfig.json",
  "x.oxlintrc.json",
  "x.eslintignore",
  ".eslintignore.bak",
  "x.oxfmtrc.json",
  ".prettierignore.bak",
  "x.gitignore",
  "docs/oxfmt.md",
  ".gitignore.bak",
  "src/mylefthook.yml",
  "mutator.accepted.json.bak",
  "src/mutator.ts",
  "myvitest.mutation.config.ts",
  "src/scripts/build.ts",
  "scripts",
  "docs/foundation-paths.txt",
  "foundation-paths.txt.bak",
  ".claude/worktrees/agent-1/src/core/game.ts",
  "src/.claude/settings.json",
  ".claudex/settings.json",
  "docs/CLAUDE.md",
  "CLAUDE.md.bak",
  "AGENTS.md",
  "package.json",
])("%s は保護範囲のパスではない", (path) => {
  expect(categories(path)).toStrictEqual([]);
});

test("検出したパスと理由を返す", () => {
  expect(pathFindings("src/sim/cli/tsconfig.json", foundation)).toStrictEqual([
    {
      category: "判定の基盤",
      path: "src/sim/cli/tsconfig.json",
      detail: "foundation-paths.txt の一覧",
    },
    { category: "検査の設定", path: "src/sim/cli/tsconfig.json", detail: "TypeScript の設定" },
  ]);
  expect(pathFindings(".claude/settings.json", foundation)).toStrictEqual([
    {
      category: "保護の仕組み",
      path: ".claude/settings.json",
      detail: "Claude Code の設定・サブエージェント・skill",
    },
  ]);
});

test.each([
  { path: ".oxfmtrc.json", detail: "oxfmt の設定" },
  { path: ".eslintignore", detail: "oxlint の設定" },
  { path: ".gitignore", detail: "oxlint と oxfmt が読む除外の一覧" },
  { path: "lefthook.yml", detail: "lefthook の設定" },
  { path: "mutator.accepted.json", detail: "ミューテーションテストの設定と受け入れた変異" },
  { path: "scripts/x.sh", detail: "検査・保護範囲の検出・無人運転のスクリプト" },
  { path: "foundation-paths.txt", detail: "判定の基盤のパスの一覧" },
  { path: "CLAUDE.md", detail: "AGENTS.md を読み込む指示" },
] as const)("$path の理由は $detail", ({ path, detail }) => {
  expect(pathFindings(path, foundation).map((finding) => finding.detail)).toStrictEqual([detail]);
});

test.each(["/r/.git", "/r/.git/hooks/pre-commit", "/r/.GIT/config", ".git/hooks/x"])(
  "%s は git の内部",
  (path) => {
    expect(inGitDirectory(path)).toBe(true);
  },
);

test.each(["/r/.github/workflows/x.yml", "/r/x.git", "/r/.gitignore", "/r/src/git/x"])(
  "%s は git の内部ではない",
  (path) => {
    expect(inGitDirectory(path)).toBe(false);
  },
);
