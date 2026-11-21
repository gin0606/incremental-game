import type { Json } from "./json.ts";
import { isObject, NOT_JSON, parseJson } from "./json.ts";

// 監督セッションが worktree の `.tmp/supervise/result.json` に書く結果の読み方。項目の意味は
// .claude/skills/supervise/SKILL.md の「結果ファイル」節による。

export type Status = "ready" | "nothing" | "failed";

export interface Completion {
  readonly id: string;
  readonly reason: string;
}

export interface RoundResult {
  readonly status: Status;
  readonly branch: string;
  readonly base: string;
  readonly head: string;
  readonly group: string | null;
  readonly completions: readonly Completion[];
  readonly summary: string;
}

export type ResultParse =
  | { readonly ok: true; readonly result: RoundResult }
  | { readonly ok: false; readonly error: string };

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/v;

// `axon complete` に渡す ID。`-` で始まる値を option として読ませない。
const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_\-]*$/v;

const STATUSES: readonly string[] = ["ready", "nothing", "failed"] satisfies readonly Status[];

const isStatus = (value: unknown): value is Status =>
  typeof value === "string" && STATUSES.includes(value);

/**
 * `axon complete` が受け付ける理由（空白だけでなく、改行・タブなどの制御文字を含まない 500 文字以内。文字は UTF-16 の
 * 単位で数え、多めに断る）。
 */
const isReason = (reason: string): boolean =>
  reason.trim() !== "" && !/\p{Cc}/v.test(reason) && reason.length <= 500;

const isCompletion = (value: unknown): value is Completion =>
  isObject(value) &&
  typeof value["id"] === "string" &&
  ENTITY_ID.test(value["id"]) &&
  typeof value["reason"] === "string" &&
  isReason(value["reason"]);

const isCompletions = (value: unknown): value is readonly Completion[] =>
  Array.isArray(value) && value.every((item: unknown) => isCompletion(item));

const isCommit = (value: unknown): value is string =>
  typeof value === "string" && COMMIT.test(value);

/** 項目を順に確かめ、満たさない最初の項目の理由か、読んだ結果を返す。ほかの項目は読まない。 */
const readResult = (value: Json): RoundResult | string => {
  const { status, branch, base, head, group, completions, summary } = value;
  if (!isStatus(status)) {
    return "status が ready・nothing・failed のどれでもない";
  }
  if (typeof branch !== "string") {
    return "branch が文字列でない";
  }
  if (!isCommit(base) || !isCommit(head)) {
    return "base か head が commit の hash でない";
  }
  if (group !== null && typeof group !== "string") {
    return "group が文字列でも null でもない";
  }
  if (!isCompletions(completions)) {
    return "completions が {id, reason} の並びでない（id は英数字で始まり、reason は空白だけでなく制御文字を含まない 500 文字以内）";
  }
  if (typeof summary !== "string") {
    return "summary が文字列でない";
  }
  return { status, branch, base, head, group, completions, summary };
};

/** result.json の内容を読む。JSON でない、または項目が欠けた・型が違うものは理由を返す。 */
export const parseResultFile = (text: string): ResultParse => {
  const value = parseJson(text);
  if (value === NOT_JSON) {
    return { ok: false, error: "JSON として読めない" };
  }
  if (!isObject(value)) {
    return { ok: false, error: "JSON のオブジェクトでない" };
  }
  const result = readResult(value);
  return typeof result === "string" ? { ok: false, error: result } : { ok: true, result };
};
