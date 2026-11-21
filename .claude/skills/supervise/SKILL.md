---
name: supervise
description: 監督役として、ゲームづくりの目標を 1 つ選び、Axon に Group と Issue を登録し、worktree の worker に完遂させ、検査してセッション用ブランチに集め、main へ fast-forward で取り込める状態にして報告する。監督セッション（main checkout から `claude -p --worktree` で起動し、`INCREMENTAL_GAME_SUPERVISOR` を設定したセッション）で `/supervise [方向性]` として呼ぶ。
argument-hint: "[目標の方向性]"
disable-model-invocation: true
---

# 監督セッションを 1 回回す

`/supervise` の呼び出しは、このセッションのブランチ（以下、セッション用ブランチ）と worker のブランチへの commit、目標の Group と子の Issue の登録・採用・更新・完了、worker・protected-worker・judge の起動を任せる指示として扱う。ユーザーは不在で質問に答えない。`ax:conventions` の「完遂を任された実行」に従い、判断して進める。push・PR・deploy はしない。

着手前に `ax:conventions`、`axon-kit:conventions`、`ax:entity-conventions`、`axon-kit:work-state`、`axon-kit:add-note`、`git:commit-conventions` を読み込む。登録の前に `axon-kit:plan`、未判断の登録の前に `axon-kit:capture`、本文・状態の更新の前に `axon-kit:update`、衝突の解消の前に `axon-kit:resolve`、finding の処分の前に `review:review-finding-disposition` を読み込む。

## 守ること

- **main を動かさない。** main の上で commit しない。main checkout に向けた git 操作（`git -C <main checkout> ...`、`cd <main checkout> && git ...`）、`git update-ref`・`git branch -f main`・`git push . HEAD:main` などの main を書き換える操作をしない。main への取り込みはセッションの外（ドライバのシェル）が、結果ファイルを読んで行う。
- **自分では Axon の記録と結果ファイルだけを変える。** 監督役が書くファイルは、監督の worktree（このセッションの worktree）の `.axon/` と `.tmp/supervise/`（一時ファイルもここに置く）だけにする。コード・設定・文書・テストの変更は、検査の失敗の手直しを含めて worker か protected-worker に任せる。hook は監督役の書き込みを止めないので、監督役が直すと保護範囲の検査と judge を経ずに取り込まれる。
- **hook を飛ばさない。** `--no-verify`・`-n`・`LEFTHOOK=0`・`LEFTHOOK_EXCLUDE`・`core.hooksPath` の変更を使わない。権限ルールは `LEFTHOOK=0` や `--no-verif` のような省略形を拒否できないので、worker が commit の hook を通したことを取り込みの根拠にせず、下の「取り込む」節の全検査を監督役が自分で回す。
- **拒否されたコマンドを迂回しない。** 権限ルールや worktree の隔離の検査に拒否されたコマンドを、スクリプトに書いて実行するなどの形で通さない。複合のコマンド（`&&` などでつないだもの）が拒否されたら、単独のコマンドに分けて試す。それでも拒否されたら、その操作をせずに最終報告に書く。
- **長い検査は Bash の timeout を明示する。** 明示しないと `BASH_DEFAULT_TIMEOUT_MS` を超えた実行がバックグラウンドに移り、セッションが完了前に終わりうる。値は `BASH_MAX_TIMEOUT_MS` 以内にする。
- **サブエージェントはフォアグラウンドで起動し、完了を待つ。** バックグラウンドで起動しない。終わったサブエージェントに SendMessage で送ると、バックグラウンドで再開する（Claude Code の文書）ため、差し戻しにも使わない（「結果を照合する」節）。judge は `subagent_type: judge` で新しく起動し、fork しない。
- **worker の Issue は、起動から取り込みまで Note 以外で変えない。** 両方のブランチで同じ Entity のタイトル・本文・状態を変えると、git の rebase が成功したまま Axon の Entity が `Conflicted` になる。この間はセッション用ブランチに commit しない。
- **`axon complete` はセッションの外に任せる。** worktree に隔離されたセッションとサブエージェントでは、Claude Code の隔離の検査が `complete` の語を含むコマンドを shell の組み込みの `complete` と読んで拒否し、この検査は切れない（Claude Code の文書）。監督役も worker も `axon complete` を実行せず、スクリプトに書くなどの形で迂回もしない。完了させる Entity と理由を結果ファイルの `completions` に書き、取り込む側が main checkout で実行する（「結果ファイル」節）。完了は取り込んだ後になるので、同じ回の Issue の間に dependency を付けない（前の Issue が `InProgress` のままで、後の Issue の `axon start` が拒否される）。実行の順序は監督役が決める。
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
  "completions": [
    { "id": "<完了させる Entity の ID>", "reason": "<axon complete の -r に渡す理由>" }
  ],
  "summary": "<1 行の要約>"
}
```

`completions` は、取り込んだ後に `axon complete` する Entity を、実行する順（子の Issue、その後に Group）に並べる。取り込む側は、`head` を取り込んだ後の main checkout で、並びの順に `axon complete <id> -r <reason>` を実行して終了コードを確かめ、`axon storage check` を実行して `.axon/` の記録を commit する。

`status` は次のどれか。

- `ready`: 目標を終え、`head`（セッション用ブランチの HEAD）が「取り込める状態を確かめる」節をすべて満たした。ドライバは `git merge --ff-only <head>` で取り込める。
- `nothing`: 目標を進めなかった（進められる目標が無い、前の回の残りの処理だけで終わった、など）。理由を `summary` と最終報告に書く。`head` は `base` と同じか、`base` の上に Axon の記録だけの commit（未判断の登録、前の回の後始末の記録など）を持つ。記録の commit があれば、`ready` と同じ条件を満たしたうえで、ドライバが取り込める。
- `failed`: 取り込める状態にできなかった。セッション用ブランチを取り込ませない。最終報告に、止まった理由、commit 済みのもの、Axon の状態、残った worktree とブランチ、次の回が継続するのに要ることを書く。

## 1. 状態を読む

1. 監督セッションであることを確かめる: `INCREMENTAL_GAME_SUPERVISOR` が設定され、作業ディレクトリが main checkout の `.claude/worktrees/<回の名前>` で、ブランチが `worktree-<回の名前>`、`git status --short` が空、`git rev-parse HEAD` と `git rev-parse main` が同じであること。どれかが違えば、何も変えずに `failed` の結果ファイルを書いて終わる（保護範囲の hook が働かない、main を動かしうる、または分岐元が main でないため）。`git rev-parse HEAD` を `base` として控える。
2. 監督の worktree で `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行する。
3. AGENTS.md と `docs/design/` の設計記録を読む。AGENTS.md に「現在の段階」節が残っている間は、基盤の試運転だと方向性の引数に書かれた回だけを進める。書かれていなければ `nothing` で終わる。
4. Axon の作業中・未着手の作業を `axon list` で読む。前回の最終報告として、環境変数 `INCREMENTAL_GAME_PREVIOUS_REPORT` が示すファイル（ドライバが前の回の `report.md` を保存した場所）と、直近の監督セッションの目標の Group（3 の印を本文に持つもの。完了していないものを含む）の最終報告の Note を読む。完了していない目標の Group があれば、その残りを継続するかを 2 で決める。前の回の `completions` が実行されずに残っていれば（取り込み済みで、完了の Note があるのに `InProgress` の Issue、全子孫が終わった `Confirmable` の Group）、完了の Note と取り込まれた commit を確かめてから、この回の `completions` に入れる。
5. `git worktree list` と `git branch --list 'worktree-*'` で、前の回の残り（取り込まれていないセッション用ブランチと worktree、worker の `worktree-agent-*` のブランチと worktree）を調べる。残った worktree に `.tmp/supervise/report.md` があれば読む。

前の回の残りは、継続するか破棄するかを決める。ドライバは回を順に起動し、次の回の前に残った lock を外すので、前の回のセッションと worker は終わっている。

- **継続**: 前の回のセッション用ブランチが今の HEAD から fast-forward できる場合に限る。「保護範囲を検査する」節の検査（`<worker のブランチ>` を前の回のブランチに読み替える）と「取り込む」節の全検査を、その先端で通してから `git merge --ff-only` で取り込み、`axon storage check` を実行する。前の回の worker のブランチは、取り込まれていない作業として破棄し、その Issue は新しい worker にやり直させる（worker の `axon start` はそのブランチにしか無いので、セッション用ブランチでは `NotStarted` のまま）。
- **破棄**: 取り込まない。

継続で取り込んだもの以外の前の回の worktree とブランチは、監督の worktree から `git worktree remove <worktree の絶対パス>` と `git branch -D <ブランチ>` で削除する。破棄すると決めた作業なので、未 commit の変更が残って削除できなければ `--force` で削除する。lock が残って削除できないものは、最終報告に一覧を書き、ドライバに任せる。

## 2. 目標を 1 つ決める

引数で方向性が渡されればそれに沿って、無ければ AGENTS.md の設計原則、設計記録、ペースの指標のテストと設計記録の検証結果、前回の最終報告、Axon の採用済みで未着手の作業から選ぶ。

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

- **worker**: 保護範囲に触れない作業。
- **protected-worker**: 保護範囲（`foundation-paths.txt` の判定の基盤、検査の設定、`.claude/`、`mutator.accepted.json` など、`scripts/protect/rules.ts` が検出するもの）を変える作業。core に購入（行動の種類）を足すと `src/sim/minimal-game.ts` も変えるまで型検査が通らないように、型でつながって分けられない変更も protected-worker に任せる。

登録した記録を commit する（commit していない記録は worker の worktree に入らない）。

## 4. worker に任せる

Issue を依存の順に 1 件ずつ、`subagent_type` を担当（`worker` か `protected-worker`）にした Agent をフォアグラウンドで起動して任せる。委譲情報には次を書く。

- 対象の Issue ID と直接の親 Group ID。監督役が Group の実行対象として選び、開始の条件を確かめたこと。
- 作業する worktree: 起動時の作業ディレクトリ（`isolation: worktree` が作る worktree）。repository root はその worktree。
- scope: Issue の本文。
- 最初に読み込む skill: `ax:start`。完了の Note の記録と commit までの完遂を任せること。`axon complete` は隔離の検査に拒否されるので実行せず、Issue を `InProgress` のまま残して、完了させてよいことと理由を報告に書くこと（監督役が `completions` に入れる）。
- 保護範囲の検出対象に当たる変更は、ほかの変更と別の、理由を書いた commit にすること。worker には、protected-worker を起動しないこと。
- 引き継ぐ前の worker のブランチがあれば（「結果を照合する」節）、そのブランチ名、最初に自分のブランチへ `git merge --ff-only <そのブランチ>` で取り込むこと、前の worker が終わっていること、直すこと。
- 報告の形: Issue の最終状態と commit の一覧、完了条件ごとの確認結果と根拠、self-review の結果と照合した tree hash、計画からの逸脱と判断、保護範囲に当たる commit、要るのに変えられなかった保護範囲の変更、登録した `Undecided` と未解決事項、ブランチ名・HEAD・`git status --short` の出力。

## 5. 結果を照合する

返った報告を、Issue の完了条件、worker のブランチの commit（`git log --oneline HEAD..<ブランチ>`）、差分（`git diff HEAD...<ブランチ>`）、完了の Note と照合する。

- **差し戻し**: 足りない完了条件、確かめていない検査、self-review の後の未 review の変更、6・7 で見つかった問題があれば、同じ担当の新しい Agent をフォアグラウンドで起動し、前の worker のブランチを引き継がせて直させる（4 の委譲情報）。返ったら、前の worker の worktree とブランチを 7 と同じ方法で削除する。
- **要る保護範囲の変更**: worker が、hook に拒否された・保護範囲なので変えなかった変更を報告したら、その変更を protected-worker の Issue として登録し、実行の順に組み込む（変異の受け入れ、`.oxlintrc.json` の見直しなど）。worker の Issue が、その変更なしに完了条件を満たせないなら、取り込まずに直す順序を組み直す。
- **登録された `Undecided`**: worker が Group の配下に登録した `Undecided` は、次の Issue へ進む前に `ax:start-group` と同じく処分する（既存の Issue の本文へ取り込んで取り消す、採用して実行の順に組み込む、基準に当たらず Group の完了の前にユーザーの判断も要らなければ Parent を外す）。報告された計画からの逸脱も一件ずつ採否を決める。
- **取り込まない**: 差し戻しても直らない、judge が却下した、などで取り込まないと決めたら、理由を最終報告に書き、worker の worktree を `git worktree remove --force`、ブランチを `git branch -D` で削除し、Issue を新しい worker にやり直させるか、`axon-kit:update` で取り消す。

worker のブランチに新しい commit が加わったら（差し戻し、rebase、変異の受け入れなど）、この節からやり直す。

## 6. 保護範囲を検査する

監督の worktree がセッション用ブランチの HEAD にあり、作業ツリーが空の状態で `pnpm run check:protected HEAD <worker のブランチ>` を実行する。検出の規則と一覧は取り込み先の作業ツリーと `<base>` から読むので、worker のブランチを checkout して実行したり、commit ごとに親を `<base>` にして実行したりしない。

- 終了コード 0: 検出なし。
- 終了コード 1: 検出あり。結果はパスと種類ごとに出るので、`git log --format=%h HEAD..<worker のブランチ> -- <パス>`（追加した行の印は `git log -G<印> ...`）で検出に当たる commit を特定する。その commit にほかの変更が混ざっていれば差し戻して分けさせる。当たる commit ごとに `git show <commit>` を `.tmp/supervise/` のファイルに書き、judge を起動して、そのファイルのパスと AGENTS.md だけを渡して判断させる（作業の文脈、Issue、worker の報告は渡さない）。条件付き承認なら条件を満たすよう差し戻し、却下なら取り込まない。
- 終了コード 2: 検査が失敗した。原因（規則の未 commit の変更など）を調べ、監督役が直せるもの（自分の未 commit のファイル）なら直して再実行する。直せなければ取り込まない。

## 7. 取り込む

ライブラリやツールを足した・変えた変更では、worker がドキュメントを読んで設定を AGENTS.md の方針に照らして精査したことと、oxlint の plugin とルールの選定を見直したこと（変える必要があれば 5 の「要る保護範囲の変更」）を、報告と差分で確かめる。

worker のブランチの HEAD で全検査を回す。監督の worktree で `git switch --detach <worker のブランチ>` し、`pnpm-lock.yaml` か `package.json` が変わっていれば `pnpm install --frozen-lockfile` を実行してから、次をそれぞれ Bash の timeout を明示して実行する。

- `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test --update=none`（commit の hook と同じく、足りない snapshot を書き出さずに失敗させる）
- `pnpm run test:pace:full`
- `pnpm run test:e2e`
- `pnpm run test:mutation`

検査の後に `git status --short` が空であることを確かめる（検査が作業ツリーを書き換えていれば落ちたものとして扱う）。時間切れだけで落ちたら、`uptime` で負荷を確かめ、待って再実行する。生存変異は、テストを足すか、等価変異として理由付きで受け入れるかを worker に判断させる。受け入れは保護範囲の変更なので protected-worker に任せる。

検査が終わったら、成否によらず、サブエージェントを起動する前に `git switch <セッション用ブランチ>` で戻る（detach したままだと、hook が worker の版の規則を読み、新しい worker も worker の HEAD から分岐する）。どれかが落ちたら 5 の差し戻しへ進む。

全検査が通ったら、次の順で取り込む。

1. worker の worktree を、監督の worktree から `git worktree remove <worktree の絶対パス>` で削除する。未 commit の変更や追跡外のファイルが残って失敗したら、5 の差し戻しで commit か破棄をさせる（新しい commit が加われば 5 からやり直す）。`--force` は、中身を確かめて不要と判断した場合だけ使う。
2. 必要なら `pnpm install --frozen-lockfile` し、`git merge --ff-only <worker のブランチ>` で取り込む。fast-forward できなければ、5 の差し戻しで rebase させる。
3. `axon storage check` を実行する。`Conflicted` が出たら `axon-kit:resolve` で解消する。
4. `git branch -d <worker のブランチ>` で削除する。

## 8. 目標を終える

子の Issue がすべて終わったら、「終了監査」節の監査を通し、「取り込める状態を確かめる」節の条件を確かめてから、`axon-kit:add-note` で Group に最終報告の Note を残して記録を commit し、子の Issue と Group を `completions` に入れる。その後に「取り込める状態を確かめる」節の条件をもう一度確かめる。Note の commit の一覧はこの commit の前までになるので、`report.md` にはこの commit を含めた一覧を書く。

### 終了監査

judge を 2 件、並列に起動する（`ax:start-group` の終了監査と同じ役割）。1 件は終了条件監査、もう 1 件は統合監査。両方に、役割、Group ID、`base` とセッション用ブランチの HEAD、監督の worktree の絶対パス、全検査の結果と、子の Issue が `axon complete` を取り込んだ後に回して `InProgress` のままであること（完了の Note で終了を判断する）を渡す。必須の Entity を見ていない、条件ごとの結論か根拠がない、役割を外れた、実行に失敗した監査は無効とし、新しい judge で一度だけやり直す。有効な監査が 2 件そろわなければ `failed` にする。`fail`・`unknown` が残れば、`review:review-finding-disposition` で処分し、直す作業を Issue として足して 4〜7 に戻り、再監査する。

### 取り込める状態を確かめる

- 作業ツリーが空（`git status --short`）で、`axon storage check` が通る。
- `git merge-base --is-ancestor <base> HEAD` が成功し、`git rev-parse main` が `base` と同じ（main が動いていない。動いていれば `failed` にする）。
- この回の worker の worktree とブランチが残っていない（`git worktree list`、`git branch --list 'worktree-agent-*'`）。
- `completions` に、取り込んだ子の Issue（完了の Note があり `InProgress`）と、目標を終えた Group が、実行する順に並んでいる。
- 最後に全検査を通した commit（取り込んだ worker のブランチの HEAD）から HEAD までの差分が Axon の記録だけ（`git diff --stat <その commit> HEAD -- . ':!.axon'` が空）。全検査を通した commit が無ければ、`base` から HEAD までの差分が Axon の記録だけ。どちらかでなければ `failed` にする。

満たせば `ready`（目標を進めなかったなら `nothing`）、満たせなければ `failed` の結果ファイルを書いて終わる。

## 最終報告

`.tmp/supervise/report.md` に日本語で書き、同じ内容を Group の最終報告の Note にも残す（Group が無ければファイルだけ）。

- 目標と選んだ理由、Group と Issue の ID と最終状態。
- セッション用ブランチの commit の一覧（`git log --oneline <base>..HEAD`）。
- 全検査の結果と、指標の変化（ペースの指標のテストの合否、変えた目標値と設計記録の検証結果に書いた値）。
- 保護範囲の検出結果と judge の判断、終了監査の結果。
- ユーザーに聞かずに下した判断と理由、差し戻しと理由。
- 登録した `Undecided` と未解決事項、次の回への申し送り。
- 削除した前の回の残りと、残った worktree とブランチ。
