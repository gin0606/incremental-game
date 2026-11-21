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
    // テスト用の入力の生成器。変異は入力の分布を変えるだけで、検出の対象にならない。除外してよいのは、本番の
    // コードがこれらを import しない間だけ（import すると、本番で動くコードが変異の対象から外れる）。この条件は
    // lint などの検査では守っていないため、本番のコードの import を変えるときに確かめる。
    "**/*.arbitrary.ts",
    // 画面の要素・localStorage・時計・Web Locks をゲームにつなぐ部分と E2E テスト。ユニットテストは届かず、
    // E2E テスト（pnpm run test:e2e）で確かめる。除外してよいのは、main.ts がつなぐだけで、ゲーム・保存・通知・
    // タブの扱いを決める判断や分岐を持たない間だけ（要素が無いときに止める検査と、配列の添字の型を絞る検査は
    // 置いている）。表示の内容、保存データの読み込みと保存、通知、タブの重複の扱いは src/ui の view.ts・restore.ts・
    // session.ts・notices.ts・tab-lock.ts に分けて変異の対象にし、判断を足すときもそちらに置く。
    "src/ui/main.ts",
    // シミュレーターの CLI の入口。引数・標準出力・終了コードを src/sim/run.ts につなぐだけで、判断や分岐を持たない
    // 間だけ除外してよい。CLI を実際に動かすテスト（src/sim/cli/main.slow.test.ts）で確かめる。
    "src/sim/cli/main.ts",
    // 保護範囲の検出（取り込み前の検査と hook）の入口とテストの補助。git・ファイル・標準入出力・環境変数を
    // scripts/protect の判定の規則につなぐ部分で、別のプロセスとして起動するテスト（scripts/protect/cli の
    // *.slow.test.ts）で確かめるため、変異を検出できない。判定の規則（パスの照合、差分の行の読み方、内容の比較、
    // hook の入力の読み方と拒否の相手）は scripts/protect の直下に置いて変異の対象にし、判断を足すときもそちらに
    // 置く。ここに残すのは、git に渡す引数と読む版、引数とファイルの状態（追加・削除）に応じた読み分け、hook の
    // 対象のパスの解き方、git とファイルの失敗の扱いで、これらは *.slow.test.ts が一つずつ確かめる。
    "scripts/protect/cli/**",
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
