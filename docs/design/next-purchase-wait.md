# 次に買えるまでの待ち時間の表示

## 目的

画面に、今の生産量のままで次に何かを買えるまでの時間を出すかと、その出し方（何を測るか、時間の書き方、文言）を決める。プレイヤーが離れる前に、いつ戻れば次の品物を買えるかの見当を付けられるようにする。

表示はゲームの規則と数値（`src/core/`）を変えないため、ペースの目標値（[minimal-game.targets.json](minimal-game.targets.json)）は置かず、変えない。

## 出典

| 出典                                                                                                                                                                                    | 根拠の種類       | 読んだ範囲                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| José P. Zagal, Staffan Björk, Chris Lewis, "Dark Patterns in the Design of Games"（Foundations of Digital Games 2013, pp. 39–46）。https://gup.ub.gu.se/file/101018                     | 査読論文         | PDF から取り出した本文の 3 章（定義）、4.1.1 Grinding、4.1.2 Playing by Appointment の冒頭、6 章。4.1.2 の続きは取り出せた文字に無く、読んでいない |
| Anthony Pecorella, "The Math of Idle Games, Part I"（Game Developer, 2016-10-13）。https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i                                   | 開発者の公開資料 | 記事の全文                                                                                                                                         |
| Jakob Nielsen, "10 Usability Heuristics for User Interface Design"（Nielsen Norman Group, 1994-04-24, 2024-01-30 に見直し）。https://www.nngroup.com/articles/ten-usability-heuristics/ | それ以外         | 1 と 2 の項目                                                                                                                                      |

Pecorella の GDC の講演のスライド（[最小ゲームの記録](minimal-game.md#出典)に挙げたもの）は、SlideShare が自動の取得を拒んだため、この記録のためには読み直していない。そのため、この記録の根拠に使っていない。

## 原典の主張

- 待ちが伸びていくこと: "eventually the costs become overwhelming, and the time you would have to wait to be able to afford the next generator gets prohibitively long."（Pecorella, Part I）。
- 時間の見積もりの難しさ: Grinding について、プレイヤーは "may have difficulties judging exactly how much time the game will actually demand"（Zagal ほか, 4.1.1）。
- 不在を罰する設計: Playing by Appointment は "require that players play at specific times (and or dates) as defined by the game, rather than the players"（Zagal ほか, 4.1.2）。
- 仕組みが見えていること: "While a game may employ dark patterns, these may be transparent to players, thus rendering them ordinary patterns or ineffective."（Zagal ほか, 6 章）。
- 状態を知らせること: "The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time." "When users know the current system status, they learn the outcome of their prior interactions and determine next steps."（Nielsen, 1）。
- 利用者の言葉で: "Use words, phrases, and concepts familiar to the user, rather than internal jargon."（Nielsen, 2）。

どの出典も、待ち時間を画面に出すことや、その書き方を直接には論じていない。

## 導いた仮説

- 次の品物までの待ち時間は、インクリメンタルゲームの進行で伸びていく量そのもの（Pecorella）で、プレイヤーが次にいつ戻るかを決める材料になる（Nielsen, 1）。表示すれば、どれだけ離れていられるかを自分で見積もる手間が減る（Zagal ほか, 4.1.1 の、時間を見積もりにくいことへの手当て）。
- 戻る時刻はゲームではなくプレイヤーが決める（Zagal ほか, 4.1.2 の裏返し）。この表示は戻る時刻を指示せず、遅れて戻っても失うものは無い（コインは貯まり続け、オフラインもオンラインと同じ計算で進む）。そのため文言は事実（待ち時間の見積もり）だけにし、急がせる言葉や、戻らないと損をすると読める言葉を使わない。これは AGENTS.md「ゲームの設計原則」の使わない設計（偽の緊急性、損失回避を煽る表示）から導いた判断で、出典の主張ではない。

### 出典ではなく、仮説と設計原則から決めたこと

- 測る量: 見えている品物のうち最も安いものの値段に、手元のコインが今の毎秒の生産量で届くまでの秒数。生産量は何かを買うまで変わらない。自動購入があっても、最初に値段に届くのはこの品物で、自動購入はそれより前には買わない。そのため、待つ間の自動購入による支出と生産量の変化を見積もりに含めなくても、次に何かを買えるようになるまでの見積もりは変わらない。
- 丸め: 切り上げる。表示した時間が経てば届くようにし、値段の表示の切り上げ（`src/core/num.ts` の `format`）と同じく、足りないものを足りるように見せない。
- 時間の書き方: 1 分未満は「N 秒」、1 時間未満は「M 分 S 秒」、1 日未満は「H 時間 M 分」、それ以上は「D 日 H 時間」。上の 2 つの単位だけを出し、短い待ちは細かく、長い待ちは粗く示す。日数が 10 億以上（number で表せない長さを含む）なら、日数だけをゲームの数の表記（`1.24e9 日`）で示す。
- 文言（Nielsen, 2 の利用者の言葉に従い、内部の語を使わない）:
  - 待つとき: 「今の生産のままで約 12 秒」。「今の生産のままで」で見積もりの前提を、「約」で丸めていることを示し、確定した時刻と読ませない。時計の時刻は出さない。
  - 今買える品物があるとき: 「今買える」。待ち時間とは別の表示にする。
  - 生産量が 0 で届かないとき: 「生産が無いため届かない」。

## 目標値

置かない。表示はゲームの規則と数値を変えず、ペースの指標に影響しない。

## 検証結果

2026-11-21。

- `src/ui/view.test.ts`: 待ち時間が生産でコインが増えるにつれて縮み（12 秒 → 7 秒 → 1 秒）、届くと「今買える」に変わること、見えている品物のうち最も安いものまでの時間で、見えていない品物（買い終えた自動購入、解放の前の工場）はより安くても数えないこと、生産が無いときの表示、時間の書き方の境目（59 秒、59.5 秒 → 1 分 0 秒、3600 秒、1 日の手前、10 億日など）を確かめた。
- `e2e/game.e2e.ts`: 実ブラウザで、開いた直後に「今の生産のままで約 12 秒」、5 秒後に「約 7 秒」、さらに 7 秒後に「今買える」になり、採集機を買うボタンが押せることを確かめた。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

## 限界

- 表示がプレイヤーの離れ方や満足に与える影響は測っていない。シミュレーターのボットは表示を読まない。
- Zagal ほかの 4.1.2 は冒頭しか読めていない。GDC の講演のスライドはこの記録のためには読み直していない。
- 待ち時間の書き方（単位の区切り、上の 2 単位だけを出すこと）と文言には出典が無く、設計原則と仮説から決めた。
- 見積もりは、プレイヤーが待つ間に手で買うと変わる。その場合は買った後の状態で測り直して表示する。
- 待つ間に解放される品物は見積もりに含めない。今のゲームで後から解放されるのは工場だけで、解放の前に採集機の値段が工場の値段（150）を超えることは無い（採集機を 20 台にするには、解放に要る 100 より多く稼ぐ必要がある）ため、見積もりは変わらない。解放される品物を足すときは確かめ直す。
