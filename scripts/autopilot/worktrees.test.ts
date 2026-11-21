import { expect, test } from "vitest";

import type { SessionAfter, Worktree } from "./worktrees.ts";
import {
  afterSession,
  lastSegment,
  lockOwner,
  parseWorktreeList,
  roundWorkers,
  sessionWorkers,
  unlockTargets,
} from "./worktrees.ts";

const ROOT = "/repo";
const DIRECTORY = `${ROOT}/.claude/worktrees`;

test("worktree の一覧から、パス・ブランチ・lock の理由を読む", () => {
  const output = [
    `worktree ${ROOT}`,
    "HEAD aaaa",
    "branch refs/heads/main",
    "",
    `worktree ${DIRECTORY}/supervise-1`,
    "HEAD bbbb",
    "branch refs/heads/worktree-supervise-1",
    "locked claude session supervise-1 (pid 12)",
    "",
    `worktree ${DIRECTORY}/agent-a1`,
    "HEAD cccc",
    "detached",
    "locked",
    "prunable gitdir file points to non-existent location",
    "",
    "branch refs/heads/orphan",
    "",
  ].join("\0");
  expect(parseWorktreeList(output)).toStrictEqual([
    { path: ROOT, branch: "main", lock: undefined },
    {
      path: `${DIRECTORY}/supervise-1`,
      branch: "worktree-supervise-1",
      lock: "claude session supervise-1 (pid 12)",
    },
    { path: `${DIRECTORY}/agent-a1`, branch: undefined, lock: "" },
  ]);
  expect(parseWorktreeList("")).toStrictEqual([]);
  expect(parseWorktreeList("locked x\0branch refs/heads/b")).toStrictEqual([]);
  expect(parseWorktreeList(`worktree ${ROOT}\0lockedx\0branch refs/tags/v1`)).toStrictEqual([
    { path: ROOT, branch: undefined, lock: undefined },
  ]);
});

test("lock の理由からプロセスの識別子を読む", () => {
  expect(lockOwner("claude session supervise-1 (pid 123)")).toBe(123);
  expect(lockOwner("claude agent a1 (pid 9)")).toBe(9);
  expect(lockOwner("claude session supervise-1 (pid 54725 start Fri Nov 20 16:02:54 2026)")).toBe(
    54_725,
  );
  expect(lockOwner("(pid 12 started)")).toBeUndefined();
  expect(lockOwner("(pid 12 start x")).toBeUndefined();
  expect(lockOwner("")).toBeUndefined();
  expect(lockOwner("(pid 0)")).toBeUndefined();
  expect(lockOwner("pid 12")).toBeUndefined();
});

test("パスの最後の要素を返す", () => {
  expect(lastSegment("/a/b/agent-1")).toBe("agent-1");
  expect(lastSegment("agent-1")).toBe("agent-1");
});

const locked = (path: string, lock?: string): Worktree => ({
  path,
  branch: undefined,
  lock,
});

const session = locked(
  `${DIRECTORY}/supervise-1`,
  "claude session supervise-1 (pid 10 start Fri Nov 20 16:02:54 2026)",
);
const worker = locked(
  `${DIRECTORY}/agent-a1`,
  "claude agent a1 (pid 10 start Fri Nov 20 16:03:00 2026)",
);
const otherWorker = locked(`${DIRECTORY}/agent-a2`, "claude agent a2 (pid 20)");
const interactive = locked(`${DIRECTORY}/agent-a3`, "claude agent a3 (pid 30)");
const manual = locked(`${DIRECTORY}/agent-a4`, "manual");
const unlocked = locked(`${DIRECTORY}/agent-a5`);
const nested = locked(`${DIRECTORY}/x/agent-a6`, "claude agent a6 (pid 10)");
const elsewhere = locked(`/elsewhere/agent-a7`, "claude agent a7 (pid 10)");
const notAgent = locked(`${DIRECTORY}/work-a8`, "claude agent a8 (pid 10)");
const ALL = [
  locked(ROOT),
  session,
  worker,
  otherWorker,
  interactive,
  manual,
  unlocked,
  nested,
  elsewhere,
  notAgent,
];

test("worker の worktree は、lock の持ち主がそのセッションのプロセスである agent-* だけ", () => {
  expect(sessionWorkers(ALL, DIRECTORY, [10])).toStrictEqual([worker]);
  expect(sessionWorkers(ALL, DIRECTORY, [10, 20])).toStrictEqual([worker, otherWorker]);
  expect(sessionWorkers(ALL, DIRECTORY, [])).toStrictEqual([]);
});

test("持ち主の終わった監督セッションの worktree と、その worker の worktree の lock だけを外す", () => {
  const oldSession = locked(`${DIRECTORY}/supervise-0`, "claude session supervise-0 (pid 20)");
  const running = locked(`${DIRECTORY}/supervise-2`, "claude session supervise-2 (pid 30)");
  const noPid = locked(`${DIRECTORY}/supervise-3`, "manual");
  const nestedSession = locked(`${DIRECTORY}/x/supervise-4`, "claude session supervise-4 (pid 40)");
  const unlockedSession = locked(`${DIRECTORY}/supervise-5`);
  const targets = unlockTargets(
    [...ALL, oldSession, running, noPid, nestedSession, unlockedSession],
    DIRECTORY,
    (pid) => pid === 30,
  );
  expect(targets).toStrictEqual([session, oldSession, worker, otherWorker]);
});

test("持ち主が動いている監督セッションの worktree と worker の worktree は外さない", () => {
  expect(unlockTargets([session, worker], DIRECTORY, () => true)).toStrictEqual([]);
});

test("この回の worker の worktree から、セッションの前から在ったものを除く", () => {
  expect(roundWorkers(ALL, DIRECTORY, [10, 20], [otherWorker.path])).toStrictEqual([worker]);
  expect(roundWorkers(ALL, DIRECTORY, [10], [])).toStrictEqual([worker]);
});

// この回のセッション（pid 10）の前から在り、終わったプロセスの同じ識別子で lock されたほかのセッションの worktree。
const stale = locked(
  `${DIRECTORY}/agent-s1`,
  "claude agent s1 (pid 10 start Thu Nov 19 09:00:00 2026)",
);
// セッションの間に終わって lock が外れた worker の worktree と、セッションの前から在った lock の無い worktree。
const finished = locked(`${DIRECTORY}/agent-f1`);
const preexistingFinished = locked(`${DIRECTORY}/agent-f0`);
// 前のドライバが中断した回のセッションと、その worker。
const oldSession = locked(`${DIRECTORY}/supervise-0`, "claude session supervise-0 (pid 20)");
const oldWorker = locked(`${DIRECTORY}/agent-o1`, "claude agent o1 (pid 20)");

const after = (overrides: Partial<SessionAfter> = {}): ReturnType<typeof afterSession> =>
  afterSession({
    worktrees: [
      locked(ROOT),
      session,
      worker,
      stale,
      finished,
      preexistingFinished,
      interactive,
      oldSession,
      oldWorker,
    ],
    directory: DIRECTORY,
    session: session.path,
    pid: 10,
    before: [
      ROOT,
      stale.path,
      preexistingFinished.path,
      interactive.path,
      oldSession.path,
      oldWorker.path,
    ],
    seen: [finished.path, preexistingFinished.path],
    // この回のセッションのプロセスの識別子が再利用されて動いているように見える。
    isAlive: (pid) => pid === 10 || pid === 30,
    ...overrides,
  });

test("回の後、セッションの前から在る worktree は、lock の持ち主がこの回のプロセスに見えても外さず、worker にしない", () => {
  expect(after()).toStrictEqual({
    unlock: [oldSession, oldWorker, session, worker],
    workers: [worker, finished],
  });
});

test("回の後、セッションのプロセスが終わっていても、セッションの前から在る worktree の lock は外さない", () => {
  expect(
    after({ worktrees: [session, worker, stale], seen: [], isAlive: () => false }),
  ).toStrictEqual({ unlock: [session, worker], workers: [worker] });
});

test("回の後、起動したプロセスと、セッション用の worktree の lock が示すプロセスの両方を持ち主にする", () => {
  const relocked = locked(session.path, "claude session supervise-1 (pid 40)");
  const lockWorker = locked(`${DIRECTORY}/agent-b1`, "claude agent b1 (pid 40)");
  expect(after({ worktrees: [relocked, worker, lockWorker], seen: [] })).toStrictEqual({
    unlock: [relocked, lockWorker, worker],
    workers: [worker, lockWorker],
  });
});

test("回の後、lock の理由を読めなくても、この回のセッション用の worktree と、起動したプロセスの worker の lock は外す", () => {
  const odd = locked(session.path, "claude session supervise-1");
  expect(after({ worktrees: [odd, worker, stale], seen: [] })).toStrictEqual({
    unlock: [odd, worker],
    workers: [worker],
  });
});

test("回の後、起動できなかったセッションでは、セッション用の worktree の lock が示すプロセスを持ち主にする", () => {
  expect(after({ worktrees: [session, worker, stale], pid: undefined, seen: [] })).toStrictEqual({
    unlock: [session, worker],
    workers: [worker],
  });
  expect(
    after({ worktrees: [locked(session.path), worker, stale], pid: undefined, seen: [] }),
  ).toStrictEqual({ unlock: [], workers: [] });
});
