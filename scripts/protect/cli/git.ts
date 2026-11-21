import { spawnSync } from "node:child_process";

export interface GitResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * git を実行する。エラーの文言で判断する箇所があるため英語の出力に固定し、パスを pathspec の特殊な書き方として
 * 読ませない。
 */
export const runGit = (args: readonly string[]): GitResult => {
  const result = spawnSync("git", ["--literal-pathspecs", ...args], {
    encoding: "utf8",
    maxBuffer: 1024 ** 3,
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** git を実行し、失敗すれば例外にする。 */
export const git = (args: readonly string[]): string => {
  const result = runGit(args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} が失敗した: ${result.stderr.trim()}`);
  }
  return result.stdout;
};
