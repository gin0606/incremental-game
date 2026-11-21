// 監督セッションで保護範囲のパスへの Edit・Write を拒否する hook（cli/hook.ts）の入力と出力。

/** hook に拒否されずに保護範囲を変更できるサブエージェント（.claude/agents/protected-worker.md）。 */
export const PROTECTED_WORKER = "protected-worker";

export interface HookInput {
  /** サブエージェントの中の呼び出しでだけ付く、そのサブエージェントの定義の name。 */
  readonly agentType: string | undefined;
  readonly filePath: string;
  readonly cwd: string | undefined;
}

const field = (value: object, key: string): unknown => new Map(Object.entries(value)).get(key);

/** PreToolUse の入力（JSON を読んだ値）から、拒否を決めるのに使う項目を読む。読めなければ失敗する。 */
export const parseHookInput = (value: unknown): HookInput => {
  if (typeof value !== "object" || value === null) {
    throw new Error("hook の入力がオブジェクトでない。");
  }
  const agentType = field(value, "agent_type");
  const cwd = field(value, "cwd");
  const toolInput = field(value, "tool_input");
  const filePath =
    typeof toolInput === "object" && toolInput !== null ? field(toolInput, "file_path") : undefined;
  if (agentType !== undefined && typeof agentType !== "string") {
    throw new Error("hook の入力の agent_type が文字列でない。");
  }
  if (cwd !== undefined && typeof cwd !== "string") {
    throw new Error("hook の入力の cwd が文字列でない。");
  }
  if (typeof filePath !== "string" || filePath === "") {
    throw new Error("hook の入力に tool_input.file_path が無い。");
  }
  return { agentType, filePath, cwd };
};

/** 保護範囲のパスへの書き込みを拒否する相手か。メインエージェント（agent_type が無い）と protected-worker は拒否しない。 */
export const restricted = (agentType: string | undefined): boolean =>
  agentType !== undefined && agentType !== PROTECTED_WORKER;

/** 拒否するときに標準出力へ書く PreToolUse の出力。 */
export const denial = (reasons: readonly string[]): string =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: [
        "AGENTS.md「保護範囲」節に当たるパスで、監督役の判断が要る。",
        ...reasons,
        "Bash などで迂回せず、この変更をせずに作業を続けるか終え、必要な変更とその理由を監督役に報告する。",
      ].join("\n"),
    },
  });
