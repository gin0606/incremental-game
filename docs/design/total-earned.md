# これまでに生産したコインの累計の表示

## 目的

画面に、これまでに生産したコインの累計（`GameState.totalEarned`）を出すかと、その出し方（見出し、数の書き方、置き場所）を決める。手元のコインは購入で減るが、累計は減らないので、遊んできた分の伸びを一つの数で見られるようにする。累計は、後から解放されるすべての要素（工場・改良・造幣所）の解放の条件（`src/core/game.ts` の `*_UNLOCK_EARNED`）にも使われている。

表示はゲームの規則と数値（`src/core/`）を変えないため、ペースの目標値（[minimal-game.targets.json](minimal-game.targets.json)）は置かず、変えない。

## 出典

| 出典                                                                                                                                                                                                                                                                              | 根拠の種類       | 読んだ範囲                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sultan A. Alharthi, Olaa Alsaedi, Phoebe O. Toups Dugas, Theresa Jean Tanenbaum, Jessica Hammer, "Playing to Wait: A Taxonomy of Idle Games"（CHI 2018, Paper 621）。https://doi.org/10.1145/3173574.3174195 。読んだのは NSF の公開版 https://par.nsf.gov/servlets/purl/10061230 | 査読論文         | PDF から取り出した本文の要旨、2 ページの資源の段落、7〜8 ページの分類（Incremental games）、8〜10 ページの考察（Rewarding Players for Waiting、Designing for Cognitive Offloading、Implementing Games Across the Interactivity Spectrum、Unlocking as Usability Support） |
| Anthony Pecorella, "The Math of Idle Games, Part I"（Game Developer, 2016-10-13）。https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i                                                                                                                             | 開発者の公開資料 | 記事の本文から、累計の生産量と画面の表示に触れる箇所を探し、引用した文を原文で確かめた。ほかの箇所は通読していない                                                                                                                                                        |
| Anthony Pecorella, "The Math of Idle Games, Part III"（Game Developer, 2017-02-01）。https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii                                                                                                                         | 開発者の公開資料 | 記事の本文から、累計の生産量と画面の表示に触れる箇所を探し、引用した文を原文で確かめた。ほかの箇所は通読していない                                                                                                                                                        |
| Jakob Nielsen, "10 Usability Heuristics for User Interface Design"（Nielsen Norman Group, 1994-04-24, 2024-01-30 に見直し）。https://www.nngroup.com/articles/ten-usability-heuristics/                                                                                           | それ以外         | 1 と 2 の項目                                                                                                                                                                                                                                                             |

## 原典の主張

- 伸びていく数: 主要な通貨は "This is the main number that is being incremented, generally the goal of the game."（Pecorella, Part I）。
- 累計の生産量を使う設計: プレステージの通貨を決める要素の一つに "Lifetime earnings (Cookie Clicker, AdVenture Capitalist)" を挙げ、要素を "These fall into two primary categories: lifetime stats and since-reset." と分ける（Pecorella, Part III）。
- 単調に増える資源: インクリメンタルゲームは "often they can be set into a state where all resources monotonically accumulate"（Alharthi ほか, p. 7, Incremental games）。
- 戻ったときの状態の把握: "Players must remember plans between sessions, assess the game state upon return, then carry out a plan."（Alharthi ほか, p. 9, Designing for Cognitive Offloading）。
- 何を出すか: "Designers of idle games need to make clear and effective design choices about what information needs to be presented, how the information is displayed, and when it should be available to the player."（Alharthi ほか, p. 9, Implementing Games Across the Interactivity Spectrum）。解放については "the game keeps the player informed of what the next upgrades are and how to get them."（同, p. 10, Unlocking as Usability Support）。
- 不在を罰しないこと: "idle games do not penalize the player by demanding attention."（Alharthi ほか, p. 8）。
- 状態を知らせること: "The design should always keep users informed about what is going on"（Nielsen, 1）。
- 利用者の言葉で: "The design should speak the users' language."（Nielsen, 2）。

どの出典も、累計の生産量を画面に出すことや、その書き方を直接には論じていない。Pecorella, Part III が累計を論じるのはプレステージの通貨の計算で、画面の表示ではない。

## 導いた仮説

- 手元のコインは購入のたびに 0 近くまで減るため、それだけでは遊んできた分の伸びが一つの数に表れない。購入で減らない累計を出せば、伸びていく数（Pecorella, Part I）を購入に左右されずに見られる。累計はインクリメンタルゲームが単調に増やす量の一つで（Alharthi ほか, p. 7）、既存のゲームも累計の生産量を状態として持つ（Pecorella, Part III）。
- 戻ったときにゲームの状態を把握する手間があり（Alharthi ほか, p. 9）、累計は離れていた間に増えた分を、間の購入に関わらず示す。自動購入が離れている間に買っても、累計は減らない。

### 出典ではなく、仮説と設計原則から決めたこと

- 見出し: 「これまでに生産したコイン」。Nielsen, 2 の利用者の言葉に従い、「累計」「totalEarned」のような内部の語を使わず、何の数かを文で言う。購入で減らないことは「これまでに生産した」で表す。
- 数の書き方: 手元のコインと同じ規則（`src/core/num.ts` の `format` の既定。端数を切り捨て、10 億以上は `1.00e9` の指数表記）。同じ単位の数なので、並べたときに比べやすくする。切り捨てるため、生産した分より多くは見せない。
- 置き場所: 手元のコインの直後。同じコインの数を並べ、手元の数との違いを読み取りやすくする。
- 文言は事実（生産した量）だけにし、目標までの残りや、離れると失うと読める言葉を付けない。これは AGENTS.md「ゲームの設計原則」の使わない設計（偽の緊急性、損失回避を煽る表示）から導いた判断で、出典の主張ではない。

## 目標値

置かない。表示はゲームの規則と数値を変えず、ペースの指標に影響しない。

## 検証結果

2026-11-21。

- `src/ui/view.test.ts`: 初期状態で「0」、12.7 秒の生産で「12」（端数の切り捨て）、採集機を買って手元のコインが「1」に減っても累計は「12」のまま、その後の 5 秒（毎秒 2）で「22」に増えること、10 億から手元のコインと同じ指数表記（`1.23e9`）になることを確かめた。
- `e2e/game.e2e.ts`: 実ブラウザで、見出し「これまでに生産したコイン」の直後の値が、開いた直後に「0」、12 秒後に「12」、採集機を買って手元のコインが「0」になっても「12」、さらに 5 秒後に「22」になることを確かめた。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

## 限界

- 表示がプレイヤーの離れ方や満足に与える影響は測っていない。シミュレーターのボットは表示を読まない。
- 累計を画面に出すことと、見出し・数の書き方・置き場所には出典が無く、出典から導いた仮説と設計原則から決めた。Alharthi ほかの PDF は、取り出した本文のうち上の範囲を読み、関連研究と方法の節の詳細、付録のゲームの一覧は読んでいない。
- 累計は後から解放されるすべての要素の解放の条件に使われるが、この表示は条件の値を出さないため、解放までの進み具合は伝えない。次の解放とその得方を知らせること（Alharthi ほか, p. 10）に当たる表示は、[次の解放の条件の表示](next-unlock.md)で別に決めた。
