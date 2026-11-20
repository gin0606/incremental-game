import type { ViteUserConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * mutator から実行するときの Vitest 設定。
 *
 * mutator は、この設定ファイルと setupFiles の内容が変わったときだけ結果のキャッシュを捨てる。
 * vitest.config.ts を読み込んだり環境変数を読んだりすると、その変更でテストが変わっても古い判定が
 * 使われるため、項目をここに直接書く。vitest.config.ts との違いは次の 2 点。
 *
 * - fast-check の seed と実行回数を固定する。実行ごとに入力が変わると、同じ変異の判定がぶれる。
 * - 全体を覆う遅いテスト（`*.slow.test.ts`）を外す。変異ごとに実行されると時間がかかりすぎる。
 */
const config: ViteUserConfig = defineConfig({
  test: {
    include: ["**/*.test.{ts,mts,cts,tsx}"],
    exclude: [...configDefaults.exclude, "**/.*/**", "dist/**", "coverage/**", "**/*.slow.test.*"],
    setupFiles: ["./vitest.setup.ts"],
    allowOnly: false,
    expect: { requireAssertions: true },
    provide: { fastCheck: { seed: 1, numRuns: 100 } },
  },
});

export default config;
