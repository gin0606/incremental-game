import { expect, test } from "vitest";

import type { Worktree } from "./worktrees.ts";
import {
  lastSegment,
  lockOwner,
  parseWorktreeList,
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
