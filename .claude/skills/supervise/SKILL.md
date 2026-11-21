---
name: supervise
description: 監督役として、ゲームづくりの目標を 1 つ選び、Axon に Group と Issue を登録し、worktree の worker に完遂させ、検査してセッション用ブランチに集め、main へ fast-forward で取り込める状態にして報告する。監督セッション（main checkout から `claude -p --worktree` で起動し、`INCREMENTAL_GAME_SUPERVISOR` を設定したセッション）で `/supervise [方向性]` として呼ぶ。
argument-hint: "[目標の方向性]"
disable-model-invocation: true
---

# 監督セッションを 1 回回す

`/supervise` の呼び出しは、このセッションのブランチ（以下、セッション用ブランチ）と worker のブランチへの commit、目標の Group と子の Issue の登録・採用・完了、worker・protected-worker・judge の起動を任せる指示として扱う。ユーザーは不在で質問に答えない。`ax:conventions` の「完遂を任された実行」に従い、判断して進める。push・PR・deploy はしない。

着手前に `ax:conventions`、`axon-kit:conventions`、`ax:entity-conventions`、`axon-kit:work-state`、`axon-kit:add-note`、`git:commit-conventions` を読み込む。登録の前に `axon-kit:plan`、未判断の登録の前に `axon-kit:capture`、衝突の解消の前に `axon-kit:resolve`、終了監査の finding の処分の前に `review:review-finding-disposition` を読み込む。

## 守ること

- **main を動かさない。** main の上で commit しない。main checkout に向けた git 操作（`git -C <main checkout> ...`、`cd <main checkout> && git ...`）、`git update-ref`・`git branch -f main`・`git push . HEAD:main` などの main を書き換える操作をしない。main への取り込みはセッションの外（ドライバのシェル）が、結果ファイルを読んで行う。
- **自分の worktree の外に書かない。** 書いてよいのは、このセッションの worktree（以下、監督の worktree）と、そこから起動した worker の worktree の削除だけ。一時ファイルは監督の worktree の `.tmp/supervise/` に置く。
- **hook を飛ばさない。** `--no-verify`・`-n`・`LEFTHOOK=0`・`LEFTHOOK_EXCLUDE`・`core.hooksPath` の変更を使わない。権限ルールは `LEFTHOOK=0` や `--no-verif` のような省略形を拒否できないので、worker が commit の hook を通したことを取り込みの根拠にせず、下の「取り込む」節の全検査を監督役が自分で回す。
- **長い検査は Bash の timeout を明示する。** 明示しないと `BASH_DEFAULT_TIMEOUT_MS` を超えた実行がバックグラウンドに移り、セッションが完了前に終わりうる。値は `BASH_MAX_TIMEOUT_MS` 以内にする。worker と protected-worker・judge はフォアグラウンドで起動して完了を待つ（`run_in_background` を使わない）。
- **worker の実行中は、その worker の Issue を Note 以外で変えない。** 両方のブランチで同じ Entity のタイトル・本文・状態を変えると、git の rebase が成功したまま Axon の Entity が `Conflicted` になる。worker の実行中はセッション用ブランチに commit しない。
- **判断を残す。** ユーザーに聞かずに下した判断と理由、差し戻しと理由を、関係する commit message と最終報告に残す（AGENTS.md「判断の記録」）。

## 結果ファイル

終わるときは、成否によらず、監督の worktree に次の 2 つを書く。`result.json` を最後に書く。

- `.tmp/supervise/report.md`: 最終報告（「最終報告」節）。
- `.tmp/supervise/result.json`: ドライバが読む結果。

```json
{
  "status": "ready",
  "branch": "worktree-<回の名前>",
  "base": "<開始時の HEAD>",
  "head": "<取り込める commit>",
  "group": "<目標の Group の ID。無ければ null>",
  "summary": "<1 行の要約>"
}
```

`status` は次のどれか。

- `ready`: `head` がセッション用ブランチの HEAD で、`base` から fast-forward でき、「取り込める状態を確かめる」節をすべて満たした。ドライバは `git merge --ff-only <head>` で取り込める。
- `nothing`: 取り込む commit が無い（`head` が `base` と同じ）。進められる目標が無かった、前の回の残りの処理だけで終わった、など。理由を `summary` と最終報告に書く。
- `failed`: 取り込める状態にできなかった。セッション用ブランチを取り込ませない。最終報告に、止まった理由、commit 済みのもの、Axon の状態、残った worktree とブランチ、次の回が継続するのに要ることを書く。

結果ファイルが無いまま終わったら、ドライバは失敗として扱う。

## 1. 状態を読む

1. 監督セッションであることを確かめる: `INCREMENTAL_GAME_SUPERVISOR` が設定され、作業ディレクトリが main checkout の `.claude/worktrees/<回の名前>` で、ブランチが `worktree-<回の名前>` であること。どれかが違えば、何も変えずに `failed` の結果ファイルを書いて終わる（保護範囲の hook が働かない、または main を動かしうるため）。
2. `git status --short` が空であることと、`git rev-parse HEAD` を `base` として控える。
3. 監督の worktree で `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行する。
4. AGENTS.md と `docs/design/` の設計記録を読む。
5. Axon の作業中・未着手の作業を `axon list` で読む。直近に完了した、監督セッションの目標の Group（3 の印を本文に持つもの）の最終報告の Note（前回の最終報告）を読む。
6. `git worktree list` と `git branch --list 'worktree-*'` で、前の回の残り（取り込まれていないセッション用ブランチ、worker の `worktree-agent-*` のブランチと worktree）を調べる。

前の回の残りがあれば、継続するか破棄するかを決める。

- **継続**: 前の回のセッション用ブランチが今の HEAD から fast-forward でき、その上の commit が「取り込む」節の全検査を通せる場合に限る。`git merge --ff-only <前の回のブランチ>` で取り込み、`axon storage check` を実行し、作業中のまま残った Issue は、worker が終わっていることを worktree の lock が外れていることで確かめてから、`axon-kit:work-state` で `axon release` するか、新しい worker に継続させる（継続の根拠として、前の worker の終了と残った commit を委譲情報に書く）。
- **破棄**: 取り込まない。前の回のブランチと worktree の削除は、lock が残るのでドライバに任せ、最終報告に一覧を書く。この回の worker の worktree だけを自分で削除する。

## 2. 目標を 1 つ決める

引数で方向性が渡されればそれに沿って、無ければ AGENTS.md の設計原則、設計記録、ペースの指標の結果、前回の最終報告、Axon の採用済みで未着手の作業から選ぶ。

- 1 回のセッションで、検査を含めて終わる大きさにする。大きければ最初の一歩だけを目標にする。
- 未判断の Entity を目標にするのは、ユーザーの決定と保護範囲を緩めることにかかわらないものに限る。
- 保護範囲（AGENTS.md「保護範囲」節）を緩める変更は目標にしない。必要なら `axon-kit:capture` で `Undecided` に登録して最終報告に挙げる。
- 進められる目標が無ければ `nothing` で終わる。

## 3. 計画を登録する

`axon-kit:plan` で、目標を Group、作業を子の Issue として採用済みで登録する。本文は `ax:entity-conventions` に従う。Group の本文の最初に、監督セッション `<回の名前>` の目標であることを書く（次の回が前回の最終報告を探す印）。Issue の完了条件に次を含める。

- ゲームの変更は、AGENTS.md の設計原則と「設計と根拠」に従う。ゲーム内のテキストは日本語。数値・間隔・演出の根拠は `docs/design/` の設計記録に、出典と仮説と検証結果を書く。
- 目標値（`docs/design/*.targets.json`）の変更は、ゲームの変更とは別の commit にし、根拠を設計記録に書く。
- 検査: `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通る。

Issue ごとに担当を決める。

- **worker**: 保護範囲のパスに触れない作業。
- **protected-worker**: 保護範囲のパス（`foundation-paths.txt` の判定の基盤、`.claude/` など）を変える作業。保護範囲の変更そのものは、それだけを含む単独の commit にする。core に購入（行動の種類）を足すと `src/sim/minimal-game.ts` も変えるまで型検査が通らないように、型でつながって分けられない最小の変更は、まとめて 1 つの保護範囲の commit にし、ほかの変更（画面、設計記録、目標値など）は別の commit にする。

登録した記録を commit する（commit していない記録は worker の worktree に入らない）。

## 4. worker に任せる

Issue を依存の順に 1 件ずつ、`subagent_type` を担当（`worker` か `protected-worker`）にした Agent をフォアグラウンドで起動して任せる。委譲情報には次を書く。

- 対象の Issue ID と直接の親 Group ID。監督役が Group の実行対象として選び、開始の条件を確かめたこと。
- 作業する worktree: 起動時の作業ディレクトリ（`isolation: worktree` が作る worktree）。repository root はその worktree。
- scope: Issue の本文。
- 最初に読み込む skill: `ax:start`。commit と `axon complete` までの完遂を任せること。
- ユーザーは不在で質問に答えない。判断して進め、判断と理由を commit message と報告に残す。
- 保護範囲の検出対象に当たる変更（devDependencies の追加、抑制コメント、`mutator.accepted.json` など）は、ほかの変更と別の、理由を書いた commit にする。worker には、protected-worker を起動しないこと。
- 終わる前に作業ツリーを空にする（commit するか破棄する）。報告にブランチ名、HEAD、`git status --short` の出力を書く。
- 報告の形: Issue の最終状態と commit の一覧、完了条件ごとの確認結果と根拠、self-review の結果と照合した tree hash、計画からの逸脱と判断、保護範囲に当たる commit、登録した `Undecided` と未解決事項。

## 5. 結果を照合する

返った報告を、Issue の完了条件、worker のブランチの commit（`git log --oneline HEAD..<ブランチ>`）、差分（`git diff HEAD...<ブランチ>`）と照合する。足りない完了条件、確かめていない検査、self-review の後の未 review の変更があれば、同じ worker を SendMessage で再開して差し戻す。再開できなければ、前の worker の終了と残った commit を渡して新しい worker に継続させる。

## 6. 保護範囲を検査する

監督の worktree がセッション用ブランチの HEAD にあり、作業ツリーが空の状態で `pnpm run check:protected HEAD <worker のブランチ>` を実行する（検出の規則は取り込み先の作業ツリーから読むため、worker のブランチを checkout してから実行しない）。

- 終了コード 0: 検出なし。
- 終了コード 1: 検出あり。検出された commit ごとに、ほかの変更が混ざっていないかを確かめ、混ざっていれば差し戻して分けさせる。分けた commit ごとに `git show <commit>` を `.tmp/supervise/` のファイルに書き、judge を起動して、そのファイルと AGENTS.md だけを渡して判断させる（作業の文脈、Issue、worker の報告は渡さない）。却下か条件付きなら、差し戻して直させるか、その変更を取り込まない。
- 終了コード 2: 検査が失敗した。原因（規則の未 commit の変更など）を調べて直してから再実行する。直せなければ取り込まない。

## 7. 取り込む

ライブラリやツールを足した・変えた変更では、worker がドキュメントを読んで設定を AGENTS.md の方針に照らして精査したことと、oxlint の plugin とルールの選定を見直したことを、報告と差分で確かめる。

worker のブランチの HEAD で全検査を回す。監督の worktree で `git switch --detach <worker のブランチ>` し、`pnpm-lock.yaml` か `package.json` が変わっていれば `pnpm install --frozen-lockfile` を実行してから、次をそれぞれ Bash の timeout を明示して実行する。

- `pnpm run check`
- `pnpm run test:pace:full`
- `pnpm run test:e2e`
- `pnpm run test:mutation`

時間切れだけで落ちたら、`uptime` で負荷を確かめ、待って再実行する。生存変異は、テストを足すか、等価変異として理由付きで受け入れるか（受け入れは保護範囲の検出対象で、judge の判断を要する）を worker に判断させる。どれかが落ちたら差し戻す。

全検査が通ったら、`git switch <セッション用ブランチ>`（必要なら `pnpm install --frozen-lockfile`）して `git merge --ff-only <worker のブランチ>` で取り込み、`axon storage check` を実行する。fast-forward できなければ、worker に rebase させて全検査をやり直す。`Conflicted` が出たら `axon-kit:resolve` で解消する。

取り込んだ worker の worktree とブランチを、監督の worktree から `git worktree remove <worktree の絶対パス>` と `git branch -d <ブランチ>` で削除する（`git -C` の形は使わない）。未 commit の変更や追跡外のファイルが残って `git worktree remove` が失敗したら、worker に commit か破棄をさせる。`--force` は、残りを確かめて不要と判断した場合だけ使う。

## 8. 目標を終える

子の Issue がすべて終わったら、「終了監査」節の監査を通し、`axon-kit:add-note` で Group に最終報告の Note を残し、`axon-kit:work-state` で Group を `axon complete` して、記録を commit する。Note の commit の一覧はこの commit の前までになるので、`report.md` にはこの commit を含めた一覧を書く。

### 終了監査

`ax:start-group` の終了監査（同 skill の `references/closing-audit.md`）と同じ役割の judge を 2 件、並列に起動する。1 件は終了条件監査（各 Entity の目的と完了条件を、実装・検証・Note・commit の証拠が満たすか）、もう 1 件は統合監査（Issue をまたぐ不整合、Group の目的に対する欠落、回帰）。両方に、Group ID、`base` とセッション用ブランチの HEAD、監督の worktree の絶対パス、全検査の結果を渡す。judge は Entity または条件ごとに `pass`・`fail`・`unknown`・`N/A` と根拠を返す。`fail`・`unknown` が残れば、`review:review-finding-disposition` で処分し、直す作業を Issue として足して 4〜7 に戻り、再監査する。

### 取り込める状態を確かめる

- 作業ツリーが空（`git status --short`）で、`axon storage check` が通る。
- `git merge-base --is-ancestor <base> HEAD` が成功し、`git rev-parse main` が `base` と同じ（main が動いていない。動いていれば `failed` にする）。
- この回の worker の worktree とブランチが残っていない（`git worktree list`、`git branch --list 'worktree-agent-*'`）。
- 最後に全検査を通した commit から HEAD までの差分が Axon の記録だけ（`git diff --stat <その commit> HEAD -- . ':!.axon'` が空）。そうでなければ HEAD で全検査を回し直す。

満たせば `ready`、取り込む commit が無ければ `nothing`、満たせなければ `failed` の結果ファイルを書いて終わる。

## 最終報告

`.tmp/supervise/report.md` に日本語で書き、同じ内容を Group の最終報告の Note にも残す（Group が無ければファイルだけ）。

- 目標と選んだ理由、Group と Issue の ID と最終状態。
- セッション用ブランチの commit の一覧（`git log --oneline <base>..HEAD`）。
- 全検査の結果と、指標の変化（ペースの指標のテストの合否、変えた目標値と設計記録の検証結果）。
- 保護範囲の検出結果と judge の判断、終了監査の結果。
- ユーザーに聞かずに下した判断と理由、差し戻しと理由。
- 登録した `Undecided` と未解決事項、次の回への申し送り。
- 残った worktree とブランチ（前の回の残りを含む）。
