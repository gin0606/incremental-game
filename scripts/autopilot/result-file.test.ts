import { expect, test } from "vitest";

import { parseResultFile } from "./result-file.ts";

const BASE = "2ef8950a95f701a0731b4e5f99f556f89480de47";
const HEAD = "b6ed3e460e65300f4d90ba83070b9f202c4e22cf";

const BAD_COMPLETIONS =
  "completions が {id, reason} の並びでない（id は英数字で始まり、reason は空白だけでなく制御文字を含まない 500 文字以内）";

const VALID = {
  status: "ready",
  branch: "worktree-supervise-1",
  base: BASE,
  head: HEAD,
  group: "game-group-1",
  completions: [
    { id: "game-task-1", reason: "done" },
    { id: "z1jv2waj", reason: `${"あ".repeat(499)}x` },
  ],
  summary: "要約",
};

const parse = (value: unknown): ReturnType<typeof parseResultFile> =>
  parseResultFile(JSON.stringify(value));

test("取り決めの項目をそろえた結果を読む", () => {
  expect(parse(VALID)).toStrictEqual({ ok: true, result: VALID });
  for (const status of ["nothing", "failed"]) {
    expect(parse({ ...VALID, status, group: null, completions: [] })).toStrictEqual({
      ok: true,
      result: { ...VALID, status, group: null, completions: [] },
    });
  }
  const sha256 = "a".repeat(64);
  expect(parse({ ...VALID, base: sha256, head: sha256 }).ok).toBe(true);
});

test("取り決めにない項目は読み捨てる", () => {
  expect(parse({ ...VALID, extra: 1 })).toStrictEqual({ ok: true, result: VALID });
});

test("JSON のオブジェクトでなければ理由を返す", () => {
  expect(parseResultFile("{")).toStrictEqual({ ok: false, error: "JSON として読めない" });
  for (const text of ["[]", "null", '"ready"']) {
    expect(parseResultFile(text)).toStrictEqual({ ok: false, error: "JSON のオブジェクトでない" });
  }
});

test("項目が欠けた・型が違う結果は、最初に見つけた理由を返す", () => {
  const cases: readonly (readonly [Readonly<Record<string, unknown>>, string])[] = [
    [{ status: "done" }, "status が ready・nothing・failed のどれでもない"],
    [{ status: undefined }, "status が ready・nothing・failed のどれでもない"],
    [{ status: 1, branch: 1 }, "status が ready・nothing・failed のどれでもない"],
    [{ branch: null }, "branch が文字列でない"],
    [{ branch: 1, base: "x" }, "branch が文字列でない"],
    [{ base: "x" }, "base か head が commit の hash でない"],
    [{ base: 1 }, "base か head が commit の hash でない"],
    [{ head: `${HEAD}0` }, "base か head が commit の hash でない"],
    [{ head: HEAD.toUpperCase() }, "base か head が commit の hash でない"],
    [{ head: `x${HEAD}` }, "base か head が commit の hash でない"],
    [{ head: undefined }, "base か head が commit の hash でない"],
    [{ group: 1 }, "group が文字列でも null でもない"],
    [{ group: undefined }, "group が文字列でも null でもない"],
    [{ completions: undefined }, BAD_COMPLETIONS],
    [{ completions: {} }, BAD_COMPLETIONS],
    [{ completions: [null] }, BAD_COMPLETIONS],
    [{ completions: [[]] }, BAD_COMPLETIONS],
    [{ completions: [{ id: "a", reason: "r" }, { id: "b" }] }, BAD_COMPLETIONS],
    [{ completions: [{ id: 1, reason: "r" }] }, BAD_COMPLETIONS],
    [{ completions: [{ id: "-r", reason: "r" }] }, BAD_COMPLETIONS],
    [{ completions: [{ id: "a b", reason: "r" }] }, BAD_COMPLETIONS],
    [{ completions: [{ id: "", reason: "r" }] }, BAD_COMPLETIONS],
    [{ summary: undefined }, "summary が文字列でない"],
  ];
  for (const [change, error] of cases) {
    expect(parse({ ...VALID, ...change })).toStrictEqual({ ok: false, error });
  }
  expect(parse({ ...VALID, completions: [{ id: "a_b-C9", reason: "r" }] }).ok).toBe(true);
});

test("axon complete が受け付けない理由の完了は読まない", () => {
  for (const reason of [
    "",
    "   ",
    " \t",
    "a\nb",
    "a\r",
    "a\tb",
    "a\u0000",
    "a\u007F",
    "x".repeat(501),
    `${"あ".repeat(500)}x`,
  ]) {
    expect(parse({ ...VALID, completions: [{ id: "a", reason }] }).ok).toBe(false);
  }
});
