import type { ViteUserConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";

import type { FastCheckSettings } from "./vitest.provide.d.ts";

const readInteger = (name: string, min: number): number | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!/^-?\d+$/v.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new TypeError(`${name} は ${min} 以上の整数で指定する: ${raw}`);
  }
  return value;
};

/**
 * fast-check の seed と実行回数を環境変数 `FC_SEED`・`FC_NUM_RUNS` から読む。
 * 指定しなければ、seed は実行ごとに変わり、実行回数は fast-check の既定になる。
 * 実行回数 0 は性質を一度も確かめずに通るため受け付けない。
 */
const fastCheckFromEnv = (): FastCheckSettings => {
  const seed = readInteger("FC_SEED", Number.MIN_SAFE_INTEGER);
  const numRuns = readInteger("FC_NUM_RUNS", 1);
  return {
    ...(seed === undefined ? {} : { seed }),
    ...(numRuns === undefined ? {} : { numRuns }),
  };
};

// mutator から実行するときの設定（vitest.mutation.config.ts）は、この設定を読み込まずに同じ項目を書く。
// ここを変えたら、あちらも揃える。
const config: ViteUserConfig = defineConfig({
  test: {
    // どのディレクトリに置いたテストも黙って外れないよう、全体から探す。型検査（tsconfig.json）と揃え、
    // ドットで始まるディレクトリ（worktree、一時ファイル、pnpm の store など）は外す。
    include: ["**/*.test.{ts,mts,cts,tsx}"],
    exclude: [...configDefaults.exclude, "**/.*/**", "dist/**", "coverage/**"],
    setupFiles: ["./vitest.setup.ts"],
    // `.only` の付いたテストが残っていると失敗させ、ほかのテストを黙って飛ばさない。
    allowOnly: false,
    // expect を一度も呼ばないテスト（性質の中で検査を書き忘れたものを含む）を失敗させる。
    expect: { requireAssertions: true },
    provide: { fastCheck: fastCheckFromEnv() },
  },
});

export default config;
