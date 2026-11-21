import { expect, test } from "vitest";

import type { RoundResult } from "./result-file.ts";
import type { SessionFacts, StopFacts } from "./round.ts";
import {
  branchName,
  judgeSession,
  mergeProblem,
  nextCounts,
  outsideRecords,
  roundKind,
  stopReason,
} from "./round.ts";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);

const RESULT: RoundResult = {
  status: "ready",
  branch: "worktree-supervise-1",
  base: BASE,
  head: HEAD,
  group: null,
  completions: [],
  summary: "要約",
};

const facts = (
  change: Partial<SessionFacts> = {},
  result: Partial<RoundResult> = {},
): SessionFacts => ({
  end: { exitCode: 0, signal: null, timedOut: false },
  result: { ok: true, result: { ...RESULT, ...result } },
  roundName: "supervise-1",
  branchTip: HEAD,
  mainAtStart: BASE,
  reportWritten: true,
  ...change,
});

test("セッション用ブランチの名前は worktree- に回の名前を付けたもの", () => {
  expect(branchName("supervise-1")).toBe("worktree-supervise-1");
});

test("ready は取り込む", () => {
  expect(judgeSession(facts())).toStrictEqual({ kind: "merge", result: RESULT });
});

test("nothing は、commit も完了も無ければ取り込まず、どちらかがあれば取り込む", () => {
  const nothing = { status: "nothing", head: BASE } as const;
  expect(judgeSession(facts({ branchTip: BASE }, nothing))).toStrictEqual({
    kind: "skip",
    result: { ...RESULT, ...nothing },
  });
  const completions = [{ id: "x", reason: "r" }];
  expect(judgeSession(facts({ branchTip: BASE }, { ...nothing, completions })).kind).toBe("merge");
  expect(judgeSession(facts({}, { status: "nothing" })).kind).toBe("merge");
});

test("ready は、commit が無くても取り込みの手順に進む（main が進まなければ後で失敗にする）", () => {
  expect(judgeSession(facts({ branchTip: BASE }, { head: BASE })).kind).toBe("merge");
});

test("セッションの終わり方が正常でなければ、結果ファイルによらず失敗", () => {
  const cases: readonly (readonly [SessionFacts["end"], string])[] = [
    [{ exitCode: 1, signal: null, timedOut: false }, "セッションが終了コード 1 で終わった"],
    [{ exitCode: null, signal: null, timedOut: false }, "セッションが終了コード null で終わった"],
    [
      { exitCode: null, signal: "SIGKILL", timedOut: false },
      "セッションがシグナル SIGKILL で終わった",
    ],
    [
      { exitCode: 0, signal: "SIGTERM", timedOut: false },
      "セッションがシグナル SIGTERM で終わった",
    ],
    [{ exitCode: 0, signal: null, timedOut: true }, "1 回の時間の上限に達したので止めた"],
    [{ exitCode: null, signal: "SIGTERM", timedOut: true }, "1 回の時間の上限に達したので止めた"],
  ];
  for (const [end, reason] of cases) {
    expect(judgeSession(facts({ end }))).toStrictEqual({ kind: "failed", reason });
  }
});

test("結果ファイルが無い・読めない・取り決めと合わなければ失敗", () => {
  const cases: readonly (readonly [SessionFacts, string])[] = [
    [facts({ result: undefined }), "result.json が書かれていない"],
    [facts({ result: { ok: false, error: "壊れた" } }), "result.json が読めない: 壊れた"],
    [facts({}, { status: "failed", summary: "止まった" }), "監督役が failed と報告した: 止まった"],
    [facts({ reportWritten: false }), "report.md が書かれていない"],
    [facts({ reportWritten: false }, { status: "nothing" }), "report.md が書かれていない"],
    [
      facts({}, { branch: "worktree-supervise-2" }),
      "result.json の branch（worktree-supervise-2）がこの回のブランチでない",
    ],
    [
      facts({ branchTip: BASE }),
      `result.json の head（${HEAD}）がセッション用ブランチの先端（${BASE}）と違う`,
    ],
    [
      facts({ branchTip: undefined }),
      `result.json の head（${HEAD}）がセッション用ブランチの先端（ブランチが無い）と違う`,
    ],
    [
      facts({ mainAtStart: HEAD, branchTip: HEAD }, { base: BASE }),
      `result.json の base（${BASE}）が回の開始時の main（${HEAD}）と違う`,
    ],
  ];
  for (const [input, reason] of cases) {
    expect(judgeSession(input)).toStrictEqual({ kind: "failed", reason });
  }
});

test("failed は、最終報告が無くても、ブランチや head が取り決めと違っても failed の理由を返す", () => {
  expect(
    judgeSession(
      facts({ branchTip: undefined, reportWritten: false }, { status: "failed", summary: "s" }),
    ),
  ).toStrictEqual({
    kind: "failed",
    reason: "監督役が failed と報告した: s",
  });
});

test("取り込めなかった回と、ready なのに main が進まなかった回は失敗", () => {
  expect(mergeProblem(RESULT, false, BASE, BASE)).toBe("取り込めなかった");
  expect(mergeProblem(RESULT, false, BASE, HEAD)).toBe("取り込めなかった");
  expect(mergeProblem(RESULT, true, BASE, BASE)).toBe("ready と報告されたが main が進まなかった");
  expect(mergeProblem(RESULT, true, BASE, HEAD)).toBeUndefined();
  expect(mergeProblem({ ...RESULT, status: "nothing" }, true, BASE, BASE)).toBeUndefined();
});

const running: StopFacts = {
  now: 1000,
  until: 2000,
  stopFileExists: false,
  consecutiveFailures: 2,
  maxFailures: 3,
  consecutiveIdle: 1,
  maxIdle: 2,
  freeBytes: 100,
  minFreeBytes: 100,
  usageLimit: [],
  signal: undefined,
};

test("止める理由が無ければ次の回を始める", () => {
  expect(stopReason(running)).toBeUndefined();
});

test("止める理由は、予定どおりの停止かと一緒に返す", () => {
  const cases: readonly (readonly [Partial<StopFacts>, string, boolean])[] = [
    [{ signal: "SIGTERM" }, "シグナル SIGTERM を受け取った", false],
    [{ usageLimit: ["a", "b"] }, "利用上限に達した（自動では再開しない）: a、b", false],
    [{ stopFileExists: true }, "停止用ファイルがある", true],
    [{ now: 2000 }, "終了時刻を過ぎた", true],
    [{ now: 2001 }, "終了時刻を過ぎた", true],
    [{ consecutiveFailures: 3 }, "取り込めた回を挟まずに 3 回失敗した", false],
    [{ consecutiveFailures: 4 }, "取り込めた回を挟まずに 4 回失敗した", false],
    [{ consecutiveIdle: 2 }, "取り込めた回を挟まずに 2 回 nothing で終わった", false],
    [{ consecutiveIdle: 3 }, "取り込めた回を挟まずに 3 回 nothing で終わった", false],
    [{ freeBytes: 99 }, "ディスクの空き（99 バイト）が閾値（100 バイト）を下回った", false],
  ];
  for (const [change, reason, expected] of cases) {
    expect(stopReason({ ...running, ...change })).toStrictEqual({ reason, expected });
  }
});

test("理由が重なれば、シグナル・利用上限・停止用ファイル・終了時刻・失敗・nothing・ディスクの順に選ぶ", () => {
  const disk: StopFacts = { ...running, freeBytes: 0 };
  const idle: StopFacts = { ...disk, consecutiveIdle: 2 };
  const failures: StopFacts = { ...idle, consecutiveFailures: 3 };
  const time: StopFacts = { ...failures, now: 3000 };
  const stopFile: StopFacts = { ...time, stopFileExists: true };
  const usage: StopFacts = { ...stopFile, usageLimit: ["u"] };
  const all: StopFacts = { ...usage, signal: "SIGINT" };
  expect(
    [all, usage, stopFile, time, failures, idle, disk].map((input) => stopReason(input)?.reason),
  ).toStrictEqual([
    "シグナル SIGINT を受け取った",
    "利用上限に達した（自動では再開しない）: u",
    "停止用ファイルがある",
    "終了時刻を過ぎた",
    "取り込めた回を挟まずに 3 回失敗した",
    "取り込めた回を挟まずに 2 回 nothing で終わった",
    "ディスクの空き（0 バイト）が閾値（100 バイト）を下回った",
  ]);
});

test("Axon の記録の外のパスを選ぶ", () => {
  expect(outsideRecords([".axon/a", "", "src/a.ts", ".axon", "x/.axon/b"])).toStrictEqual([
    "src/a.ts",
    ".axon",
    "x/.axon/b",
  ]);
});

test("ready を取り込めた回だけが数を戻し、失敗と nothing は互いの数を戻さない", () => {
  const start = { failures: 2, idle: 1 };
  expect(nextCounts(start, "failed")).toStrictEqual({ failures: 3, idle: 1 });
  expect(nextCounts(start, "nothing")).toStrictEqual({ failures: 2, idle: 2 });
  expect(nextCounts(start, "merged")).toStrictEqual({ failures: 0, idle: 0 });
});

test("ready を取り込めた回だけを merged とし、取り込めなかった回は失敗、それ以外は nothing とする", () => {
  const merge = { kind: "merge", result: RESULT } as const;
  expect(roundKind(false, merge)).toBe("merged");
  expect(roundKind(true, merge)).toBe("failed");
  expect(roundKind(false, { kind: "merge", result: { ...RESULT, status: "nothing" } })).toBe(
    "nothing",
  );
  expect(roundKind(false, { kind: "skip", result: { ...RESULT, status: "nothing" } })).toBe(
    "nothing",
  );
  expect(roundKind(true, { kind: "failed", reason: "x" })).toBe("failed");
});
