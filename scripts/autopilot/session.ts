// 監督セッションの起動の仕方（回の名前、引数、環境変数）と、次の回に渡す前の回の最終報告。起動の形は
// .claude/skills/supervise/SKILL.md と AGENTS.md「役割」の取り決めによる。

/** 回の名前。監督役は `supervise-` で始まらない回を failed で終える。時刻は UTC で、同じ秒の回は番号で分ける。 */
export const roundName = (now: number, taken: (name: string) => boolean): string => {
  const stamp = new Date(now).toISOString().replaceAll(/[\-:]/gv, "").slice(0, 15);
  const base = `supervise-${stamp.replace("T", "-")}`;
  let name = base;
  for (let suffix = 2; taken(name); suffix += 1) {
    name = `${base}-${String(suffix)}`;
  }
  return name;
};

/** `claude` に渡す引数。進み具合をログに残すため、stream-json で 1 行ずつ出させる（`--verbose` が要る）。 */
export const sessionArgs = (name: string, direction?: string): readonly string[] => [
  "-p",
  "--worktree",
  name,
  "--permission-mode",
  "auto",
  "--permission-prompts",
  "none",
  "--output-format",
  "stream-json",
  "--verbose",
  direction === undefined ? "/supervise" : `/supervise ${direction}`,
];

/**
 * 起動元の Claude Code のセッションが子のプロセスに渡す変数のうち、起動元のセッションを指すもの（識別子、通信の
 * ソケットとトークン、effort など）。起動元が終わった後も動くドライバの子には渡さない。`CLAUDE_CODE_` で始まる
 * 変数をまとめて外さないのは、認証やモデルの設定など利用者の設定もこの名前で渡るため。`CLAUDE_CODE_RETRY_WATCHDOG`
 * （利用上限の解除を待って続ける）も外す。利用上限に達したら止まり、自動では再開しない決まりのため。
 */
const LAUNCHER_VARIABLES: ReadonlySet<string> = new Set([
  "CLAUDECODE",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_ENV_FILE",
  "CLAUDE_CODE_BRIDGE_SESSION_ID",
  "CLAUDE_CODE_CHILD_NOTES_DIR",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_RETRY_WATCHDOG",
]);

const inherited = (name: string): boolean =>
  LAUNCHER_VARIABLES.has(name) ||
  name.startsWith("CLAUDE_PLUGIN_") ||
  name.startsWith("INCREMENTAL_GAME_");

const withoutLauncher = (
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined && !inherited(name)) {
      env[name] = value;
    }
  }
  return env;
};

/** ドライバが記録した Axon の操作の記録者。起動元のセッションのものにしない。 */
export const DRIVER_ACTOR = "incremental-game-driver";

/**
 * ドライバが実行するコマンド（axon・git・pnpm）の環境変数。起動元のセッションを指す変数を外し、Axon の記録者を
 * ドライバにする（外さないと、axon は起動元の Claude Code のセッションを記録者にする）。
 */
export const commandEnv = (
  base: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> => ({ ...withoutLauncher(base), AXON_ACTOR: DRIVER_ACTOR });

export interface SessionPaths {
  /** `CLAUDE_CODE_TMPDIR` にする回ごとのディレクトリ。 */
  readonly claudeTemp: string;
  /** `TMPDIR` にする回ごとのディレクトリ。 */
  readonly temp: string;
  /** 前の回の最終報告。無ければ渡さない。 */
  readonly previousReport: string | undefined;
}

/**
 * 監督セッションの環境変数。Bash の 1 回の実行が `BASH_DEFAULT_TIMEOUT_MS` を超えるとバックグラウンドに移り、
 * セッションが完了前に終わりうるため既定を長くし、上限は最も遅い検査（ミューテーションテスト）より長くする。
 * 最後のターンの後のバックグラウンド作業の待ちは、0（無期限）ではなく有限の大きな値にする。
 */
export const sessionEnv = (
  base: Readonly<Record<string, string | undefined>>,
  paths: SessionPaths,
): Readonly<Record<string, string>> => {
  return {
    ...withoutLauncher(base),
    INCREMENTAL_GAME_SUPERVISOR: "1",
    ...(paths.previousReport === undefined
      ? {}
      : { INCREMENTAL_GAME_PREVIOUS_REPORT: paths.previousReport }),
    BASH_DEFAULT_TIMEOUT_MS: "600000",
    BASH_MAX_TIMEOUT_MS: "1800000",
    CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "7200000",
    CLAUDE_CODE_TMPDIR: paths.claudeTemp,
    TMPDIR: paths.temp,
  };
};

export interface RoundRecord {
  readonly name: string;
  /** セッションの終わり方の説明。 */
  readonly ended: string;
  /** 取り込んだかの説明（取り込んだ commit、取り込まなかった理由）。 */
  readonly outcome: string;
  /** 実行しなかった、または実行に失敗した完了の ID。 */
  readonly failedCompletions: readonly string[];
  /** lock の持ち主がこの回のセッションのプロセスで、回の前には無かった worker の worktree。 */
  readonly agentWorktrees: readonly {
    readonly path: string;
    readonly branch: string | undefined;
  }[];
}

const list = <T>(items: readonly T[], format: (item: T) => string): string =>
  items.length === 0 ? "なし" : items.map((item) => format(item)).join("、");

/**
 * 次の回に `INCREMENTAL_GAME_PREVIOUS_REPORT` で渡すファイルの内容。監督役の最終報告の後に、ドライバが見た事実を
 * 足す。最終報告を書かずに終わった回（強制終了など）でも、その回の worker の worktree を次の回の監督役が前の回の
 * 残りとして処理できるよう、lock の持ち主と回の前の一覧から分かったその回の worker の worktree を挙げる。
 */
export const previousReport = (report: string | undefined, record: RoundRecord): string =>
  `${report?.trimEnd() ?? "（この回の監督セッションは最終報告を書かずに終わった。）"}

## ドライバの記録

監督セッションを起動したドライバが、回の後に書き足した。

- 回の名前: ${record.name}（セッション用ブランチ \`worktree-${record.name}\`）
- セッションの終わり方: ${record.ended}
- 取り込み: ${record.outcome}
- 実行できなかった完了（次の回が拾い直す）: ${list(record.failedCompletions, (id) => `\`${id}\``)}
- この回の worker の worktree とブランチ（lock の持ち主がこの回のセッションのプロセスで、回の前には無かったもの。lock を外した結果はドライバのログにある）: ${list(record.agentWorktrees, (worktree) => `\`${worktree.path}\`（${worktree.branch === undefined ? "ブランチなし" : `\`${worktree.branch}\``}）`)}
`;
