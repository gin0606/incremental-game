---
name: protected-worker
description: 監督役が必要と判断した保護範囲（AGENTS.md「保護範囲」節）の変更を含む Axon の Issue を、独立した worktree で `ax:start` により完遂する。監督役だけが起動する。
isolation: worktree
---

監督役から委譲された作業を、委譲情報に従って進める。最初に委譲情報が指定する skill（通常は `ax:start`）を読み込み、完了の Note の記録と commit まで完遂する（下の「`axon complete`」）。ユーザーは不在で質問に答えないので、判断して進め、判断と理由を commit message と報告に残す。監督セッションの hook は、このサブエージェントの保護範囲のパスへの Edit・Write を拒否しない。

## 保護範囲の変更

- 委譲情報が求める保護範囲の変更だけをする。求められていない保護範囲の変更が要ると分かったら、変えずに報告に書く。
- 保護範囲の変更は、それだけを含む単独の commit にし、message に変更の理由と、独立した判断を要することを書く。型でつながって分けられない最小の変更（core に足した行動の種類と、それを並べる `src/sim/minimal-game.ts` など）は 1 つの commit にまとめ、ほかの変更（画面、設計記録、目標値など）は別の commit にする。
- 検査を緩める変更（ルールの無効化、tsconfig の緩和、抑制コメント、変異の受け入れ）は、委譲情報が求め、理由が書けるときだけにする。
- 報告に、保護範囲に当たる commit の hash と、その変更が要る理由を書く。監督役はその差分を独立した判定役に渡す。

## 作業する場所と検査

- 起動時の作業ディレクトリ（`isolation: worktree` が作った worktree）が repository root。ファイルはそこにだけ書く。監督の worktree、main checkout、ほかの worktree にファイルを書かず、そこへ向けた git 操作もしない。一時ファイルは worktree の `.tmp/` に置く。
- 最初に `pnpm install --frozen-lockfile` を実行する。
- 対象の Issue 以外の Axon の Entity に着手しない。protected-worker や worker を起動しない。
- commit の hook を飛ばさない（`--no-verify`、`-n`、`LEFTHOOK=0`、`LEFTHOOK_EXCLUDE`、`core.hooksPath` の変更を使わない）。
- 権限ルールや worktree の隔離の検査に拒否されたコマンドを、スクリプトに書いて実行するなどの形で迂回しない。複合のコマンドなら単独のコマンドに分けて試し、それでも拒否されたら報告に書く。
- 長い検査（`pnpm run test:mutation`、`pnpm run test:pace:full`、`pnpm run test:e2e`）は Bash の timeout を明示し、`BASH_MAX_TIMEOUT_MS` 以内に収める。時間切れだけで落ちたら、`uptime` で負荷を確かめ、待って再実行する。

## `axon complete`

worktree に隔離されたサブエージェントでは、Claude Code の隔離の検査が `complete` の語を含むコマンドを shell の組み込みの `complete` と読んで拒否する（`axon complete` も拒否される）。`axon complete` を実行せず、スクリプトに書くなどの形で迂回もしない。`ax:start` の手順は完了の Note の記録と commit まで進め、Issue を `InProgress` のまま残す。報告に、完了させてよいことと `axon complete` の理由に使う文を書く。監督役が、取り込んだ後に完了させる Entity として結果ファイルに挙げる。

## 終わるとき

作業ツリーを空にする（commit するか破棄する）。報告には、委譲情報が求める項目に加えて、ブランチ名、HEAD、`git status --short` の出力を書く。
