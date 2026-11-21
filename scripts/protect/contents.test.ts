import { expect, test } from "vitest";

import { contentChanges, contentsNeeded } from "./contents.ts";

const parts = (path: string, before?: string, after?: string): readonly string[] =>
  contentChanges(path, { before, after }).map((change) => {
    expect(change.path).toBe(path);
    return change.part;
  });

const pkg = (fields: Readonly<Record<string, unknown>>): string =>
  JSON.stringify(fields, undefined, 2);

const pkgBase = {
  name: "x",
  scripts: { lint: "oxlint", typecheck: "tsrs --noEmit -p tsconfig.sim.json" },
  dependencies: { a: "1.0.0" },
  devDependencies: { oxlint: "1.94.0", vitest: "5.1.1" },
} as const;
const pkgBefore = pkg(pkgBase);

test.each([
  {
    name: "scripts の値を変える",
    after: { ...pkgBase, scripts: { ...pkgBase.scripts, typecheck: "tsrs --noEmit" } },
    expected: ["package.json の scripts"],
  },
  {
    name: "scripts を足す",
    after: { ...pkgBase, scripts: { ...pkgBase.scripts, x: "y" } },
    expected: ["package.json の scripts"],
  },
  {
    name: "scripts を消す",
    after: { ...pkgBase, scripts: { lint: "oxlint" } },
    expected: ["package.json の scripts"],
  },
  {
    name: "devDependencies の版を変える",
    after: { ...pkgBase, devDependencies: { ...pkgBase.devDependencies, oxlint: "1.95.0" } },
    expected: ["package.json の devDependencies"],
  },
  {
    name: "devDependencies を足す",
    after: { ...pkgBase, devDependencies: { ...pkgBase.devDependencies, x: "1.0.0" } },
    expected: ["package.json の devDependencies"],
  },
  {
    name: "項目ごと消す",
    after: { name: "x", dependencies: pkgBase.dependencies },
    expected: ["package.json の scripts", "package.json の devDependencies"],
  },
  {
    name: "値の型を変える",
    after: { ...pkgBase, scripts: { ...pkgBase.scripts, lint: ["oxlint"] } },
    expected: ["package.json の scripts"],
  },
  {
    name: "dependencies と、ほかの項目だけを変える",
    after: { ...pkgBase, name: "y", dependencies: { a: "2.0.0", b: "1.0.0" } },
    expected: [],
  },
  {
    name: "キーの順序だけを変える",
    after: {
      devDependencies: { vitest: "5.1.1", oxlint: "1.94.0" },
      dependencies: pkgBase.dependencies,
      scripts: { typecheck: pkgBase.scripts.typecheck, lint: "oxlint" },
      name: "x",
    },
    expected: [],
  },
] as const)("$name: $expected", ({ after, expected }) => {
  expect(parts("package.json", pkgBefore, pkg(after))).toStrictEqual(expected);
});

const nested = (value: unknown): string => pkg({ scripts: { a: value } });

test("入れ子の値は、オブジェクトのキーの順序によらず、配列の順序と値の型で比べる", () => {
  expect(
    parts("package.json", nested({ p: 1, q: [1, "2"] }), nested({ q: [1, "2"], p: 1 })),
  ).toStrictEqual([]);
  expect(parts("package.json", nested([1, 2]), nested([2, 1]))).toStrictEqual([
    "package.json の scripts",
  ]);
  expect(parts("package.json", nested(1), nested("1"))).toStrictEqual(["package.json の scripts"]);
  expect(parts("package.json", nested(null), nested({}))).toStrictEqual([
    "package.json の scripts",
  ]);
  expect(parts("package.json", nested({ a: 1 }), nested({ b: 1 }))).toStrictEqual([
    "package.json の scripts",
  ]);
  expect(parts("package.json", nested({ a: 1, b: 2 }), nested({ ab: 12 }))).toStrictEqual([
    "package.json の scripts",
  ]);
  expect(parts("package.json", nested({}), nested([]))).toStrictEqual(["package.json の scripts"]);
  expect(parts("package.json", nested(null), nested(null))).toStrictEqual([]);
});

test.each([
  { a: [1, 23], b: [12, 3] },
  { a: [1], b: [1, 2] },
  { a: [1, 2], b: [1, 3] },
  { a: [1], b: { "0": 1 } },
  { a: { length: 0 }, b: [] },
  { a: [], b: { length: 0 } },
  { a: {}, b: null },
  { a: {}, b: 1 },
  { a: 1, b: {} },
  { a: { a: 1 }, b: { a: 1, b: 2 } },
  { a: { a: 1, b: 2 }, b: { a: 1, b: 3 } },
] as const)("scripts の値 $a と $b は異なる", ({ a, b }) => {
  expect(parts("package.json", nested(a), nested(b))).toStrictEqual(["package.json の scripts"]);
});

test("ファイルを足す・消すと、ある項目を検出する", () => {
  expect(parts("package.json", undefined, pkg({ scripts: {} }))).toStrictEqual([
    "package.json の scripts",
  ]);
  expect(parts("package.json", pkg({ devDependencies: {} }))).toStrictEqual([
    "package.json の devDependencies",
  ]);
  expect(parts("package.json", undefined, pkg({ name: "x" }))).toStrictEqual([]);
  expect(parts("package.json")).toStrictEqual([]);
});

test.each(["{", "[]", "null", "1", '"x"'])(
  "読めないか、オブジェクトでない package.json（%s）は両方の項目を検出する",
  (text) => {
    const all = ["package.json の scripts", "package.json の devDependencies"];
    expect(parts("package.json", text, text)).toStrictEqual(all);
    expect(parts("package.json", pkgBefore, text)).toStrictEqual(all);
    expect(parts("package.json", text, pkgBefore)).toStrictEqual(all);
  },
);

const before = [
  "# incremental-game",
  "",
  "前置き",
  "",
  "## 現在の段階",
  "",
  "- 基盤を構築中",
  "",
  "## ゲームの設計原則",
  "",
  "- 気持ちよさ",
  "",
  "### 細目",
  "",
  "- 細目の本文",
  "",
  "## 設計と根拠",
  "",
  "根拠",
  "",
  "## 検証",
  "",
  "検証の本文",
  "",
  "## 技術方針",
  "",
  "方針",
  "",
  "## 保護範囲",
  "",
  "保護の本文",
  "",
  "## 作業環境",
  "",
  "- 作業",
  "",
].join("\n");
const edit = (from: string, to: string): string => {
  if (!before.includes(from)) {
    throw new Error(`書き換える箇所が無い: ${from}`);
  }
  return before.replace(from, to);
};

test.each([
  {
    name: "設計原則の本文",
    after: edit("- 気持ちよさ", "- 気持ちよさを変える"),
    expected: "ゲームの設計原則",
  },
  {
    name: "節の中の小見出しの下",
    after: edit("- 細目の本文", "- 細目を変える"),
    expected: "ゲームの設計原則",
  },
  { name: "設計と根拠", after: edit("根拠\n", "根拠を変える\n"), expected: "設計と根拠" },
  { name: "検証", after: edit("検証の本文", "検証の本文を変える"), expected: "検証" },
  { name: "技術方針", after: edit("方針\n", "方針を変える\n"), expected: "技術方針" },
  { name: "保護範囲の本文", after: edit("保護の本文", ""), expected: "保護範囲" },
  {
    name: "保護範囲の末尾に行を足す",
    after: edit("保護の本文\n", "保護の本文\n追加\n"),
    expected: "保護範囲",
  },
  {
    name: "見出しを変える",
    after: edit("## 保護範囲", "## 保護範囲（旧）"),
    expected: "保護範囲",
  },
  {
    name: "見出しの段を下げる",
    after: edit("## 保護範囲", "### 保護範囲"),
    expected: "技術方針・保護範囲",
  },
  {
    name: "節を途中で区切る",
    after: edit("保護の本文", "## 別の節\n保護の本文"),
    expected: "保護範囲",
  },
  {
    name: "節を途中で 1 段目の見出しで区切る",
    after: edit("保護の本文", "# 別の章\n保護の本文"),
    expected: "保護範囲",
  },
  {
    name: "同じ見出しの節を足す",
    after: `${before}## 保護範囲\n\n足した本文\n`,
    expected: "保護範囲",
  },
] as const)("$name を変えると「$expected」節を検出する", ({ after, expected }) => {
  expect(parts("AGENTS.md", before, after)).toStrictEqual(
    expected.split("・").map((name) => `AGENTS.md の「${name}」節`),
  );
});

test.each([
  { name: "前置き", after: edit("前置き", "前置きを変える") },
  { name: "保護しない節", after: edit("- 基盤を構築中", "- 基盤を構築した") },
  { name: "保護しない節の後", after: `${before}## 役割\n\n本文\n` },
  {
    name: "節の順序",
    after: before
      .replace("## 作業環境\n\n- 作業\n\n", "")
      .replace("## 現在の段階", "## 作業環境\n\n- 作業\n\n## 現在の段階"),
  },
  { name: "見出しに似た行（# の後に空白が無い）", after: edit("- 作業", "##作業") },
] as const)("$name を変えても検出しない", ({ after }) => {
  expect(parts("AGENTS.md", before, after)).toStrictEqual([]);
});

test("保護範囲の節の後に 1 段目の見出しを置くと、その下は節に含めない", () => {
  const withChapter = edit("## 作業環境", "# 付録\n\n付録の本文\n\n## 作業環境");
  expect(
    parts("AGENTS.md", withChapter, withChapter.replace("付録の本文", "付録を変える")),
  ).toStrictEqual([]);
});

test("ファイルを消すと、すべての保護対象の節を検出し、足すとあった節を検出する", () => {
  const all = ["ゲームの設計原則", "設計と根拠", "検証", "技術方針", "保護範囲"].map(
    (name) => `AGENTS.md の「${name}」節`,
  );
  expect(parts("AGENTS.md", before)).toStrictEqual(all);
  expect(parts("AGENTS.md", undefined, before)).toStrictEqual(all);
  expect(parts("AGENTS.md", undefined, "## 検証\n")).toStrictEqual(["AGENTS.md の「検証」節"]);
});

test.each([
  { path: "package.json", expected: true },
  { path: "AGENTS.md", expected: true },
  { path: "src/package.json", expected: false },
  { path: "docs/AGENTS.md", expected: false },
  { path: "agents.md", expected: false },
  { path: "CLAUDE.md", expected: false },
] as const)("$path の内容を比べるか: $expected", ({ path, expected }) => {
  expect(contentsNeeded(path)).toBe(expected);
});

test("ほかのパスは内容を比べない", () => {
  expect(
    contentChanges("src/package.json", { before: "{}", after: '{"scripts":{}}' }),
  ).toStrictEqual([]);
  expect(contentChanges("CLAUDE.md", { before: "## 検証\n", after: "" })).toStrictEqual([]);
});
