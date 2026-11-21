import { expect, test } from "vitest";

import { parseNameStatus, parseUnifiedDiff } from "./git-output.ts";

test("状態とパスの組を順に読む", () => {
  expect(parseNameStatus("M\0src/a b.ts\0A\0.claude/x\nmd\0D\0lefthook.yml\0")).toStrictEqual([
    { status: "M", path: "src/a b.ts" },
    { status: "A", path: ".claude/x\nmd" },
    { status: "D", path: "lefthook.yml" },
  ]);
});

test("変更が無ければ空", () => {
  expect(parseNameStatus("")).toStrictEqual([]);
});

test.each(["M\0a.ts", "M\0a.ts\0A", "M\0", "M\0a.ts\0A\0", "M\0a.ts\0\0"])(
  "組にならない出力（%j）は拒む",
  (output) => {
    expect(() => parseNameStatus(output)).toThrow(
      `git diff --name-status -z の出力を読めない: ${JSON.stringify(output)}`,
    );
  },
);

test("最初の hunk より前の見出しを読まず、追加・削除された行を集める", () => {
  const output = [
    "diff --git a/x.ts b/x.ts",
    "index 1..2 100644",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -1 +1,2 @@ const x = 0;",
    "-const a = 1;",
    "+// oxlint-disable-next-line",
    "+const a = 2;",
    "@@ -10,0 +11 @@ function f() {",
    "++x",
    "@@ -20 +20,0 @@",
    "---y",
    "-",
    String.raw`\ No newline at end of file`,
    "",
  ].join("\n");
  expect(parseUnifiedDiff(output)).toStrictEqual({
    added: ["// oxlint-disable-next-line", "const a = 2;", "+x"],
    removed: ["const a = 1;", "--y", ""],
  });
});

test("hunk の無い出力（バイナリ、モードだけの変更）からは何も集めない", () => {
  expect(
    parseUnifiedDiff("diff --git a/x b/x\nold mode 100644\nnew mode 100755\n+++ b/x\n--- a/x\n"),
  ).toStrictEqual({ added: [], removed: [] });
});
