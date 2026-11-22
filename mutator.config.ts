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
    // 置いている）。表示の内容、保存データの読み込みと保存、通知、タブの重複の扱い、店のフォーカスの移し方と行の
    // 見せ方は src/ui の view.ts・restore.ts・session.ts・notices.ts・tab-lock.ts・shop-focus.ts・shop-rows.ts に
    // 分けて変異の対象にし、判断を足すときもそちらに置く。
    "src/ui/main.ts",
    // シミュレーターの CLI の入口。引数・標準出力・終了コードを src/sim/run.ts につなぐだけで、判断や分岐を持たない
    // 間だけ除外してよい。CLI を実際に動かすテスト（src/sim/cli/main.slow.test.ts）で確かめる。
    "src/sim/cli/main.ts",
    // 保護範囲の検出（取り込み前の検査と hook）の入口とテストの補助。git・ファイル・標準入出力・環境変数を
    // scripts/protect の判定の規則につなぐ部分で、別のプロセスとして起動するテスト（scripts/protect/cli の
    // *.slow.test.ts）で確かめるため、変異を検出できない。判定の規則（パスの照合、差分の行の読み方、内容の比較、
    // hook の入力の読み方と拒否の相手）は scripts/protect の直下に置いて変異の対象にし、判断を足すときもそちらに
    // 置く。ここに残すのは、git に渡す引数と読む版、引数とファイルの状態（追加・削除）に応じた読み分け、検出の
    // 規則と一覧に commit していない変更があるときと `<base>` の版と違うときに規則を読み込む前に止めること、hook の
    // 対象のパスの解き方、git とファイルの失敗の扱いで、これらは *.slow.test.ts が一つずつ確かめる。
    "scripts/protect/cli/**",
    // 無人運転のドライバの入口と、プロセス・git・Axon・ファイルを scripts/autopilot の判断の規則につなぐ部分。監督
    // セッションの代わりの模擬のコマンド（scripts/autopilot/cli/mock）を起動するテスト（scripts/autopilot/cli の
    // *.slow.test.ts）で確かめるため、変異を検出できない。引数・結果ファイル・セッションの出力の読み方、取り込むか・
    // 止まるかの判断、lock を外す worktree と worker の worktree の選び方、起動の引数と環境変数、次の回に渡す報告は
    // scripts/autopilot の直下に置いて変異の対象にし、判断を足すときもそちらに置く。
    // ここに残すもののうち *.slow.test.ts が確かめるのは: 起動の前の確認（停止用ファイルの残り、main checkout ごとの
    // ドライバの lock と動いている監督セッション（各回の前にも見る）、main checkout のブランチ・作業ツリー・起動した
    // ディレクトリ）、待機ファイル、既定の停止用ファイル、最初の回に渡す前の回の最終報告、失敗の回と nothing の回の
    // 数え方、取り込みの手順（完了を実行する前の確認、完了を順に実行すること、記録の確認と .axon/ の外の変更で head
    // だけを取り込むこと、記録の確認の間に main が動いたときに何も取り込まないこと、依存の入れ直し、実行できなかった
    // 完了を伝えること、Axon の記録者）、lock を外す時機と対象（最初の回の前と各回の後、読めない理由の回のセッション
    // 用の worktree とその worker、セッションの間に終わった worker、回の前から在る worktree を除くこと）、セッションの
    // worktree の .tmp/supervise/ を回のログの置き場へ写すこと（写せないファイルの後も写し続けること、symlink の
    // 結果ファイルと相対の symlink の写し方）、時間の上限とシグナルでセッションを止めること、後始末と停止のときの一覧。
    // 確かめていないので、変えるときは読んで確かめるのは: SIGTERM の後の SIGKILL への切り替えと、セッションの後に
    // 残ったプロセスの停止（猶予の 30 秒を待つため）、ディスクの空きを main checkout とログの置き場の両方で測ること、
    // コマンドの時間の上限、セッションの出力を読めないときの扱い、記録の commit が .axon/ の外を変えたときの扱い
    // （`git add -- .axon` の後には起きない）、後始末の直後に届いたシグナルで次の回を始めないこと、依存のファイルの
    // うち package.json 以外の変更での入れ直し、セッションの後の手順（lock を外すことなど）の失敗で回を失敗にする
    // こと、git と pnpm に渡す環境変数、停止のときの一覧を作れなかったときの扱い、監督セッションを起動できなかった
    // ときの扱い、結果ファイルを写せないときに回を失敗にすることと、通常のファイル・ディレクトリ・symlink でないもの
    // を .tmp/supervise/ から写さないこと、ドライバの lock ファイルの置き換えの競合（同時に起動したドライバのうち
    // 1 つだけが置き換える）と、作成の失敗・終了時に自分のものだけを消すこと・ps が失敗したときにドライバとみなす
    // こと、プロセスの存在の確認の EPERM、nothing の回で後の commit が戻した記録の外の変更。
    "scripts/autopilot/cli/**",
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
