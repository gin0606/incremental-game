import type { Json } from "./json.ts";
import { isObject, NOT_JSON, parseJson } from "./json.ts";

// 監督セッション（`claude -p --output-format stream-json --verbose`）の出力の読み方。1 行に 1 つの JSON の
// メッセージが並び、最後に `type: "result"` のメッセージが来る。形は Claude Code の Agent SDK の文書
// （TypeScript の SDKMessage）による。

export interface SessionOutput {
  /** 最後の `type: "result"` のメッセージ。セッションが途中で終わると無い。 */
  readonly result: Json | undefined;
  /**
   * 利用上限に達したことを示すメッセージの要約。文書では、プランの上限に達したターンは assistant の
   * `error: "rate_limit"` で終わり、結果の `api_error_status` に 429 が入る。`rate_limit_event` の
   * `status: "rejected"` も上限による拒否を表す。
   */
  readonly usageLimit: readonly string[];
  /** JSON として読めなかった行の数（途中で切れた最後の行など）。空行は数えない。 */
  readonly unreadableLines: number;
}

const usageLimitSign = (message: Json): string | undefined => {
  if (message["type"] === "assistant" && message["error"] === "rate_limit") {
    return 'assistant の error が "rate_limit"';
  }
  if (message["type"] === "result" && message["api_error_status"] === 429) {
    return "結果の api_error_status が 429";
  }
  const info = message["rate_limit_info"];
  // 使用量の追加分（overage）で続けているときは、上限に達しても要求は止まらない（Claude Code も止まる扱いにしない）。
  if (
    message["type"] === "rate_limit_event" &&
    isObject(info) &&
    info["status"] === "rejected" &&
    info["isUsingOverage"] !== true &&
    info["overageInUse"] !== true
  ) {
    return `rate_limit_event の status が "rejected"（${JSON.stringify(info)}）`;
  }
  return undefined;
};

/** stream-json の出力を読む。JSON のオブジェクトでない行は飛ばす。 */
export const parseSessionOutput = (text: string): SessionOutput => {
  let result: Json | undefined;
  const usageLimit: string[] = [];
  let unreadableLines = 0;
  for (const line of text.split("\n").filter((entry) => entry.trim() !== "")) {
    const message = parseJson(line);
    if (message === NOT_JSON) {
      unreadableLines += 1;
    }
    if (!isObject(message)) {
      continue;
    }
    if (message["type"] === "result") {
      result = message;
    }
    const sign = usageLimitSign(message);
    if (sign !== undefined) {
      usageLimit.push(sign);
    }
  }
  return { result, usageLimit, unreadableLines };
};

const RESULT_FIELDS = [
  "subtype",
  "is_error",
  "api_error_status",
  "terminal_reason",
  "duration_ms",
  "num_turns",
  "total_cost_usd",
] as const;

/** ログに残す結果の項目。許可の拒否とサブエージェントの集計は、そのまま JSON で残す。 */
export const resultDigest = (result: Json | undefined): readonly string[] => {
  if (result === undefined) {
    return ["結果のメッセージが無い（セッションが途中で終わった）"];
  }
  const fields = RESULT_FIELDS.map((name) => `${name}=${JSON.stringify(result[name] ?? null)}`);
  const denials = result["permission_denials"];
  return [
    fields.join(" "),
    `permission_denials（${Array.isArray(denials) ? denials.length : 0} 件）: ${JSON.stringify(denials ?? null)}`,
    `subagent_stats: ${JSON.stringify(result["subagent_stats"] ?? null)}`,
  ];
};
