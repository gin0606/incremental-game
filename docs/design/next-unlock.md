# 次の解放の条件の表示

## 目的

工場は、これまでに生産したコインが解放の条件（`src/core/game.ts` の `FACTORY_UNLOCK_EARNED`、今は 100）に達すると解放される。解放の前の工場は店に並ばない（`src/ui/view.ts` の `visible`）。この記録は、解放の前に次に解放される要素とその条件を画面に出すかと、その出し方（残りを示すか、解放の前の工場のボタンを見せるか、解放の後の扱い、文言）を決める。

表示はゲームの規則と数値（`src/core/`）を変えないため、ペースの目標値（[minimal-game.targets.json](minimal-game.targets.json)）は置かず、変えない。

## 出典

| 出典                                                                                                                                                                                                                                                                              | 根拠の種類 | 読んだ範囲                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sultan A. Alharthi, Olaa Alsaedi, Phoebe O. Toups Dugas, Theresa Jean Tanenbaum, Jessica Hammer, "Playing to Wait: A Taxonomy of Idle Games"（CHI 2018, Paper 621）。https://doi.org/10.1145/3173574.3174195 。読んだのは NSF の公開版 https://par.nsf.gov/servlets/purl/10061230 | 査読論文   | PDF の本文の文字を取り出し、9 ページの Implementing Games Across the Interactivity Spectrum と 9〜10 ページの Unlocking as Usability Support を読んだ（ページは PDF の各ページの "Page N" の表記による）。取り出した文字は斜体の語（ゲームの名前など）が抜けており、引用した文はその抜けを含まない箇所から取った。ほかの節は、この記録のためには読んでいない |
| Jakob Nielsen, "10 Usability Heuristics for User Interface Design"（Nielsen Norman Group, 1994-04-24, 2024-01-30 に見直し）。https://www.nngroup.com/articles/ten-usability-heuristics/                                                                                           | それ以外   | 1、2、6、8 の項目（それぞれの見出しの文と説明。6 と 8 は Tips も）                                                                                                                                                                                                                                                                                           |

## 原典の主張

- 次の解放とその得方を知らせること: 機能を少しずつ解放するゲームについて "Even though these features are gradually unfolded over time, the game keeps the player informed of what the next upgrades are and how to get them."（Alharthi ほか, p. 10, Unlocking as Usability Support）。同じ段落は、その手段を "One design approach to achieve this is for games to gradually present information and upgrades to the player as features unlock." と書き、"Giving the player options to hide/show features and future upgrades in the game could improve usability" と続ける（同, pp. 9–10）。
- 何を出すか: "Some games lack helpful information for the players to make effective decisions, while others clutter the interface with unnecessary elements. Designers of idle games need to make clear and effective design choices about what information needs to be presented, how the information is displayed, and when it should be available to the player."（Alharthi ほか, p. 9, Implementing Games Across the Interactivity Spectrum）。
- 状態を知らせること: "The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time." "When users know the current system status, they learn the outcome of their prior interactions and determine next steps."（Nielsen, 1）。
- 利用者の言葉で: "Use words, phrases, and concepts familiar to the user, rather than internal jargon."（Nielsen, 2）。
- 覚えさせないこと: "Minimize the user's memory load by making elements, actions, and options visible. The user should not have to remember information from one part of the interface to another."（Nielsen, 6）。Tips に "Reduce the information that users have to remember."。
- 要らない情報を置かないこと: "Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information in an interface competes with the relevant units of information and diminishes their relative visibility."（Nielsen, 8）。

どの出典も、解放の条件の文言、残りを数で示すか、解放の前のボタンを見せるかを直接には論じていない。Alharthi ほかが挙げる例のゲーム（Trimps、Kittens Game）が次の解放をどう示すかは、この記録のためには確かめていない。

## 導いた仮説

- 解放の前に、次に解放される要素（工場）とその条件（これまでに生産したコインが 100 に達すること）を示すと、プレイヤーは次に何が起きるかと、それが待てば届くことを知れる（Alharthi ほか, p. 10）。解放の条件はこれまでに生産したコインで決まり、購入では減らないので、待つだけで届くことも表示から読める。
- 条件までの残りを数で示すと、画面の別の場所にある「これまでに生産したコイン」と条件の値を覚えて引き算する手間が要らない（Nielsen, 6）。残りは状態の事実で（Nielsen, 1）、急がせる言葉を付けなければ、偽の緊急性にはならない。
- 解放の後は、この表示はもう次の判断に要らないので消す（Nielsen, 8）。工場が店に並ぶこと自体が、解放されたことを示す。
- 後から解放される要素が複数あるときは、まだ解放されていない要素のうち次に解放されるものだけを示す。工場の解放の後は改良（[upgrade.md](upgrade.md)）、改良の解放の後は造幣所（[mint.md](mint.md)）の条件に替える。どの条件もこれまでに生産したコインで、値の小さいものが必ず先に解放されるため、同時に複数の解放を待つことは無い。
- 解放の前の工場のボタンは見せない。見せると「工場を買う（150 コイン）」が押せない理由が額の不足なのか解放の前なのかを読み分ける必要がある。少しずつ見せる設計（Alharthi ほか, pp. 9–10）を保ち、次の解放は別の行で示す。

### 出典ではなく、仮説と設計原則から決めたこと

- 置き場所と形: 状態の一覧（`index.html` の `dl`）の末尾、「次に買えるまで」の後に、見出し「次の解放」と値の組で置く。すべての要素が解放された後は見出しと値を隠す。
- 文言: 「工場: これまでに生産したコインが 100 に達すると解放（あと 88）」。条件は画面の見出し「これまでに生産したコイン」と同じ語で書き、どの数を見れば進み具合が分かるかを結ぶ（Nielsen, 2）。「累計」のような内部の語は使わない。文言は事実（何が、何で解放されるか、あと幾つか）だけにし、急がせる言葉や、離れると失うと読める言葉を付けない。これは AGENTS.md「ゲームの設計原則」の使わない設計（偽の緊急性、損失回避を煽る表示）から導いた判断で、出典の主張ではない。
- 数の書き方: 条件の値と残りは切り上げる（`src/core/num.ts` の `format` の `"up"`）。表示した残りを生産すれば解放される。これまでに生産したコインの表示は切り捨てるので、条件の値が整数の今は、表示どうしを足すとふつうは条件の値になる（限界を参照）。条件の値は要素ごとの `*_UNLOCK_EARNED`（工場は `FACTORY_UNLOCK_EARNED`）から、残りはそれとこれまでに生産したコインの差から求め、画面側に 100 を書き写さない。解放の判定は許容誤差付きの比較（`isFactoryUnlocked` など）なので、表示を替える・消す時機は要素が店に並ぶ時機と同じ判定に従う。
- 解放までの時間は示さない。今の生産のままで解放に届くまでの時間は、これまでに生産したコインが購入で減らないため求まるが、次に買えるまでの待ち時間と並べると、どちらの時間かを読み分ける必要が出る（Nielsen, 8）。

## 目標値

置かない。表示はゲームの規則と数値を変えず、ペースの指標に影響しない。

## 検証結果

2026-11-22。

- `src/ui/view.test.ts`: 初期状態で「工場: これまでに生産したコインが 100 に達すると解放（あと 100）」、12.7 秒の生産で「あと 88」（残り 87.3 の切り上げ。これまでに生産したコインの表示は「12」）、採集機を買っても「あと 88」のまま、これまでに生産したコインが 99.9999 で「あと 1」、100 秒の生産で条件に達すると表示が無くなり工場が並ぶこと、許容誤差の範囲で 100 に届いた値（100 × (1 − 1e-10)）でも工場の解放と同じく表示が無くなることを確かめた。これまでに生産したコイン（0〜200）を変えた性質テストで、表示があるのは工場が隠れている間だけであることを確かめた。
- `e2e/unlock.e2e.ts`: 実ブラウザで、見出し「次の解放」の直後の値が、開いた直後に「あと 100」、12 秒後に「あと 88」、採集機を買っても「あと 88」、さらに毎秒 2 で 44 秒後に条件に達すると見出しが隠れ、値に hidden 属性が付き、工場を買うボタンが現れることを確かめた。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

2026-11-22、造幣所を足したとき。

- `src/ui/view.unlock.test.ts`: 工場の解放の後は「造幣所: これまでに生産したコインが 50000000 に達すると解放（あと 49999900）」を示すこと、残りを切り上げること（49999999.5 で「あと 1」）、許容誤差の範囲で 5e7 に届くと表示が無くなり造幣所が並ぶことを確かめた。これまでに生産したコイン（0〜200 と 0〜1e8）を変えた性質テストで、工場の条件は工場が隠れている間だけ、造幣所の条件は工場が見えて造幣所が隠れている間だけ示し、造幣所が見えると何も示さないことを確かめた。
- `e2e/unlock.e2e.ts`: 実ブラウザで、工場が解放されると見出し「次の解放」が見えたまま値が造幣所の条件に替わること、条件まであと 30 の保存データ（版 2）で開くと「あと 30」を示し、3 秒後に見出しが隠れて値に hidden 属性が付き、造幣所を買うボタンが現れることを確かめた。

2026-11-22、改良（[upgrade.md](upgrade.md)）を足し、造幣所の条件を 1.5e8 に遅らせたとき。

- `src/ui/view.unlock.test.ts`: 工場の解放の後は「改良: これまでに生産したコインが 6000000 に達すると解放（あと 5999900）」を、改良の解放の後は「造幣所: これまでに生産したコインが 150000000 に達すると解放（あと 144000000）」を示すことを確かめた。これまでに生産したコイン（0〜200 と 0〜3e8）を変えた性質テストで、どの条件も、その要素が隠れていて前の要素が見えている間だけ示し、造幣所が見えると何も示さないことを確かめた。範囲の上限は、造幣所の条件を遅らせる前の 1e8 では造幣所が見える状態を作らないため、3e8 に広げた。
- `e2e/unlock.e2e.ts`: 実ブラウザで、工場が解放されると値が改良の条件に替わること、改良の条件まであと 30 の保存データ（版 3）で開くと 1 秒後に値が造幣所の条件に替わり、改良を買うボタンが現れること、造幣所の条件まであと 30 の保存データで開くと 1 秒後に見出しが隠れることを確かめた。

## 限界

- 表示がプレイヤーの離れ方や満足に与える影響は測っていない。シミュレーターのボットは表示を読まない。
- 置き場所、文言、残りを示すこと、解放の前のボタンを見せないこと、解放の後に消すことには直接の出典が無く、出典から導いた仮説と設計原則から決めた。Alharthi ほかは、PDF から取り出した文字のうち上の範囲だけを読み、例に挙がったゲームの実際の表示は確かめていない。
- 表示どうしを足すと条件の値になるのは、条件の値が 10 億未満の整数で、二つの表示の丸めがそろうときだけ。`format` は、これまでに生産したコインと残りを別々に有効数字 12 桁へ丸めてから切り捨て・切り上げるため、整数のごく近く（たとえば 98.999999999993）では、これまでに生産したコインが「99」、残りが「あと 2」になり、足すと 1 多くなりうる。残りは実際より少なくは示さず、表示した残りを生産すれば解放されることは変わらない。0.09〜0.13 秒刻みで生産を進めた 6 万余りの状態ではこのずれは出なかった。条件の値が整数でない（たとえば 150.5）か 10 億以上（指数表記）のときは、足しても条件の値にならない。
- 表示が扱う要素は、条件の量がこれまでに生産したコインの要素だけで、`src/ui/view.ts` の `unlocks` に解放の順で並べる。条件の量がこれまでに生産したコインでないもの（ほかの資源や、購入の数）や、同時に複数の解放を待つ場合の並べ方は決めていない。そのときは、解放の条件を core 側で要素ごとに持たせ、表示がそれを読む形にするかを含めて決め直す。
