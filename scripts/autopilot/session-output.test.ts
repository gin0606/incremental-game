import { expect, test } from "vitest";

import { parseSessionOutput, resultDigest } from "./session-output.ts";

const lines = (...messages: readonly unknown[]): string =>
  messages.map((message) => JSON.stringify(message)).join("\n");

const RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  api_error_status: null,
  terminal_reason: "completed",
  duration_ms: 2_142_922,
  num_turns: 91,
  total_cost_usd: 10.8,
  permission_denials: [{ tool_name: "Bash", tool_input: { command: "x" } }],
  subagent_stats: { spawned: 2 },
};

test("最後の結果のメッセージを返し、JSON でない行とオブジェクトでない行は飛ばす", () => {
  const output = parseSessionOutput(
    [
      lines({ type: "system", subtype: "init" }, { type: "result", subtype: "first" }),
      "not json",
      "[1,2]",
      "null",
      "",
      lines(RESULT),
      '{"type":"assistant"',
    ].join("\n"),
  );
  expect(output).toStrictEqual({ result: RESULT, usageLimit: [], unreadableLines: 2 });
});

test("結果のメッセージが無ければ undefined", () => {
  expect(parseSessionOutput(lines({ type: "assistant" }))).toStrictEqual({
    result: undefined,
    usageLimit: [],
    unreadableLines: 0,
  });
  expect(parseSessionOutput(" \n\n").unreadableLines).toBe(0);
});

test("利用上限に達したことを示すメッセージを、出てきた順にすべて拾う", () => {
  const output = parseSessionOutput(
    lines(
      { type: "rate_limit_event", rate_limit_info: { status: "allowed" } },
      { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning" } },
      { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1 } },
      { type: "rate_limit_event", rate_limit_info: { status: "rejected", isUsingOverage: true } },
      { type: "rate_limit_event", rate_limit_info: { status: "rejected", overageInUse: true } },
      {
        type: "rate_limit_event",
        rate_limit_info: { status: "rejected", isUsingOverage: false, overageInUse: false },
      },
      { type: "rate_limit_event", rate_limit_info: "rejected" },
      { type: "rate_limit_event", status: "rejected" },
      { type: "assistant", error: "overloaded" },
      { type: "assistant", error: "rate_limit" },
      { type: "result", api_error_status: 500 },
      { type: "result", api_error_status: 429 },
      { type: "result", rate_limit_info: { status: "rejected" } },
    ),
  );
  expect(output.usageLimit).toStrictEqual([
    'rate_limit_event の status が "rejected"（{"status":"rejected","resetsAt":1}）',
    'rate_limit_event の status が "rejected"（{"status":"rejected","isUsingOverage":false,"overageInUse":false}）',
    'assistant の error が "rate_limit"',
    "結果の api_error_status が 429",
  ]);
});

test("ほかの種類のメッセージの同じ項目は、利用上限として拾わない", () => {
  expect(parseSessionOutput(lines({ type: "user", error: "rate_limit" })).usageLimit).toStrictEqual(
    [],
  );
  expect(
    parseSessionOutput(lines({ type: "system", api_error_status: 429 })).usageLimit,
  ).toStrictEqual([]);
});

test("結果の要約は、決めた項目と許可の拒否とサブエージェントの集計を並べる", () => {
  expect(resultDigest(RESULT)).toStrictEqual([
    'subtype="success" is_error=false api_error_status=null terminal_reason="completed" duration_ms=2142922 num_turns=91 total_cost_usd=10.8',
    'permission_denials（1 件）: [{"tool_name":"Bash","tool_input":{"command":"x"}}]',
    'subagent_stats: {"spawned":2}',
  ]);
  expect(resultDigest({ type: "result", permission_denials: "x" })).toStrictEqual([
    "subtype=null is_error=null api_error_status=null terminal_reason=null duration_ms=null num_turns=null total_cost_usd=null",
    'permission_denials（0 件）: "x"',
    "subagent_stats: null",
  ]);
  expect(resultDigest({ type: "result" })[1]).toBe("permission_denials（0 件）: null");
  expect(resultDigest(parseSessionOutput("").result)).toStrictEqual([
    "結果のメッセージが無い（セッションが途中で終わった）",
  ]);
});
