import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 保護範囲の検出の CLI のテストが使う、使い捨ての git リポジトリ。

/** このリポジトリのルート。 */
export const repositoryRoot: string = fileURLToPath(new URL("../../..", import.meta.url));

// 監督セッションの中でテストを動かしても、hook の有効・無効と一覧の場所はテストが渡したものだけで決まるようにする。
const SESSION_VARIABLES = new Set(["INCREMENTAL_GAME_SUPERVISOR", "CLAUDE_PROJECT_DIR"]);

/**
 * テストで起動する git と CLI の環境変数。pre-commit の hook から実行すると GIT_DIR・GIT_INDEX_FILE などが
 * このリポジトリを指すため、GIT_ で始まる変数を外す。利用者とシステムの git の設定も読ませない。
 */
export const isolatedEnv = (extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(
    Object.keys(process.env)
      .filter((name) => !name.startsWith("GIT_") && !SESSION_VARIABLES.has(name))
      .map((name) => [name, process.env[name]]),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  ...extra,
});

export const gitIn = (directory: string, args: readonly string[]): string => {
  const result = spawnSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    env: isolatedEnv(),
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout;
};

export const writeFiles = (directory: string, files: Readonly<Record<string, string>>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
};

/** ファイルを書いて main に commit した、使い捨てのリポジトリを作る。 */
export const createRepository = (files: Readonly<Record<string, string>>): string => {
  const directory = mkdtempSync(join(tmpdir(), "protect-"));
  gitIn(directory, ["init", "--quiet", "--initial-branch=main"]);
  writeFiles(directory, files);
  gitIn(directory, ["add", "--all"]);
  gitIn(directory, ["commit", "--quiet", "--message=base"]);
  return directory;
};
