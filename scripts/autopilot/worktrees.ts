// git の worktree の一覧の読み方と、ドライバが lock を外す worktree・次の回に伝える worker の worktree の選び方。

export interface Worktree {
  readonly path: string;
  /** `refs/heads/` を除いたブランチ名。detached なら undefined。 */
  readonly branch: string | undefined;
  /** lock の理由。lock されていなければ undefined、理由が無ければ空文字列。 */
  readonly lock: string | undefined;
}

/** `git worktree list --porcelain -z` の出力を読む。項目は NUL で区切られ、worktree の間に空の項目が入る。 */
export const parseWorktreeList = (output: string): readonly Worktree[] => {
  const worktrees: Worktree[] = [];
  let current: { path: string; branch: string | undefined; lock: string | undefined } | undefined;
  for (const field of output.split("\0")) {
    if (field.startsWith("worktree ")) {
      current = { path: field.slice("worktree ".length), branch: undefined, lock: undefined };
      worktrees.push(current);
    } else if (field === "") {
      current = undefined;
    } else if (current !== undefined && field.startsWith("branch refs/heads/")) {
      current.branch = field.slice("branch refs/heads/".length);
    } else if (current !== undefined && (field === "locked" || field.startsWith("locked "))) {
      current.lock = field.slice("locked ".length);
    }
  }
  return worktrees;
};

/**
 * lock の理由が示すプロセスの識別子。Claude Code は `claude session <名前> (pid 123 start <ps の lstart>)`・
 * `claude agent <ID> (pid 123 start ...)` の形で lock する（2.1.330 の実装）。` start ...` の無い形も読む。
 */
export const lockOwner = (reason: string): number | undefined => {
  const match = /\(pid (?<pid>[1-9]\d*)(?: start [^\)]*)?\)/v.exec(reason);
  const pid = match?.groups?.["pid"];
  return pid === undefined ? undefined : Number(pid);
};

export const lastSegment = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Claude Code が作った worktree（`<main checkout>/.claude/worktrees` の直下）のうち、名前が prefix で始まるもの。 */
const isCreatedBy = (worktree: Worktree, directory: string, prefix: string): boolean =>
  worktree.path === `${directory}/${lastSegment(worktree.path)}` &&
  lastSegment(worktree.path).startsWith(prefix);

const ownerOf = (worktree: Worktree): number | undefined =>
  worktree.lock === undefined ? undefined : lockOwner(worktree.lock);

const ownedBy = (worktree: Worktree, owners: readonly number[]): boolean => {
  const owner = ownerOf(worktree);
  return owner !== undefined && owners.includes(owner);
};

/**
 * 監督セッションの worker の worktree（`agent-*`）。Claude Code は worker の worktree を、それを起動したセッションの
 * プロセスの識別子で lock するので、lock の持ち主が owners のどれかであるものを選ぶ。名前や回の前後の一覧の差では
 * 選ばない。最終報告はほかのセッションの worktree の名前も挙げ、回の間にはほかのセッションも worktree を作りうるため。
 */
export const sessionWorkers = (
  worktrees: readonly Worktree[],
  directory: string,
  owners: readonly number[],
): readonly Worktree[] =>
  worktrees.filter(
    (worktree) => isCreatedBy(worktree, directory, "agent-") && ownedBy(worktree, owners),
  );

/**
 * この回の worker の worktree。`sessionWorkers` のうち、セッションを起動する前から在ったもの（`before` のパス）を除く。
 * Claude Code は lock を残したまま終わることがあり、終わったプロセスの識別子で lock された対話のセッションの
 * worktree が、同じ識別子を割り当てられたこの回のセッションのものに見えるため。
 */
export const roundWorkers = (
  worktrees: readonly Worktree[],
  directory: string,
  owners: readonly number[],
  before: readonly string[],
): readonly Worktree[] =>
  sessionWorkers(worktrees, directory, owners).filter(
    (worktree) => !before.includes(worktree.path),
  );

/**
 * lock を外す worktree。lock の持ち主が終わった監督セッションの worktree（`supervise-*`）と、その worker の worktree
 * だけを選ぶ。前のドライバのプロセスが中断した回のものも含む。ほかの worktree（対話のセッションのもの、持ち主の
 * 分からない lock）には触れない。持ち主の識別子が再利用されて動いているように見えるものは選ばない（回の後の
 * `afterSession` は、この回のセッション用の worktree と worker の worktree を別に足す）。
 */
export const unlockTargets = (
  worktrees: readonly Worktree[],
  directory: string,
  isAlive: (pid: number) => boolean,
): readonly Worktree[] => {
  const sessions = worktrees.flatMap((worktree) => {
    const owner = ownerOf(worktree);
    return isCreatedBy(worktree, directory, "supervise-") && owner !== undefined && !isAlive(owner)
      ? [{ worktree, owner } as const]
      : [];
  });
  return [
    ...sessions.map(({ worktree }) => worktree),
    ...sessionWorkers(
      worktrees,
      directory,
      sessions.map(({ owner }) => owner),
    ),
  ];
};

export interface SessionAfter {
  /** 回の後の worktree の一覧。 */
  readonly worktrees: readonly Worktree[];
  /** `<main checkout>/.claude/worktrees`。 */
  readonly directory: string;
  /** この回のセッション用の worktree のパス。 */
  readonly session: string;
  /** 起動したセッションのプロセスの識別子。起動できなければ undefined。 */
  readonly pid: number | undefined;
  /** セッションを起動する前から在った worktree のパス。 */
  readonly before: readonly string[];
  /** セッションの間に見つけていた worker の worktree のパス（worker が終わると lock が外れるため）。 */
  readonly seen: readonly string[];
  readonly isAlive: (pid: number) => boolean;
}

/**
 * 回の後に lock を外す worktree と、この回の worker の worktree（次の回に伝えるもの）。
 *
 * この回のセッションのプロセスは、起動したプロセスと、セッション用の worktree の lock が示すもの。worker は、lock の
 * 持ち主がそのどれかである `agent-*` と、セッションの間に見つけていたもののうち、まだ在り、セッションの前には無かった
 * もの。lock を外すのは、`unlockTargets` が選ぶものと、この回のセッション用の worktree と worker の worktree（lock
 * の理由を読めなくても、この回のプロセスの識別子が再利用されて動いているように見えても外す）。ただし、セッションの
 * 前から在り、lock の持ち主がこの回のプロセスに見える `agent-*` は、ほかのセッションのものなので外さない。
 */
export const afterSession = (
  facts: SessionAfter,
): { readonly unlock: readonly Worktree[]; readonly workers: readonly Worktree[] } => {
  const { worktrees, directory, before } = facts;
  const session = worktrees.filter((worktree) => worktree.path === facts.session);
  const sessionLock = session[0]?.lock;
  const owners = [facts.pid, sessionLock === undefined ? undefined : lockOwner(sessionLock)].filter(
    (owner) => owner !== undefined,
  );
  const current = roundWorkers(worktrees, directory, owners, before);
  const remembered = worktrees.filter(
    (worktree) =>
      !current.includes(worktree) &&
      facts.seen.includes(worktree.path) &&
      !before.includes(worktree.path),
  );
  const spared = new Set(
    sessionWorkers(worktrees, directory, owners).filter((worktree) =>
      before.includes(worktree.path),
    ),
  );
  const targets = unlockTargets(worktrees, directory, facts.isAlive).filter(
    (worktree) => !spared.has(worktree),
  );
  return {
    unlock: [
      ...targets,
      ...[...session, ...current].filter(
        (worktree) => worktree.lock !== undefined && !targets.includes(worktree),
      ),
    ],
    workers: [...current, ...remembered],
  };
};
