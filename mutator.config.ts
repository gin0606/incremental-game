import type { MutatorConfig } from "@mizchi/mutator";
import { defineConfig } from "@mizchi/mutator";

/**
 * ミューテーションテスト（mutator）の設定。commit ごとには回さず、取り込み前に回す。
 *
 * - 型エラーになる変異は `typescript` パッケージで除く。`auto` ではなく `true` にして、型検査できないときに
 *   黙って飛ばさない。
 * - スコアが `thresholds.break` を下回ると終了コード 2 で失敗する。テストが到達しない変異もスコアを下げる。
 *   等価な変異は `mutator accept <key> --reason <理由>` で mutator.accepted.json に記録して除く。
 * - `break` は 100 にし、検出できない変異を一件ずつ、テストを足して検出するか、理由を書いて受け入れるかを
 *   決めさせる。スコアは割合なので、100 未満にするとコードが増えるほど検出できない変異が黙って増えうる。
 */
const config: MutatorConfig = defineConfig({
  runner: "vitest",
  vitestConfig: "vitest.mutation.config.ts",
  // 型検査とテストと同じく全体を対象にし、新しいディレクトリのコードが黙って外れないようにする。
  include: ["**/*.{ts,mts,cts,tsx}"],
  exclude: [
    "**/*.test.*",
    // テスト用の入力の生成器。変異は入力の分布を変えるだけで、検出の対象にならない。
    "**/*.arbitrary.ts",
    // DOM とゲームをつなぐ部分と E2E テスト。ユニットテストは届かず、E2E テスト（pnpm run test:e2e）で
    // 確かめる。DOM に依存しない表示の内容と保存データの読み込みは src/ui/view.ts・src/ui/restore.ts に分けて
    // 変異の対象にする。
    "src/ui/main.ts",
    "e2e/**",
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
