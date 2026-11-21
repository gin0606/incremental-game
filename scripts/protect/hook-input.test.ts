import { expect, test } from "vitest";

import { PROTECTED_WORKER, denial, parseHookInput, restricted } from "./hook-input.ts";

test("サブエージェントの入力から agent_type・file_path・cwd を読む", () => {
  expect(
    parseHookInput({
      session_id: "s",
      cwd: "/r/.claude/worktrees/agent-1",
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/r/lefthook.yml", old_string: "a", new_string: "b" },
      agent_id: "1",
      agent_type: "worker",
    }),
  ).toStrictEqual({
    agentType: "worker",
    filePath: "/r/lefthook.yml",
    cwd: "/r/.claude/worktrees/agent-1",
  });
});

test("メインエージェントの入力には agent_type が無く、cwd も省ける", () => {
  expect(parseHookInput({ tool_input: { file_path: "a.ts" } })).toStrictEqual({
    agentType: undefined,
    filePath: "a.ts",
    cwd: undefined,
  });
});

test.each([
  { name: "null", value: null, message: "hook の入力がオブジェクトでない。" },
  { name: "文字列", value: "x", message: "hook の入力がオブジェクトでない。" },
  {
    name: "文字列でない agent_type",
    value: { agent_type: 1, tool_input: { file_path: "a" } },
    message: "hook の入力の agent_type が文字列でない。",
  },
  {
    name: "null の agent_type",
    value: { agent_type: null, tool_input: { file_path: "a" } },
    message: "hook の入力の agent_type が文字列でない。",
  },
  {
    name: "文字列でない cwd",
    value: { cwd: 1, tool_input: { file_path: "a" } },
    message: "hook の入力の cwd が文字列でない。",
  },
  {
    name: "tool_input が無い",
    value: {},
    message: "hook の入力に tool_input.file_path が無い。",
  },
  {
    name: "tool_input が null",
    value: { tool_input: null },
    message: "hook の入力に tool_input.file_path が無い。",
  },
  {
    name: "tool_input が文字列",
    value: { tool_input: "a" },
    message: "hook の入力に tool_input.file_path が無い。",
  },
  {
    name: "file_path が空",
    value: { tool_input: { file_path: "" } },
    message: "hook の入力に tool_input.file_path が無い。",
  },
  {
    name: "file_path が文字列でない",
    value: { tool_input: { file_path: 1 } },
    message: "hook の入力に tool_input.file_path が無い。",
  },
] as const)("$name の入力は読めない", ({ value, message }) => {
  expect(() => parseHookInput(value)).toThrow(message);
});

test.each([
  { agentType: undefined, expected: false },
  { agentType: PROTECTED_WORKER, expected: false },
  { agentType: "worker", expected: true },
  { agentType: "general-purpose", expected: true },
  { agentType: "", expected: true },
  { agentType: "Protected-Worker", expected: true },
] as const)(
  "agent_type が $agentType のとき拒否する相手か: $expected",
  ({ agentType, expected }) => {
    expect(restricted(agentType)).toBe(expected);
  },
);

test("protected-worker の名前はサブエージェントの定義と揃える", () => {
  expect(PROTECTED_WORKER).toBe("protected-worker");
});

test("拒否の出力は PreToolUse の deny で、理由に検出した内容を並べる", () => {
  expect(JSON.parse(denial(["a", "b"]))).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: [
        "AGENTS.md「保護範囲」節に当たるパスで、監督役の判断が要る。",
        "a",
        "b",
        "Bash などで迂回せず、この変更をせずに作業を続けるか終え、必要な変更とその理由を監督役に報告する。",
      ].join("\n"),
    },
  });
});
