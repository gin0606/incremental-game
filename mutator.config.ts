import type { MutatorConfig } from "@mizchi/mutator";
import { defineConfig } from "@mizchi/mutator";

/**
 * ミューテーションテスト（mutator）の設定。commit ごとには回さず、取り込み前に回す。
 *
 * - 型エラーになる変異は `typescript` パッケージで除く。`auto` ではなく `true` にして、型検査できないときに
 *   黙って飛ばさない。
 * - スコアが `thresholds.break` を下回ると終了コード 2 で失敗する。テストが到達しない変異もスコアを下げる。
 *   等価な変異は `mutator accept <key> --reason <理由>` で mutator.accepted.json に記録して除く。
 *   `break` は変異をすべて検出できている最小のコードに合わせた仮の値で、ゲームのコードを入れるときに見直す。
 */
const config: MutatorConfig = defineConfig({
  runner: "vitest",
  vitestConfig: "vitest.mutation.config.ts",
  // 型検査とテストと同じく全体を対象にし、新しいディレクトリのコードが黙って外れないようにする。
  include: ["**/*.{ts,mts,cts,tsx}"],
  exclude: [
    "**/*.test.*",
    "*.config.ts",
    "vitest.setup.ts",
    "node_modules/**",
    "dist/**",
    "coverage/**",
    "**/.*/**",
  ],
  typecheck: true,
  thresholds: { high: 80, low: 60, break: 100 },
});

export default config;
