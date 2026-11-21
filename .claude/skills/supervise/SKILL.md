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
- **自分では Axon の記録と結果ファイルだけを変える。** 監督役が直接編集・作成するファイルは、監督の worktree（このセッションの worktree）の `.axon/` と `.tmp/supervise/`（一時ファイルもここに置く）だけにする（install や検査が書き出すものは除く）。コード・設定・文書・テストの変更は、検査の失敗の手直しを含めて worker か protected-worker に任せる。hook は監督役の書き込みを止めないので、監督役が直すと保護範囲の検査と judge を経ずに取り込まれる。
- **hook を飛ばさない。** `--no-verify`・`-n`・`LEFTHOOK=0`・`LEFTHOOK_EXCLUDE`・`core.hooksPath` の変更を使わない。権限ルールは `LEFTHOOK=0` や `--no-verif` のような省略形を拒否できないので、worker が commit の hook を通したことを取り込みの根拠にせず、下の「取り込む」節の全検査を監督役が自分で回す。
- **拒否されたコマンドを迂回しない。** 権限ルールや worktree の隔離の検査に拒否されたコマンドを、スクリプトに書いて実行するなどの形で通さない。複合のコマンド（`&&` などでつないだもの）が拒否されたら、単独のコマンドに分けて試す。それでも拒否されたら、その操作をせずに最終報告に書く。
- **長い検査は Bash の timeout を明示する。** 明示しないと `BASH_DEFAULT_TIMEOUT_MS` を超えた実行がバックグラウンドに移り、セッションが完了前に終わりうる。値は `BASH_MAX_TIMEOUT_MS` 以内にする。
- **サブエージェントはフォアグラウンドで起動し、完了を待つ。** バックグラウンドで起動しない。終わったサブエージェントに SendMessage で送ると、バックグラウンドで再開する（Claude Code の文書）ため、差し戻しにも使わない（「結果を照合する」節）。judge は `subagent_type: judge` で新しく起動し、fork しない。
- **worker の起動から取り込みまで、Axon の記録を変えない。** 両方のブランチで同じ Entity のタイトル・本文・状態を変えると、git の rebase が成功したまま Axon の Entity が `Conflicted` になる。また 6・7 は作業ツリーが空の状態で `<base>` などへ detach する。この間はセッション用ブランチに commit せず、Note も足さない。残す事実は回の記録に書く。
- **`axon complete` はセッションの外に任せる。** 基盤の試運転では、worktree に隔離されたセッションとサブエージェントで、Claude Code の隔離の検査が `axon complete ...` を shell の組み込みの `complete` を実行するコマンドと読んで拒否した（引数を引用した形、`env`・`command` を前に置いた形も拒否された）。監督役も worker も `axon complete` を実行せず、スクリプトに書くなどの形で迂回もしない。完了させる Entity と理由を結果ファイルの `completions` に書き、取り込む側が取り込む前に実行する（「結果ファイル」節）。完了はセッションが終わった後になるので、同じ回の Issue の間に dependency を付けない（前の Issue が `InProgress` のままで、後の Issue の `axon start` が拒否される）。実行の順序は監督役が決める。
- **判断を残す。** ユーザーに聞かずに下した判断と理由、差し戻しと理由を、関係する commit message と最終報告に残す（AGENTS.md「判断の記録」）。

## 結果ファイル

終わるときは、成否によらず、どの節で止まっても（「やり直しの上限」に達したときを含む）、監督の worktree に次の 2 つを書く。`result.json` を最後に書く。

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
    {
      "id": "<完了させる Entity の ID>",
      "reason": "<axon complete の --reason に渡す理由。下の制約を満たす 1 行>"
    }
  ],
  "summary": "<1 行の要約>"
}
```

`completions` の `id` は英数字で始まり、英数字・`_`・`-` だけからなる。`reason` は `axon complete` の `--reason` の制約に従い、空白だけでなく、改行・タブなどの制御文字を含まない 500 文字以内（UTF-16 の単位で数える）の 1 行にする。worker の報告が書いた理由も、この制約を確かめてから入れる。1 件でも満たさないと、ドライバは result.json 全体を読めないものとし、回を失敗にする（下のドライバが失敗にする回）。

`completions` は、`axon complete` する Entity を、実行する順（子の Issue、その後に Group）に並べる。取り込む側（隔離されていないシェル）は、セッションの worktree の HEAD が `head` であることを確かめ、その worktree で、並びの順に `axon complete --reason=<reason> <id>`（`reason` はそのまま 1 つの引数として渡す）を実行してそれぞれ終了コードを確かめる。どれかが失敗しても残りを続け、失敗した ID を回のログに残す（失敗した子を持つ Group の完了も失敗する。失敗した完了は次の回が拾い直すので、一つの失敗でほかの完了を止めない）。続けて `axon storage check` を実行し、`.axon/` の記録だけを commit して（その commit の差分が `.axon/` だけであることを確かめる）、その commit へ main を `git merge --ff-only` で進める（記録の変更が無ければ commit せずに `head` へ進める）。main は fast-forward でだけ動く。`axon storage check`・commit・fast-forward のどれかが失敗したら、その worktree を `git reset --hard <head>` と `git clean -fd -- .axon` で `head` に戻し（未 commit の記録と、作った commit を捨てる）、`head` を `git merge --ff-only` で取り込む。`head` も取り込めなければ何も取り込まず、失敗として扱う。実行されなかった完了は、次の回が「状態を読む」で拾い直す。

`status` は次のどれか。

- `ready`: 目標を終えたか、終えた目標を持つ前の回のブランチを 1 の継続で取り込み、`head`（セッション用ブランチの HEAD）が「取り込める状態を確かめる」節をすべて満たした。ドライバは `git merge --ff-only <head>` で取り込める。
- `nothing`: 目標を進めず、1 の継続でも取り込まなかった（進められる目標が無い、前の回の残りの処理だけで終わった、など）。理由を `summary` と最終報告に書く。`head` は `base` と同じか、`base` の上に Axon の記録だけの commit（未判断の登録、前の回の後始末の記録など）を持つ。記録の commit があれば、`ready` と同じ条件を満たしたうえで、ドライバが取り込める。`completions`（前の回から拾ったもの）があれば、`head` が `base` と同じでも、取り込む側が上の手順で実行する。
- `failed`: 取り込める状態にできなかった。セッション用ブランチを取り込ませない。最終報告に、止まった理由、commit 済みのもの、Axon の状態、残った worktree とブランチ、次の回が継続するのに要ることを書く。

ドライバは、次のどれかに当たる回も、`status` によらず失敗にし、セッション用ブランチと worktree を次の回に残す。

- result.json が無いか読めない（項目が欠けた、型が違う、`completions` が上の制約を満たさない）か、report.md が無い。
- `branch` がこの回のセッション用ブランチでない、`head` がその先端と違う、`base` が回の開始時の main と違う。セッションの worktree が `head` のセッション用ブランチをチェックアウトしていない。
- `base..head` に merge commit がある（`git rev-list --merges <base>..<head>` が空でない）。
- `nothing` の回の `base..head` の commit が `.axon/` の外を変えた。`ready` の回で main が進まなかった。

ほかに、セッションの終わり方（終了コード 0 以外、シグナル、1 回の時間の上限）、main checkout と main の状態、ドライバ自身の処理の失敗でも失敗にする。理由は次の回に渡す「ドライバの記録」に書かれる。

## 回の記録

取り込みの判断に使う事実を、`.tmp/supervise/round.md` に起きた順に書き足す。「取り込める状態を確かめる」と「やり直しの上限」は、この記録で照合して数える。

- Issue ごとの worker の起動（最初の起動、差し戻し、やり直し）と、そのブランチ名。
- 「保護範囲を検査する」で検査した worker のブランチの hash、検査の標準出力、当たる commit（検出の行から辿ったものと、worker の報告が挙げたもの）、judge に判断させた commit の hash ごとの結論と、judge の出力を保存したファイルのパス。
- 「取り込む」で全検査を通した hash と、取り込んだ commit（`git rev-list <取り込む前の HEAD>..HEAD`）。1 の継続で取り込んだ前の回のブランチの commit も同じく書く。
- 終了監査の周と結論、時間切れで再実行した検査。

## やり直しの上限

無人運転で同じやり直しを繰り返して回が終わらなくならないよう、次の上限を置く。

- **Issue ごとの worker の起動**: 最初の起動、差し戻し（judge の条件に応えるもの、引き継がなかった worker への差し戻しを含む）、「取り込まない」の後のやり直しを合わせて 4 回まで。4 回目の worker の結果でも取り込めなければ、その Issue を取り込まず（5 の「取り込まない」）、この回ではやり直さない。その Issue なしで目標を終えられるなら `axon-kit:update` で取り消して続け、終えられなければ `failed` にする。
- **保護範囲の judge**: 条件付き承認の後の再判定は、差し戻しごとに 1 回で、差し戻しは上の起動の回数に数える。結論が無効なときのやり直しは 1 回（「保護範囲を検査する」）。
- **終了監査**: `fail`・`unknown` からの修正と再監査は 2 周まで。2 周目の再監査でも残れば `failed` にする。結論が無効なときのやり直しは 1 回（「終了監査」）。
- **時間切れでの再実行**: 同じ commit の同じ検査で 1 回まで。再実行も時間切れなら落ちたものとして扱う。
- **保護範囲の変更の Issue の追加**: 7 の 5 で足した Issue を取り込んだ後に、その Issue から 7 の 5 でさらに Issue を足さない。要る変更は `axon-kit:capture` で `Undecided` に登録し、次の回に回す。

## 1. 状態を読む

1. 監督セッションであることを確かめる: `INCREMENTAL_GAME_SUPERVISOR` が設定され、作業ディレクトリが main checkout の `.claude/worktrees/<回の名前>` で、回の名前が `supervise-` で始まり、ブランチが `worktree-<回の名前>`、`git status --short` が空、`git rev-parse HEAD` と `git rev-parse main` が同じであること。どれかが違えば、何も変えずに `failed` の結果ファイルを書いて終わる（保護範囲の hook が働かない、main を動かしうる、または分岐元が main でないため）。`git rev-parse HEAD` を `base` として控える。
2. 監督の worktree で `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行する。
3. AGENTS.md と `docs/design/` の設計記録を読む。
4. Axon の作業中・未着手の作業を `axon list` で読む。前回の最終報告として、環境変数 `INCREMENTAL_GAME_PREVIOUS_REPORT` が示すファイル（設定されていなければ無い）と、直近の監督セッションの目標の Group（3 の印を本文に持つもの。完了していないものを含む）の最終報告の Note を読む。完了していない目標の Group（終了監査を通したと書いた最終報告の Note があるものを除く）があれば、その残りを継続するかを、下の前の回の残りの扱いの中で、2 の基準で決める。
   - ドライバが前の回の後に渡すファイルは、前の回の `report.md` の後に、ドライバが「ドライバの記録」の節を足したもの（`report.md` が無かった回では、書かれなかった旨の 1 行の後に節が続く）。節には、回の名前、セッションの終わり方、取り込みの結果（取り込んだ commit か、取り込まなかった理由）、実行できなかった完了の ID（result.json を読めなかった回では挙がらない）、その回の worker の worktree とブランチが入る。ドライバの最初の回に利用者が渡したファイルには、この節が無い。
5. `git worktree list` と `git branch --list 'worktree-*'` で、前の回の残りを調べる。前の回の残りとして扱うのは、この回以外の `worktree-supervise-*` のセッション用ブランチと worktree と、前回の最終報告（「ドライバの記録」の節を含む）か残った worktree の `.tmp/supervise/report.md` が、その回の worker のものとして名前を挙げた `worktree-agent-*` のブランチと worktree だけにする。ほかの worktree とブランチ（対話のセッションや、報告の無い回の worker のもの）は変えずに、最終報告に一覧を書く。

前の回の残りは、継続するか、残すか、破棄するかを決める。継続を選ぶのは、前の回のセッション用ブランチが今の HEAD から fast-forward でき、前回の最終報告がそのブランチの commit と止まった理由を挙げていて、その目標を継続すると決めた場合（2 の基準で、この時点で決める）に限る。前の回が「残す」で残したブランチ（下の 2 つ目か 3 つ目に当たるもの）は、取り込むかをユーザーが決めるので継続しない。終えた作業を持つブランチ（下）のうち、その回の報告か結果ファイルの `head` がブランチの先端と違うものも、終了監査を経ていない commit を含みうるので継続しない。ほかの終えた作業を持つブランチは、2 の基準によらず継続を選ぶ（終えた作業なので）。前回の最終報告が挙げていなくても、その回の worktree に残った `.tmp/supervise/report.md` が commit を挙げていれば、それを前回の最終報告の代わりに使う。fast-forward できるものが複数あれば、ほかをすべて祖先に持つもの（無ければ最も遅く起動した回のもの）を 1 つ選ぶ。それを継続で取り込めたら、その祖先の前の回のブランチも継続で取り込んだものとして扱い、取り込めなければ、どれも継続で取り込まなかったものとして扱う。この継続で取り込んだら、2〜8 で新しい目標を始めず、「取り込める状態を確かめる」を経て `ready` で終える（新しい目標が `failed` になると、終えた作業も取り込まれなくなるため）。ほかの継続では、継続した目標を 8 の終了監査まで終えて `ready` にし、終えられなければ `failed` にする。ただし、前の回のブランチが検出の規則か一覧を変えていれば（`git diff --quiet HEAD <ブランチ> -- scripts/protect foundation-paths.txt` が差分ありで終わる）、継続しない。6 は前の回のブランチを 1 本のブランチとして `HEAD` の規則と一覧で検査するので、前の回の途中で一覧に足したパスへの後の変更を検出しないため。継続しないもの（継続の検査が通らなかったものを含む）は、下の「残す」に当たるものを残し、ほかを破棄する。ドライバは回を順に起動し、前の回のセッションが終わってから次の回を起動するので、前の回のセッションと worker は終わっている。ドライバは、回の後にその回のセッション用の worktree と worker の worktree の lock を外し、次の回の前に、lock の持ち主（lock の理由が示すプロセス）が終わった `supervise-*` の worktree と、そのプロセスが lock した `agent-*` の worktree の lock を外す。報告が挙げた名前では選ばない。ほかの lock（持ち主を読めない、持ち主が動いている、持ち主が監督セッションのプロセスでない）は外さない。

前の回のセッション用ブランチが `<base>` の祖先（`git merge-base --is-ancestor <ブランチ> <base>` が成功）なら、main に取り込み済みなので、継続も残すも破棄も選ばずに下の方法で削除する。この回の継続で取り込んだだけのブランチは、main に入るまで削除しない（この回が取り込まれずに終わると、commit がこの回のブランチにしか無くなるため）。削除したブランチを挙げた開いている Entity（`axon list --terminal false --search='残したブランチ: <ブランチ名> '`。下の「残す」）があれば、main に取り込まれていたので削除したことを `axon-kit:add-note` でその Entity の Note に残し、最終報告に挙げる。

前の回のセッション用ブランチのうち、`<base>` の祖先でなく、次のどれかに当たるものを、終えた作業を持つブランチと呼ぶ。judge の承認と終了監査を経た作業で、削除すると commit を取り戻せないため、継続で取り込まなければ残す。

- その回が `ready` で終えた。前回の最終報告か、その回の worktree に残った `.tmp/supervise/result.json`（`status` が `ready` で、`branch` がそのブランチ）がそう書いている。ドライバは取り込めなかった回の worktree を消さないので、前回の最終報告が挙げていなくても worktree の結果ファイルで分かる。
- `axon list --terminal false --search='残したブランチ: <ブランチ名> '` が 1 件以上返す（前の回が「残す」で登録した Entity が開いている）。
- 前回の最終報告が、「残す」で残したブランチとして挙げている（その回が `failed` で終わり、登録した Entity が main に入らなかった場合）。

ただし、`axon list --search='残したブランチ: <ブランチ名> '` が 1 件以上返し、それがどれも終わっている（`Completed`・`Cancelled`）なら、取り込むか捨てるかの扱いが決まったので、終えた作業を持つブランチとしない。検索の `<ブランチ名>` の後の空白は、`-2` などが付いた別の回の名前に当たらないためのもの。

- **継続**: 前の回のセッション用ブランチが今の HEAD から fast-forward できる場合に限る。「保護範囲を検査する」節の検査（`<worker のブランチ>` を前の回のブランチに、worker の報告を前回の最終報告（その代わりに使う worktree の `report.md` を含む）に読み替える。その報告が挙げた hash のうち、`HEAD..<前の回のブランチ>` に無いものは取り込まれないので加えない）と「取り込む」節の全検査を、その先端で通してから `git merge --ff-only` で取り込み、`axon storage check` を実行する。依存が変わっていれば `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行する。検査の結果が、取り込まないか差し戻すことになれば（merge commit がある、当たる commit が「承認」以外になった、全検査が落ちた、など。差し戻す worker がいない）、継続しない（終えた作業を持つブランチなら残し、ほかは破棄する）。前の回の worker のブランチは、取り込まれていない作業として破棄し、その Issue は新しい worker にやり直させる（worker の `axon start` はそのブランチにしか無いので、セッション用ブランチでは `NotStarted` のまま）。
- **残す**: 終えた作業を持つブランチで、継続で取り込まなかったもの。その worktree もブランチも削除しない（worktree の `.tmp/supervise/` が、後の回が終えた作業を持つブランチと判断する材料になる）。そのブランチを挙げた開いている Entity が無ければ、`axon-kit:capture` で Parent の無い `Undecided` を登録して commit する。本文には、`残したブランチ: <ブランチ名> <先端の hash>` の 1 行（`<先端の hash>` は `git rev-parse <ブランチ>` の 40 文字。backtick や引用符で囲まず、後の回の検索に当たる形のまま書き、後から書き換えない）、その回の目標（その回の最終報告か結果ファイルが挙げた Group の ID）、継続しなかった理由、残した worktree の絶対パス、取り込むか捨てるかの判断を求めること、この Entity が開いている間は後の回がこのブランチと worktree を削除しないこと、main に取り込まずにこの行を持つ Entity をすべて閉じると後の回が削除することを書く。最終報告には、残したブランチの名前と先端の hash、それを挙げた Entity の ID を書く（既にある Entity の hash と先端が違えば、そのことも書く）。
- **破棄**: 取り込まない。

継続で取り込んだものと残すもの以外の前の回の worktree とブランチは、監督の worktree から `git worktree remove <worktree の絶対パス>` と `git branch -D <ブランチ>` で削除する。破棄すると決めた作業なので、未 commit の変更が残って削除できなければ `--force` で削除する。lock が残って削除できないものは、`git worktree unlock` で外さず（持ち主を確かめられない lock を外すと、動いているセッションを壊しうる）、最終報告に一覧と lock の理由（`git worktree list --porcelain` の `locked` の行）を書く。削除したブランチにしか無かった `Undecided`（前回の最終報告が挙げたもの）は、`axon-kit:capture` で登録し直して commit する。ただし、「残す」の Entity で、同じブランチを挙げた開いている Entity が HEAD にあれば（この回で登録したものを含む）、登録し直さない。この節の記録（「残す」の登録、取り込み済みの Note、登録し直し）は、作成も commit も継続の取り込みの後にする（先に commit すると継続の fast-forward ができず、commit せずに残すと継続の 6 が作業ツリーを空にするときに捨てる）。

残りを処理した後に、実行されなかった前の回の `completions` を拾う。3 の印を本文に持つ Group の子で、HEAD にあり完了の Note があるのに `InProgress` の Issue を、完了の Note と取り込まれた commit を確かめてから、この回の `completions` に入れる。その後に、印の Group で、終了監査を通したと書いた最終報告の Note があり、直接の子が終わっているか今入れた Issue だけが残るものを入れる。この Group は目標を終えているので、2 で継続する目標にしない。前の回が取り込まれていて（前回の最終報告の `status` が `failed` でなく、その `head` が `base` の祖先。`git merge-base --is-ancestor <前回の head> <base>`）、拾った Entity が前回の最終報告の `completions` にも挙がっていたなら（取り込む側の完了が失敗した）、最終報告に挙げ、その Entity を挙げた `Undecided` がまだ無ければ `axon-kit:capture` で登録する。終了監査を通した印の Group で、ほかの子が残って入れられないものは、`completions` に入れずに最終報告に挙げ、その Entity を挙げた `Undecided` がまだ無ければ `axon-kit:capture` で登録する。この段落で登録する `Undecided` には Parent を付けない（Group の配下に置くと、その Group が完了できなくなる）。印の無い Group とその子は入れない。

## 2. 目標を 1 つ決める

引数で方向性が渡されればそれに沿って、無ければ AGENTS.md の設計原則、設計記録、ペースの指標のテストと設計記録の検証結果、前回の最終報告、Axon の採用済みで未着手の作業から選ぶ。

- 1 回のセッションで、検査を含めて終わる大きさにする。大きければ最初の一歩だけを目標にする。
- 未判断の Entity を目標にするのは、ユーザーの決定と保護範囲を緩めることにかかわらないものに限る。
- 保護範囲（AGENTS.md「保護範囲」節）を緩める変更は目標にしない。必要なら `axon-kit:capture` で `Undecided` に登録して最終報告に挙げる。
- 進められる目標が無ければ `nothing` で終わる（1 の継続で取り込んだ回は、1 の継続の段落による）。

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
- 引き継ぐ前の worker のブランチがあれば（「結果を照合する」節）、そのブランチ名、最初に自分のブランチへ `git merge --ff-only <そのブランチ>` で取り込むこと（作り直させる場合は、取り込まずに前のブランチの commit から作り直すこと）、前の worker が終わっていること、直すこと。前の worker の worktree に残ったものがあれば、その worktree の絶対パス（読むだけにさせる）と控えたファイルのパス。
- judge が却下した変更があれば、その変更と理由。同じ変更を含めないこと。
- merge commit を作らないこと。
- 報告の形: Issue の最終状態と commit の一覧、完了条件ごとの確認結果と根拠、self-review の結果と照合した tree hash、計画からの逸脱と判断、保護範囲に当たる commit、要るのに変えられなかった保護範囲の変更、登録した `Undecided` と未解決事項、ブランチ名・HEAD・`git status --short` の出力。

## 5. 結果を照合する

返った報告を、Issue の完了条件、worker のブランチの commit（`git log --oneline HEAD..<ブランチ>`）、差分（`git diff HEAD...<ブランチ>`）、完了の Note と照合する。

- **差し戻し**: 足りない完了条件、確かめていない検査、self-review の後の未 review の変更、6・7 で見つかった問題があれば、同じ担当の新しい Agent をフォアグラウンドで起動し、前の worker のブランチを引き継がせて直させる（4 の委譲情報。回数は「やり直しの上限」）。前の worker の worktree に残った未 commit の変更と追跡外のファイルは、新しい worker の worktree には入らない。残っていれば（`git -C <前の worktree> status --short`）、その一覧と `git -C <前の worktree> diff HEAD` を `.tmp/supervise/` のファイルに控え、前の worktree の絶対パスと一緒に新しい worker に渡して、要るものを作り直させる。差し戻しの理由が commit の分け方や message の書き直しで、前のブランチの commit を書き換える必要があれば、前のブランチを引き継がせずに、セッション用ブランチの HEAD から前のブランチの commit を作り直させる。そのときは、返ったら引き継ぎの確かめの代わりに、`git merge-base --is-ancestor HEAD <新しいブランチ>` が成功し、`git diff <前のブランチ> <新しいブランチ> -- . ':!.axon'` が差し戻しで求めた変更だけであることを確かめる。満たせば前の worktree とブランチを削除する。満たさなければ、その新しい worker の worktree とブランチを「取り込まずに消す」の方法で削除してもう一度作り直させ、二度目も満たさなければ、その worker のものも同じ方法で削除し、「取り込まない」へ進む。それ以外の差し戻しでは、返ったら、`git merge-base --is-ancestor <前のブランチ> <新しいブランチ>` で引き継いだことを確かめる。引き継いでいなければ、その新しい worker の worktree とブランチを下の「取り込まずに消す」の方法で削除し、前のブランチを引き継がせてもう一度差し戻す。二度目も引き継がなければ、その worker のものも同じ方法で削除し、「取り込まない」へ進む。引き継いでいれば、前の worker の commit は新しいブランチにあるので、前の worktree を `git worktree remove --force <worktree の絶対パス>`、ブランチを `git branch -D` で削除する。
- **要る保護範囲の変更**: worker が、hook に拒否された・保護範囲なので変えなかった変更（変異の受け入れ、`.oxlintrc.json` の見直しなど）を報告したら、採否を決める。worker の Issue がその変更なしに完了条件を満たせないなら、同じ Issue のまま protected-worker に前のブランチを引き継がせ（差し戻しと同じ手順）、その変更を単独の commit でさせる。満たせるなら、取り込んだ後に protected-worker の Issue として登録する（7 の 5）。
- 報告された計画からの逸脱を一件ずつ採否を決める。
- **取り込まずに消す**: worker の worktree とブランチを取り込まずに削除するときは、`git worktree remove --force <worktree の絶対パス>` と `git branch -D <ブランチ>` で削除する。その worker が報告した `Undecided` と、取り込んだ後に回すと決めた保護範囲の変更は、そのブランチにしか無かったので、`.tmp/supervise/` のファイルに控える。控えた記録は、その Issue の worker のブランチがすべて取り込まれるか削除されて残っていないときに、新しい worker を起動する前に `axon-kit:capture` でセッション用ブランチに登録し直して commit する（取り込んだなら 7 の 5、取り込まないなら「取り込まない」の削除の後）。worker のブランチが残っている間に commit すると、引き継ぎと取り込みの fast-forward が失敗する。
- **取り込まない**: 差し戻しても直らない、judge が却下した、などで取り込まないと決めたら、理由を最終報告に書き、その Issue の worker の worktree とブランチをすべて「取り込まずに消す」の方法で削除し、控えた記録を登録し直して commit する。その後に、Issue を新しい worker にやり直させるか（「やり直しの上限」の回数に数える）、`axon-kit:update` で取り消す。

worker のブランチに新しい commit が加わったら（差し戻し、変異の受け入れなど）、この節からやり直す。

## 6. 保護範囲を検査する

最初に `git rev-list --merges HEAD..<worker のブランチ>` が空であることを確かめる。merge commit があれば、そのブランチを取り込まない（5 の「取り込まない」）。`git show` の combined diff では、merge で入った変更が judge に見えないことがある。

検出の規則・一覧と検査の入口は、取り込み先の main の版（`<base>`）で動かす。この回で取り込んだ規則の変更はまだ main に無く、セッション用ブランチの版で動かすと、その変更に検出の漏れがあれば後の worker のブランチの変更を見逃す。規則か一覧が `<base>` の版と違う作業ツリーでは終了コード 2 で止まるので、worker のブランチを checkout して実行したり、commit ごとに親を `<base>` にして実行したりしない。

監督の worktree の作業ツリーが空（`git status --short`）であることを確かめる。この間に監督役が残す変更は無いので、空でなければ、`git status --short` と `git diff HEAD` を `.tmp/supervise/` のファイルに控え、`git diff HEAD` に出ない追跡外のファイル（commit し忘れた Axon の記録など）の中身も、`git ls-files -z --others --exclude-standard` の出力を `.tmp/supervise/<名前>.list` に書いてから `tar --null -T .tmp/supervise/<名前>.list -cf .tmp/supervise/<名前>.tar` で控えて（`<名前>` は控えるごとに変える。`.tmp/` は Git 管理外なので、下の `git clean -fd` で消えない）、控えたファイルのパスを回の記録に書き、監督の worktree のルートで `git restore --staged --worktree -- .` と `git clean -fd` を実行して捨ててから進める。控えられない（このときは捨てない）か、捨てた後も空でなければ（どちらもコマンドが拒否された場合を含む）、取り込まず、新しい worker を起動せずに `failed` にする（作業ツリーが空にならない限り、どの worker のブランチも検査できないため）。`git rev-parse <worker のブランチ>` と `git rev-parse HEAD` を回の記録に書く。以下の `<その hash>` は前者、`<取り込み先の hash>` は後者を指す（検査の途中でブランチが進んでも、検査する版がずれない）。`git switch --detach <base>` し（`package.json` か `pnpm-lock.yaml` が `<base>` と `<取り込み先の hash>` で違えば、`pnpm install --frozen-lockfile` を実行してから。`pnpm run` は、入っている依存が lockfile と合わないと、検査を始めずに終了コード 1 で終わる）、回全体の検査とブランチの検査を実行して標準出力を回の記録に書き、`git switch <セッション用ブランチ>` で戻る（依存を入れ直していたら、戻った後にもう一度 `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行する）。ブランチの検査を使えないときは、戻った後に、取り込み先の規則での検査も実行して標準出力を回の記録に書く。

- 回全体の検査: `pnpm run check:protected <base> <その hash>`。この回で前に取り込んだ Issue の検出も出る。
- ブランチの検査: `pnpm run check:protected <取り込み先の hash> <その hash>`。worker のブランチが加えた差分だけを `<base>` の規則で見る。この回で `scripts/protect/` か `foundation-paths.txt` を変えた commit を取り込んでいれば、規則か一覧が `<取り込み先の hash>` の版と違うので終了コード 2 で止まる。そのとき（`git diff --quiet <base> <取り込み先の hash> -- scripts/protect foundation-paths.txt` が差分ありで終わるとき）はブランチの検査を使わない。
- 取り込み先の規則での検査: ブランチの検査を使えないときだけ、セッション用ブランチの作業ツリー（HEAD が `<取り込み先の hash>`）で `pnpm run check:protected <取り込み先の hash> <その hash>` を実行する。worker のブランチが加えた差分を、この回で取り込んだ規則と一覧で見る。回全体の検査は `<base>` の一覧を読むので、この回で一覧に足したパスへの変更を検出しないため。

どの検査も、終了コード 0 は標準出力の最初の行が「保護範囲に当たる変更は無い」で始まるとき、1 は「保護範囲に当たる変更がある」で始まり `- ` で始まる行（検出の行）が 1 つ以上あるときだけ、その終了コードとして扱い、ほかは 2 として扱う。この確かめの後で、Axon の記録のファイル（パスが `.axon/records/<2 文字>/<64 文字の 16 進数>` で、拡張子が無いもの）への、行の内容による検出の行（種類が「抑制の印」か「ミューテーションテストの設定と除外」で、パスの後の括弧の中が「追加した行:」か「…を消した行:」で始まるもの）を無いものとして扱い、残る検出の行が無ければ終了コード 0 として扱う（Axon の記録は保護範囲でなく、本文や Note が抑制の印などを書き写すと検出される。`.axon/` の下のほかのファイルへの検出と、パスによる検出（入れ子の CLAUDE.md など）は残す）。「最後に取り込んだブランチの回全体の検査の出力」は、この回で最後に取り込んだ hash（1 の継続で取り込んだ前の回のブランチを含む）について回の記録に書いた出力を指し、まだ何も取り込んでいなければ検出の行の無い出力とする。

実行した検査（使えないときのブランチの検査を除く）のどれかが終了コード 2 なら、検査が失敗した。原因（規則の未 commit の変更など）を調べ、監督役が直せるもの（自分の未 commit のファイル、`<base>` の lockfile と合わない依存は `pnpm install --frozen-lockfile`）なら直して 1 回だけ再実行する。直せないか、再実行も 2 なら取り込まない。

2 が無ければ、judge に判断させる commit（以下、当たる commit）を、次の 2 つの和として集める。

- **検出の行から辿る commit。** 辿る行は次のとおり。
  - ブランチの検査を使えるとき: ブランチの検査の検出の行。回全体の検査の行のうち、ブランチの検査に無く、最後に取り込んだブランチの回全体の検査の出力にも無い行があれば、取り込まない。
  - 使えないとき: 回全体の検査の行と、取り込み先の規則での検査の行のすべて（前に取り込んだ Issue の検出と同じ行でも、そのパスに触れた commit を judge に判断させる）。

  行ごとに、worker のブランチの commit から当たる commit を `git log --format=%H <取り込み先の hash>..<その hash> -- <パス>` で特定する。「追加した行:」の行は、大文字と小文字を区別しない `git log --format=%H -i -G<印> <取り込み先の hash>..<その hash> -- <パス>` で絞る（`<印>` は、その行が挙げる追加した行のうち、正規表現の特殊文字を含まない部分。`oxlint-disable` など）。この方法は、検出に当たる部分を変えていない commit も拾うが、それも judge に判断させる。`-G` の `git log` が失敗するか 1 つも返さなければ、`-G` を外してパスで辿り直す。パスでも 1 つも特定できない行は、回全体の検査の行で、最後に取り込んだブランチの回全体の検査の出力に同じ行があるとき（前に取り込んだ Issue の検出）だけ許す。ほかは取り込まない（当たる commit が空のまま「どれも承認」を満たさせない）。

- **worker の報告が保護範囲に当たると挙げた commit。** 検出されていなくても加える。報告が `<取り込み先の hash>..<その hash>` に無い hash を挙げていれば、報告とブランチが合わないので 5 の差し戻しで直させる。

当たる commit が無ければ、judge を起動せずに 7 へ進む。当たる commit のうち、その行の挙げる項目・節・印を変えるものに、ほかの変更が混ざっていれば差し戻して分けさせる（worker.md・protected-worker.md が 1 つの commit にまとめるとした、分けられない最小の変更は除く）。当たる commit ごとに `git show <commit>` を `.tmp/supervise/` のファイルに書き、judge を起動して、そのファイルのパスと AGENTS.md だけを渡して判断させる（作業の文脈、Issue、worker の報告は渡さない）。同じ hash の commit にこの回で「承認」か、条件を満たした「条件付き承認」を得ていれば、もう一度判断させない。judge の出力は commit の hash ごとのファイルに `.tmp/supervise/` に保存し、結論を回の記録に書いて、次のように扱う。

- 「承認」: その commit を取り込める。
- 「条件付き承認」: 条件を満たすよう差し戻す。差し戻しから返ってこの節に来たら、その commit を単独では判断させず、その commit と、差し戻しで加わったすべての commit（`git log --format=%H <その commit が最初に条件付き承認を得たときに検査した hash>..<その hash>`。条件に応えた、検出に当たらない commit も含む）の `git show` と、それまでに付いた条件の文すべてを、新しい judge 1 件に渡して再判定させる。前のブランチを引き継がせずに作り直させた差し戻し（5）では、その commit が新しいブランチに無いので、代わりに `<取り込み先の hash>..<その hash>` のすべての commit を渡す。再判定の結論を、その commit（作り直しでは渡した commit）と、加わった commit のうち当たる commit それぞれの結論として記録する。再判定の「承認」は、条件を満たした「条件付き承認」として扱う。再判定が「条件付き承認」ならもう一度差し戻し、「却下」なら取り込まない。
- 「却下」: 取り込まない。やり直しの worker のブランチが、却下された変更と同じ変更（同じパスへの同じ趣旨の変更）を含んでいれば、judge に渡さずに取り込まない。
- 無効な結論: judge の実行の失敗、最初の行が judge.md の結論の形（`結論: 承認`・`結論: 条件付き承認`・`結論: 却下`）でない、条件付き承認に条件が無い、渡したもの以外を根拠にした、保護範囲の判断を外れた、のどれか。ただし、judge の実行が失敗した場合を除き、最初の行に「却下」とある出力は、形が違っても「却下」として扱う。新しい judge で一度だけやり直す。やり直しても有効な結論が無ければ取り込まない。

取り込むのは、当たる commit がどれも「承認」か、条件を満たした「条件付き承認」の場合だけにする。

## 7. 取り込む

ライブラリやツールを足した・変えた変更では、worker がドキュメントを読んで設定を AGENTS.md の方針に照らして精査したことと、oxlint の plugin とルールの選定を見直したこと（変える必要があれば 5 の「要る保護範囲の変更」）を、報告と差分で確かめる。

worker のブランチの HEAD で全検査を回す。監督の worktree で `git switch --detach <6 で回の記録に書いた hash>` し、`pnpm-lock.yaml` か `package.json` が変わっていれば `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行してから（Playwright の版が変わるとブラウザを入れ直す必要がある）、次をそれぞれ Bash の timeout を明示して実行する。

- `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test --update=none`（commit の hook と同じく、足りない snapshot を書き出さずに失敗させる）
- `pnpm run test:pace:full`
- `pnpm run test:e2e`
- `pnpm run test:mutation`

検査の後に `git status --short` が空であることを確かめる（検査が作業ツリーを書き換えていれば落ちたものとして扱い、6 と同じく控えて捨ててから戻る。控えられないか捨てられなければ、新しい worker を起動せずに `failed` にする）。時間切れだけで落ちたら、`uptime` で負荷を確かめ、待って再実行する（「やり直しの上限」）。すべて通ったら、検査した hash（`git rev-parse HEAD`）を回の記録に書く。生存変異は、テストを足すか、等価変異として理由付きで受け入れるかを worker に判断させる。受け入れは保護範囲の変更なので protected-worker に任せる。

検査が終わったら、成否によらず、サブエージェントを起動する前に `git switch <セッション用ブランチ>` で戻る（detach したままだと、hook が worker の版の規則を読み、新しい worker も worker の HEAD から分岐する）。依存を入れ直していたら、戻った後に `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行し直す。どれかが落ちたら 5 の差し戻しへ進む。

全検査が通ったら、次の順で取り込む。

1. worker の worktree を、監督の worktree から `git worktree remove <worktree の絶対パス>` で削除する。未 commit の変更や追跡外のファイルが残って失敗したら、5 の差し戻しで commit か破棄をさせる（新しい commit が加われば 5 からやり直す）。`--force` は、中身を確かめて不要と判断した場合だけ使う。
2. `git rev-parse <worker のブランチ>` が、6 で検査した hash と、全検査を通した hash の両方と同じことを確かめる。違えば（検査の後にブランチが動いた）、5 の「取り込まない」へ進む。回の記録で、その hash の 6 で当たる commit としたものが、どれも「承認」か、条件を満たした「条件付き承認」を得ていることを照合する。得ていないものがあれば、6 に戻る。`git merge --ff-only <その hash>` で取り込み、取り込んだ commit を回の記録に書き、依存が変わっていれば `pnpm install --frozen-lockfile` と `pnpm run e2e:install` を実行する。worker の起動後にセッション用ブランチへ commit していなければ fast-forward できる。できなければ、5 の「取り込まない」へ進む。
3. `axon storage check` を実行する。`Conflicted` が出たら `axon-kit:resolve` で解消する。
4. `git branch -d <worker のブランチ>` で削除する。
5. 次の Issue へ進む前に、取り込んだ記録を処分する。5 で控えた記録を登録し直す。worker が Group の配下に登録した `Undecided` は、`ax:start-group` と同じく処分する（既存の Issue の本文へ取り込んで取り消す、採用して実行の順に組み込む、基準に当たらず Group の完了の前にユーザーの判断も要らなければ Parent を外す）。5 で取り込んだ後に回すと決めた保護範囲の変更を、protected-worker の Issue として登録する。worker が採用済みの Entity や dependency を足していれば、この回で実行できるように直す。変えた記録を commit する。

## 8. 目標を終える

子の Issue がすべて終わったら、「終了監査」節の監査を通し、「取り込める状態を確かめる」節の条件（`completions` の項を除く）を確かめてから、`axon-kit:add-note` で Group に最終報告の Note を残して記録を commit し、子の Issue と Group を `completions` に入れる。その後に「取り込める状態を確かめる」節の条件をもう一度確かめる。Note の commit の一覧はこの commit の前までになるので、`report.md` にはこの commit を含めた一覧を書く。

### 終了監査

judge を 2 件、順に起動する（`ax:start-group` の終了監査と同じ役割）。並列に起動しないのは、同じ worktree で検査を同時に回すと、`.mutator/` のキャッシュなど作業ツリーの中に書き出すものを取り合うため。1 件は終了条件監査、もう 1 件は統合監査。両方に、役割、Group ID、`base` とセッション用ブランチの HEAD、監督の worktree の絶対パス、全検査の結果と、子の Issue が `axon complete` を取り込んだ後に回して `InProgress` のままであること（完了の Note で終了を判断する）を渡す。必須の Entity を見ていない、条件ごとの結論か根拠がない、役割を外れた、実行に失敗した監査は無効とし、新しい judge で一度だけやり直す。有効な監査が 2 件そろわなければ `failed` にする。`fail`・`unknown` が残れば、`review:review-finding-disposition` で処分し、直す作業を Issue として足して 4〜7 に戻り、再監査する（「やり直しの上限」）。

### 取り込める状態を確かめる

- 監督の worktree がセッション用ブランチをチェックアウトし（`git symbolic-ref --short HEAD`）、作業ツリーが空（`git status --short`）で、`axon storage check` が通る。
- `git merge-base --is-ancestor <base> HEAD` が成功し、`git rev-parse main` が `base` と同じ（main が動いていない。動いていれば `failed` にする）。
- この回の worker の worktree とブランチが残っていない（`git worktree list`、`git branch --list 'worktree-agent-*'`）。
- `completions` に、前の回から拾ったものと、取り込んだ子の Issue（完了の Note があり `InProgress`）と、目標を終えた Group が、実行する順に並んでいる。
- 最後に全検査を通した commit（取り込んだ worker のブランチの HEAD か、1 の継続で取り込んだ前の回のブランチの先端）から HEAD までの差分が Axon の記録だけ（`git diff --stat <その commit> HEAD -- . ':!.axon'` が空）。全検査を通した commit が無ければ、`base` から HEAD までの差分が Axon の記録だけ。
- `base` から HEAD までの回全体を、次で覆う。監督役が worker の取り込みの間にセッション用ブランチへ commit した変更は、6 の検査も 7 の全検査も経ていないため。
  - `git rev-list --merges <base>..HEAD` が空。
  - `git rev-list <base>..HEAD` の commit が、どれも、回の記録に書いた取り込んだ commit か、`.axon/` だけを変える commit（`git diff-tree --no-commit-id --name-only -r <commit> -- . ':!.axon'` が空）。
  - `git rev-parse HEAD` を控え、6 の回全体の検査と同じ方法（依存の入れ直しと、標準出力による終了コードの確かめを含む）で `<base>` に detach して `pnpm run check:protected <base> <控えた hash>` を実行し、戻る。終了コードが 0 か 1 で、検出の行の並びが、6 の「最後に取り込んだブランチの回全体の検査の出力」と同じ（どちらも、6 で無いものとして扱う Axon の記録の行を除く）（何も取り込んでいなければ、検出が無い）。最後に取り込んだ commit から後は Axon の記録だけなので、違えば、6 を経ていない変更か、記録の誤りがある。2 なら満たさない。戻った後に、セッション用ブランチをチェックアウトし、作業ツリーが空であることを確かめ直す。

満たせば `ready`（目標を進めず、1 の継続でも取り込まなかったなら `nothing`）、満たせなければ `failed` の結果ファイルを書いて終わる。

## 最終報告

`.tmp/supervise/report.md` に日本語で書き、同じ内容を Group の最終報告の Note にも残す（Group が無ければファイルだけ）。

- 結果ファイルの `status` と `head`、目標と選んだ理由、Group と Issue の ID と最終状態。
- セッション用ブランチの commit の一覧（`git log --oneline <base>..HEAD`）と、`completions` の一覧（前の回から拾ったものはそうと分かるように書く）。
- 全検査の結果と、指標の変化（ペースの指標のテストの合否、変えた目標値と設計記録の検証結果に書いた値）。
- 保護範囲の検出結果と judge の判断、終了監査の結果、「取り込める状態を確かめる」の `base` からの検査の結果。
- やり直しの回数と、上限に達したもの。
- ユーザーに聞かずに下した判断と理由、差し戻しと理由。
- この回で登録した `Undecided`（worker が登録したものを含む）と未解決事項、次の回への申し送り。
- この回が起動した worker の worktree とブランチの名前、削除した前の回の残りと、残した・残った worktree とブランチ（1 の「残す」で残したものは、ブランチの名前と先端の hash と、それを挙げた Entity の ID）。
