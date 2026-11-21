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
 * lock を外す worktree。lock の持ち主が終わった監督セッションの worktree（`supervise-*`）と、その worker の worktree
 * だけを選ぶ。前のドライバのプロセスが中断した回のものも含む。ほかの worktree（対話のセッションのもの、持ち主の
 * 分からない lock）には触れない。`isAlive` は、ドライバが終わりを見届けたプロセスには false を返す（識別子が
 * 再利用されても外せるように）。
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
