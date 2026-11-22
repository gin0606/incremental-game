# 離れていた間に進んだことの知らせ

## 目的

ゲームは開いたときに、保存した時刻から今までをオフラインの経過として `advance` で一度に進める（`src/ui/restore.ts` の `restore`）。この記録は、そのときに離れていた間に進んだこと（離れていた時間、その間に生産したコイン、自動購入で増えた施設と改良）を画面で知らせるかと、その出し方（置き場所、いつ消すか、文言、数の書き方、ごく短い不在で知らせるかの閾値）を決める。

表示はゲームの規則と数値（`src/core/`）とオフラインの計算を変えないため、ペースの目標値（[minimal-game.targets.json](minimal-game.targets.json)）は置かず、変えない。

## 出典

| 出典                                                                                                                                                                                                                                                                              | 根拠の種類 | 読んだ範囲                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sultan A. Alharthi, Olaa Alsaedi, Phoebe O. Toups Dugas, Theresa Jean Tanenbaum, Jessica Hammer, "Playing to Wait: A Taxonomy of Idle Games"（CHI 2018, Paper 621）。https://doi.org/10.1145/3173574.3174195 。読んだのは NSF の公開版 https://par.nsf.gov/servlets/purl/10061230 | 査読論文   | PDF の本文の文字を取り出し、6 ページの放置ゲームの条件の箇条書きと、8 ページの Why Idle Games Are Interesting（Playful Idling まで）と Rewarding Players for Waiting を読んだ（ページは PDF の各ページの末尾の "Page N" の表記による）。取り出した文字は行末で語を切るハイフンを含み（"sup-port" など）、斜体の語（ゲームの名前など）が改行で切れているため、引用ではそのハイフンと改行を除いた。ほかの節は、この記録のためには読んでいない |
| Jakob Nielsen, "Response Times: The 3 Important Limits"（Nielsen Norman Group, 1993-01-01。Usability Engineering の 5 章の抜粋に、2014 年の追記を含む）。https://www.nngroup.com/articles/response-times-3-important-limits/                                                      | それ以外   | 本文の全体（1993 年の抜粋と、2014 年の追記の 3 つの限界）                                                                                                                                                                                                                                                                                                                                                                                   |
| Jakob Nielsen, "10 Usability Heuristics for User Interface Design"（Nielsen Norman Group, 1994-04-24, 2024-01-30 に見直し）。https://www.nngroup.com/articles/ten-usability-heuristics/                                                                                           | それ以外   | 1、3、4、6、8 の項目（それぞれの見出しの文と説明。3 と 6 は Tips も）                                                                                                                                                                                                                                                                                                                                                                       |

## 原典の主張

- 放置ゲームでは、いない間も進む: 放置ゲームの条件の一つとして "waiting is playing—the game can progress while the player is not present, often through mechanics that automate gameplay;"、もう一つとして "temporal flexibility—players have the flexibility to set aside the game until they are ready to return to it, with minor or no penalty for not returning [37];"（Alharthi ほか, p. 6）。
- 戻ったことに報いる: "Idle games, in general, feature a balance between rules that encourage players to leave the game and rules that reward them for returning."（Alharthi ほか, p. 8, Why Idle Games Are Interesting）。"Conversely, the longer players go without interacting with the game, the more options they have when they return."（同, p. 8, Playful Idling）。
- 注意を求めて罰しない: "Additionally, idle games do not penalize the player by demanding attention. A player who idles for too long may forgo opportunities to acquire new resources, but typically does not place their existing successes at risk."（Alharthi ほか, p. 8）。
- 同じ節は、戻ったことへの報酬の例として、続けて何日も戻ると得る "returning bonuses" を挙げる（"Players are also rewarded returning bonuses [39] when they return to the game for consecutive days"、Alharthi ほか, p. 8, Rewarding Players for Waiting）。
- 10 秒を超えて離れた後は、状況をつかみ直す: "10 seconds is about the limit for keeping the user's attention focused on the dialogue."（Nielsen, Response Times, 1993 年の抜粋）。"10 seconds: Limit for users keeping their attention on the task." "Assume that users will need to reorient themselves when they return to the UI after a delay of more than 10 seconds."（同, 2014 年の追記）。どちらも、システムの応答を待つ時間についての主張。
- 状態を知らせること: "The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time." "When users know the current system status, they learn the outcome of their prior interactions and determine next steps."（Nielsen, Heuristics, 1）。
- 抜け出す手段: "Users often perform actions by mistake. They need a clearly marked "emergency exit" to leave the unwanted action without having to go through an extended process."。Tips に "Show a clear way to exit the current interaction, like a Cancel button."（Nielsen, Heuristics, 3）。
- 同じ意味かを迷わせないこと: "Users should not have to wonder whether different words, situations, or actions mean the same thing."（Nielsen, Heuristics, 4）。
- 覚えさせないこと: "Minimize the user's memory load by making elements, actions, and options visible. The user should not have to remember information from one part of the interface to another."（Nielsen, Heuristics, 6）。Tips に "Reduce the information that users have to remember."。
- 要らない情報を置かないこと: "Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information in an interface competes with the relevant units of information and diminishes their relative visibility."（Nielsen, Heuristics, 8）。

どの出典も、オフラインの進行を知らせる画面や、その文言、出す時間の閾値を直接には論じていない。Alharthi ほかが調べたゲームが、戻ったときにオフラインの進行をどう示すかは、この記録のためには確かめていない。

## 導いた仮説

- 戻ったときに、離れていた間に増えたものを示すと、離れていても報われたこと（Alharthi ほか, p. 8 の "reward them for returning"）をプレイヤーが読み取れる。今の画面は今の値だけを示すので、増えた量を知るには離れる前の値を覚えておく必要がある（Nielsen, Heuristics, 6）。増えた量は、オフラインの計算（`advance`）の結果という状態の事実で（Nielsen, Heuristics, 1）、新しい報酬を足すものではない。
- 示すのは、離れていた時間と、その間に生産したコインと、自動購入で増えた施設と改良。生産したコインは、手元のコインではなく、これまでに生産したコインの増分にする。自動購入が離れている間にコインを使うので、手元のコインの増分は、生産したよりも少なく、施設や改良が増えたときは減ることもある。施設と改良は増えたものだけを示し、増えなかったものは書かない（Nielsen, Heuristics, 8）。
- 10 秒以下の不在では知らせない。10 秒を超えて離れた後はプレイヤーが状況をつかみ直す必要がある（Nielsen, Response Times）ので、知らせはそのとき役に立ち、それより短い不在（再読み込み、別のタブが閉じるのを待っていたタブで遊び始めるとき）では、変わったことをプレイヤーは覚えていて、知らせは要らない情報になる（Nielsen, Heuristics, 8）。Nielsen の 10 秒はシステムの応答を待つ時間についての値で、離れていた時間に当てはめたのはこの記録の仮説（限界を参照）。
- 知らせはプレイヤーが閉じるまで出しておき、時間では消さない。放置ゲームは注意を求めない（Alharthi ほか, p. 8）ので、開いたまま画面を見ていないこともあり、時間で消すと、見ていなかったプレイヤーは知らせを失う。閉じる手段はボタンで示す（Nielsen, Heuristics, 3）。

### 出典ではなく、仮説と設計原則から決めたこと

- 置き場所: 見出しの直後に、領域（`index.html` の `#away`、名前は「離れていた間に進んだこと」）として置き、文と「閉じる」ボタンを並べる。開いて最初に目に入る位置にする。既存の知らせの欄（`#notice`）は、保存の失敗、時計が戻ったこと、タブの重複など、プレイヤーが対処を考える事柄に使っているので、進んだことの報告を混ぜない（Nielsen, Heuristics, 4）。
- 文言: 「離れていた 1 時間 1 分のあいだに、コインを 1271372 生産した。自動購入で採集機が 64 台、工場が 35 台増えた。」。施設と改良は採集機・工場・造幣所・精錬所・改良の順に、増えたものだけを並べる（精錬所は [refinery.md](refinery.md) で足した）。数え方は施設が「台」、改良が「個」（「改良が 12 個」）。「つ」は 10 以上の数に付けられないため使わない。どれも増えなければ、後の文を付けない。文言は事実（どれだけ離れていて、何が増えたか）だけにし、出迎えの言葉、急がせる言葉、離れると失うと読める言葉、戻ってくることを促す言葉を付けない。これは AGENTS.md「ゲームの設計原則」の使わない設計（偽の緊急性、損失回避を煽る表示、戻ってこさせるための通知）から導いた判断で、出典の主張ではない。施設と改良が増えるのは離れている間の自動購入だけなので、「自動購入で」と原因を書く。
- 数の書き方: 離れていた時間は、待ち時間の表示（[next-purchase-wait.md](next-purchase-wait.md)）と同じ書き方（上の 2 つの単位）で、端数を切り捨てる。待ち時間は表示した時間が経てば届くように切り上げるが、経った時間は、経っていない時間を経ったように見せないよう切り捨てる（`src/ui/view.ts` の `formatDuration`）。生産したコインは、持っている額と同じくゲームの数の表記（`src/core/num.ts` の `format`）で切り捨てる。
- 時計が保存時より戻っていたとき、保存データが無いとき、読み込めなかったときは知らせない。離れていた時間が求まらないか、進んでいないため。時計が戻ったときの既存の知らせ（`#notice`）は保つ。
- 戻ったことへの報酬は、表示だけにして、新しい報酬を足さない。Alharthi ほかが挙げる、続けて何日も戻ると得る報酬は、途切れると失うボーナスにあたり、AGENTS.md の使わない設計（連続ログインの途切れで失うボーナス）なので使わない。ブラウザの通知など、ページの外に出る知らせも使わない。

## 目標値

置かない。表示はゲームの規則と数値を変えず、ペースの指標に影響しない。

## 検証結果

2026-11-22。

- `src/ui/restore.test.ts`: 保存から 1 時間後に開くと「離れていた 1 時間 0 分のあいだに、コインを 43200 生産した。」（自動購入なし、毎秒 12）を添えること。離れていた時間が 10 秒ちょうどなら知らせず、10.001 秒なら「10 秒」と切り捨てて知らせること。生産したコインを手元のコインではなく、これまでに生産したコインの増分（1234.9 → 1234）で示すこと。増えた施設だけを示すこと（採集機だけ、工場だけ、両方）。自動購入を持つ状態を 10 分進めると、採集機が 48 台、工場が 22 台増えたことを添えること。保存データが無いとき、読み込めなかったとき、時計が戻っていたとき、保存時と同じ時刻のときは知らせないこと（既存のテストの期待値に知らせが無いことで確かめる）。
- `src/ui/session.test.ts`: 保存データから始めると、1 分の不在の知らせを遊んでいる状態から読めること。保存データが無ければ無いこと。
- `src/ui/view.test.ts`: 時間の書き方を切り捨てでも確かめた（0.9 秒 → 0 秒、6 − 4e-14 秒 → 6 秒、3659.9 秒 → 1 時間 0 分、1 日の手前、10 億日など）。切り上げの既存の境目は変えていない。
- `e2e/away.e2e.ts`: 実ブラウザで、採集機 2 台・工場 1 台・自動購入ありの保存データを置いて 1 時間 1 分後に開くと、「離れていた 1 時間 1 分のあいだに、コインを N 生産した。自動購入で採集機が N 台、工場が N 台増えた。」の形の文を示し、その数が画面の「これまでに生産したコイン」・採集機・工場の保存時からの増分と合い（このときは 1271372、64 台、35 台）、60 秒経っても消えず、「閉じる」で隠れること。保存データが無いとき、保存してから 10 秒後に開いたとき、時計が保存時より戻っていたとき（時計が戻ったことの知らせは出す）は示さないこと。閾値の比較を「10 秒未満で知らせない」に変えると 10 秒の場合のテストが落ちることも確かめた。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

## 限界

- 表示がプレイヤーの離れ方や満足に与える影響は測っていない。シミュレーターのボットは表示を読まない。
- 10 秒の閾値は、Nielsen がシステムの応答を待つ時間について述べた値を、プレイヤーが離れていた時間に当てはめた仮説で、離れていた時間についての出典は無い。Alharthi ほかは、PDF から取り出した文字のうち上の範囲だけを読み、例に挙がったゲームが戻ったときに何を示すかは確かめていない。
- 知らせるのは、開いたときに保存した時刻から進めた分だけ。開いたまま画面を見ていなかった間（タブを開いたまま離れていた間）は、遊んでいる間の経過として進むため知らせない。知らせを読まずに閉じて再び開くと、前の不在の分は示さず、最後に保存してからの不在だけを示す。
- 離れていた時間は端末の時計で測る。時計が先へ進んでいれば、その分も離れていた時間として示す（生産も同じ時計で数える）。
- 生産したコインは、これまでに生産したコインの増分を切り捨てて示す。画面の「これまでに生産したコイン」の表示も切り捨てなので、離れる前と後の表示の差とは 1 ずれることがある。
