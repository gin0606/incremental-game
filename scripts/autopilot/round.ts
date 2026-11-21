import type { ResultParse, RoundResult } from "./result-file.ts";

// 1 回の監督セッションが終わった後の判断と、次の回を始めるかの判断。取り決めは
// .claude/skills/supervise/SKILL.md の「結果ファイル」節と AGENTS.md「役割」による。

/** セッションのプロセスの終わり方。 */
export interface SessionEnd {
  readonly exitCode: number | null;
  readonly signal: string | null;
  /** 1 回の時間の上限に達して、ドライバが止めた。 */
  readonly timedOut: boolean;
}

export interface SessionFacts {
  readonly end: SessionEnd;
  /** result.json を読んだ結果。ファイルが無ければ undefined。 */
  readonly result: ResultParse | undefined;
  readonly roundName: string;
  /** セッション用ブランチの先端。ブランチが無ければ undefined。 */
  readonly branchTip: string | undefined;
  /** 回の開始時の main。 */
  readonly mainAtStart: string;
  /** 最終報告（report.md）が書かれたか。 */
  readonly reportWritten: boolean;
}

/**
 * - `merge`: 取り込みの手順（完了の実行、記録の commit、main の fast-forward）に進む。
 * - `skip`: 取り込むものが無い。失敗として数えない。
 * - `failed`: 取り込まない。セッション用ブランチと worktree は次の回の監督役に処理させる。
 */
export type Verdict =
  | { readonly kind: "merge"; readonly result: RoundResult }
  | { readonly kind: "skip"; readonly result: RoundResult }
  | { readonly kind: "failed"; readonly reason: string };

export const branchName = (roundName: string): string => `worktree-${roundName}`;

const endProblem = (end: SessionEnd): string | undefined => {
  if (end.timedOut) {
    return "1 回の時間の上限に達したので止めた";
  }
  if (end.signal !== null) {
    return `セッションがシグナル ${end.signal} で終わった`;
  }
  return end.exitCode === 0
    ? undefined
    : `セッションが終了コード ${String(end.exitCode)} で終わった`;
};

const resultProblem = (facts: SessionFacts, result: RoundResult): string | undefined => {
  if (result.status === "failed") {
    return `監督役が failed と報告した: ${result.summary}`;
  }
  if (!facts.reportWritten) {
    return "report.md が書かれていない";
  }
  if (result.branch !== branchName(facts.roundName)) {
    return `result.json の branch（${result.branch}）がこの回のブランチでない`;
  }
  if (result.head !== facts.branchTip) {
    return `result.json の head（${result.head}）がセッション用ブランチの先端（${facts.branchTip ?? "ブランチが無い"}）と違う`;
  }
  if (result.base !== facts.mainAtStart) {
    return `result.json の base（${result.base}）が回の開始時の main（${facts.mainAtStart}）と違う`;
  }
  return undefined;
};

/** セッションが終わった後に、取り込むかを決める。失敗の理由は最初に見つけたものを返す。 */
export const judgeSession = (facts: SessionFacts): Verdict => {
  const ended = endProblem(facts.end);
  if (ended !== undefined) {
    return { kind: "failed", reason: ended };
  }
  if (facts.result === undefined) {
    return { kind: "failed", reason: "result.json が書かれていない" };
  }
  if (!facts.result.ok) {
    return { kind: "failed", reason: `result.json が読めない: ${facts.result.error}` };
  }
  const { result } = facts.result;
  const problem = resultProblem(facts, result);
  if (problem !== undefined) {
    return { kind: "failed", reason: problem };
  }
  const nothingToMerge =
    result.status === "nothing" && result.head === result.base && result.completions.length === 0;
  return { kind: nothingToMerge ? "skip" : "merge", result };
};

/**
 * 取り込みの手順の後に、回が失敗したかを決める。`ready` なのに main が進まなければ失敗にする（監督役が目標を
 * 終えたと報告したのに、成果が main に入っていない）。
 */
export const mergeProblem = (
  result: RoundResult,
  merged: boolean,
  mainBefore: string,
  mainAfter: string,
): string | undefined => {
  if (!merged) {
    return "取り込めなかった";
  }
  if (result.status === "ready" && mainAfter === mainBefore) {
    return "ready と報告されたが main が進まなかった";
  }
  return undefined;
};

export interface StopFacts {
  readonly now: number;
  readonly until: number;
  readonly stopFileExists: boolean;
  /** 取り込めた回を挟まずに失敗した回の数。 */
  readonly consecutiveFailures: number;
  readonly maxFailures: number;
  /** 取り込めた回を挟まずに `nothing` で終わった回の数。 */
  readonly consecutiveIdle: number;
  readonly maxIdle: number;
  readonly freeBytes: number;
  readonly minFreeBytes: number;
  /** 直前の回で見つけた、利用上限に達したことを示すメッセージ。 */
  readonly usageLimit: readonly string[];
  /** ドライバが受け取った終了のシグナル。 */
  readonly signal: string | undefined;
}

/** 回の結果の種類。`merged` は ready を取り込めた回、`nothing` は目標を進めずに終わった回（記録だけの取り込みを含む）。 */
export type RoundKind = "merged" | "nothing" | "failed";

/** 取り込みの後の回の種類。 */
export const roundKind = (failed: boolean, verdict: Verdict): RoundKind => {
  if (failed) {
    return "failed";
  }
  return verdict.kind === "merge" && verdict.result.status === "ready" ? "merged" : "nothing";
};

/** 止めるかの判断に使う回の数。 */
export interface Counts {
  readonly failures: number;
  readonly idle: number;
}

/**
 * 回の後の数。ready を取り込めた回だけが両方を 0 に戻す。失敗と nothing が交互に続いても、どちらかの上限で止まる
 * ようにするため、失敗の回は nothing の数を、nothing の回は失敗の数を戻さない。
 */
export const nextCounts = (counts: Counts, kind: RoundKind): Counts => {
  if (kind === "failed") {
    return { failures: counts.failures + 1, idle: counts.idle };
  }
  if (kind === "nothing") {
    return { failures: counts.failures, idle: counts.idle + 1 };
  }
  return { failures: 0, idle: 0 };
};

/** `.axon/`（Axon の記録）の外のパス。 */
export const outsideRecords = (paths: readonly string[]): readonly string[] =>
  paths.filter((path) => path !== "" && !path.startsWith(".axon/"));

/** 次の回を始めない理由。`expected` は、終了時刻か停止用ファイルによる予定どおりの停止か。 */
export interface Stop {
  readonly reason: string;
  readonly expected: boolean;
}

const failed = (reason: string): Stop => ({ reason, expected: false });

/** 次の回を始めない理由。始めてよければ undefined。 */
export const stopReason = (facts: StopFacts): Stop | undefined => {
  if (facts.signal !== undefined) {
    return failed(`シグナル ${facts.signal} を受け取った`);
  }
  if (facts.usageLimit.length > 0) {
    return failed(`利用上限に達した（自動では再開しない）: ${facts.usageLimit.join("、")}`);
  }
  if (facts.stopFileExists) {
    return { reason: "停止用ファイルがある", expected: true };
  }
  if (facts.now >= facts.until) {
    return { reason: "終了時刻を過ぎた", expected: true };
  }
  if (facts.consecutiveFailures >= facts.maxFailures) {
    return failed(`取り込めた回を挟まずに ${String(facts.consecutiveFailures)} 回失敗した`);
  }
  if (facts.consecutiveIdle >= facts.maxIdle) {
    // 監督役が目標を進めない回を、終了時刻まで起動し続けない（方向性の書き忘れや、目標が尽きたとき）。
    return failed(`取り込めた回を挟まずに ${String(facts.consecutiveIdle)} 回 nothing で終わった`);
  }
  if (facts.freeBytes < facts.minFreeBytes) {
    return failed(
      `ディスクの空き（${String(facts.freeBytes)} バイト）が閾値（${String(facts.minFreeBytes)} バイト）を下回った`,
    );
  }
  return undefined;
};
