# 品物ごとに買うと得られるものの表示

## 目的

店（`index.html` の `#shop`）の品物は、名前と値段だけをボタンに出していた（「採集機を買う（12 コイン）」）。この記録は、品物ごとに買うと何が得られるか（採集機と工場は買うと増える毎秒の生産、自動購入は何をするか）を画面に出すかと、その出し方（置き場所、文言、数の書き方、見せる時機、出さないもの）を決める。

表示はゲームの規則と数値（`src/core/`）を変えないため、ペースの目標値（[minimal-game.targets.json](minimal-game.targets.json)）は置かず、変えない。

## 出典

| 出典                                                                                                                                                                                                                                                                              | 根拠の種類       | 読んだ範囲                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sultan A. Alharthi, Olaa Alsaedi, Phoebe O. Toups Dugas, Theresa Jean Tanenbaum, Jessica Hammer, "Playing to Wait: A Taxonomy of Idle Games"（CHI 2018, Paper 621）。https://doi.org/10.1145/3173574.3174195 。読んだのは NSF の公開版 https://par.nsf.gov/servlets/purl/10061230 | 査読論文         | PDF の本文の文字を取り出し、9 ページの Implementing Games Across the Interactivity Spectrum と、9〜10 ページの Unlocking as Usability Support を読んだ（ページは PDF の各ページの "Page N" の表記による）。ほかの節は、この記録のためには読んでいない |
| Anthony Pecorella, "The Math of Idle Games, Part I"（Game Developer, 2016-10-13）。https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i                                                                                                                             | 開発者の公開資料 | 記事の全文                                                                                                                                                                                                                                            |
| Jakob Nielsen, "10 Usability Heuristics for User Interface Design"（Nielsen Norman Group, 1994-04-24, 2024-01-30 に見直し）。https://www.nngroup.com/articles/ten-usability-heuristics/                                                                                           | それ以外         | 1、2、4、6、8 の項目（それぞれの見出しの文、説明、Tips）                                                                                                                                                                                              |

## 原典の主張

- 何を買うかの選択: 生産するもの（generator）が複数あると "Now the player has choices about what to invest in, and things get more complicated."。最適な買い方のモデルでは "we define “optimal” as having the best income:cost ratio, and we determine that at every purchase opportunity."（Pecorella, Part I）。
- 優先順位を見つけること: 生産するものごとの倍率を変えると、進むにつれて優先するものが入れ替わり、"The player gets to try to identify these priorities (they won’t always be obvious right away), and this provides more variety and less predictability."（Pecorella, Part I）。プレイヤーは最適な手順どおりには買わず、"players usually buy in bulk to simplify the decision process"（同）。
- 判断に要る情報: "Some games lack helpful information for the players to make effective decisions, while others clutter the interface with unnecessary elements. Designers of idle games need to make clear and effective design choices about what information needs to be presented, how the information is displayed, and when it should be available to the player."（Alharthi ほか, p. 9, Implementing Games Across the Interactivity Spectrum）。
- 少しずつ見せること: 機能が解放されるにつれて見せるゲームは "the interface of these games gradually unfolds features to the player, allowing players to make clear decisions."（Alharthi ほか, p. 10, Unlocking as Usability Support）。
- 状態を知らせること: "The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time." "When users know the current system status, they learn the outcome of their prior interactions and determine next steps."（Nielsen, 1）。1 の Tips に "no action with consequences to users should be taken without informing them."。
- 利用者の言葉で: "Use words, phrases, and concepts familiar to the user, rather than internal jargon."（Nielsen, 2）。
- 一貫性: "Users should not have to wonder whether different words, situations, or actions mean the same thing."（Nielsen, 4）。
- 覚えさせないこと: "Minimize the user's memory load by making elements, actions, and options visible. The user should not have to remember information from one part of the interface to another. Information required to use the design (e.g. field labels or menu items) should be visible or easily retrievable when needed."（Nielsen, 6）。
- 要らない情報を置かないこと: "Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information in an interface competes with the relevant units of information and diminishes their relative visibility."（Nielsen, 8）。

どの出典も、店の品物に得られるものを示すことや、その文言・置き場所を直接には論じていない。Pecorella の「最適」は買い方のモデルの定義で、画面に何を出すかの主張ではない。

## 導いた仮説

- 採集機と工場のどちらを買うかは、値段と、買うと増える生産量を比べる選択になる（Pecorella, Part I）。ゲームもこの選択の重みをペースの指標で測っている（[minimal-game.md](minimal-game.md)）。値段だけを示すと、増える生産量は、買ってから「毎秒の生産」の変化を見て覚えるしかない。品物ごとに増える毎秒の生産を値段の隣に示すと、比べる材料が判断の場所に揃う（Alharthi ほか, p. 9。Nielsen, 6）。
- 自動購入は 300000 コイン（この記録を書いたときは 1000000。[auto-buyer-price.md](auto-buyer-price.md) で下げた）と、序盤に貯めて買う額で、それまでのどの品物とも違う働きをする。何をするかが分からなければ、貯めて買う価値を判断できない（Alharthi ほか, p. 9）。買うとコインを自動で使うようになるので、その働きを買う前に示す（Nielsen, 1 の Tips）。
- 出すのは、得られるもの（増える毎秒の生産、自動購入の働き）までにし、値段あたりの生産量や、どれが最も得かは示さない。優先順位を見つけることは遊びの一部で（Pecorella, Part I）、比べる材料を示せば、プレイヤーは自分の選び方で選べる。割合や最良の品物まで示すと、選択がその表示に従うだけになり、情報も増える（Nielsen, 8）。

### 出典ではなく、仮説と設計原則から決めたこと

- 置き場所: 品物ごとに 1 行（`p` 要素）にし、ボタンの右に説明の文を置く。説明はボタンの説明（`aria-describedby`）にもし、支援技術でもボタンと一緒に読めるようにする。ボタンの文言（名前と値段）は変えない。ボタンに含めると、ボタンが長くなり、自動購入の働きのような長い文が押す対象の名前になるため。
- 見せる時機: 説明はボタンと同じ行に置き、行ごと隠す。品物が見えている間（工場・改良・採集機の改修・造幣所・精錬所・交易所は解放の後、自動購入は買い終える前）だけ出る（Alharthi ほか, p. 10 の、少しずつ見せる設計を保つ）。
- 文言:
  - 採集機・工場・造幣所・精錬所・交易所: 「買うと毎秒の生産が 1 増える」「買うと毎秒の生産が 10 増える」「買うと毎秒の生産が 30 増える」「買うと毎秒の生産が 100 増える」「買うと毎秒の生産が 300 増える」。状態の一覧の見出し「毎秒の生産」と同じ語を使い、どの数が増えるかを結ぶ（Nielsen, 2・4）。「+1」や「生産量」のような記号や別の語は使わない。
  - 改良: 「買うと毎秒の生産が 7 増える（すべての施設の生産が 1.25 倍になる）」。増える量はほかの品物と同じ書き方にし、括弧で倍率を添える。増える量だけでは、施設が増えるほど改良の増分も大きくなることが読めないため。倍率は `UPGRADE_MULTIPLIER` から求める。
  - 採集機の改修: 「買うと毎秒の生産が 10 増える（採集機の生産が 2 倍になる）」（採集機 10 台のとき）。改良と同じ書き方にし、倍率が掛かるのが採集機だけであることを括弧に書く。倍率は `COLLECTOR_UPGRADE_MULTIPLIER` から求める（[collector-upgrade.md](collector-upgrade.md)）。
  - 自動購入: 「採集機・工場・造幣所・精錬所・交易所・改良・採集機の改修を、買える額に達するたびに自動で買う」（造幣所を足す前は「採集機と工場を、…」、改良を足す前は「採集機・工場・造幣所を、…」、精錬所を足す前は「採集機・工場・造幣所・改良を、…」、交易所を足す前は「採集機・工場・造幣所・精錬所・改良を、…」、採集機の改修を足す前は「採集機・工場・造幣所・精錬所・交易所・改良を、…」）。ゲームの規則（`src/core/auto-buy.ts` の自動購入）の働きを、プレイヤーの語（「買える額」）で書く。どれを先に買うか（値段あたりの生産の増分が大きいもの）は書かない。上の仮説と同じく、どれが得かを示すことになり、文も長くなるため。
  - 控えめな自動購入: 「採集機・工場・造幣所・精錬所・交易所・改良・採集機の改修を、払った後も今の生産の 10 分ぶんのコインが残るときに自動で買う」（精錬所を足す前は「採集機・工場・造幣所・改良を、…」、交易所を足す前は「採集機・工場・造幣所・精錬所・改良を、…」、採集機の改修を足す前は「採集機・工場・造幣所・精錬所・交易所・改良を、…」）。自動購入と同じ書き方にし、違い（手元に残すコイン）だけを足す（[auto-buyer-stages.md](auto-buyer-stages.md#店での見せ方)）。
  - どれも事実だけにし、急がせる言葉や、買わないと損をすると読める言葉を付けない。これは AGENTS.md「ゲームの設計原則」の使わない設計（偽の緊急性、損失回避を煽る表示）から導いた判断で、出典の主張ではない。
- 数の書き方と求め方: 増える毎秒の生産は、買ったものを足した状態（`withPurchase`）と今の状態の生産量（`production`）の差を、毎秒の生産の表示と同じ書き方（`src/core/num.ts` の `format`、切り捨て、10 億以上は指数表記）で示す。切り捨てて、増えない分を増えるように見せない。差はゲームの規則から求め、画面側に 1 や 10 を書き写さない。毎秒の生産が 10 億未満（表示が整数）の間は、改良を 1 つも持たなければ、示した数が、買った後の「毎秒の生産」の表示と今の表示の差に等しい。改良を持つと毎秒の生産に端数が出るため、差は示した数か、それより 1 多い（検証結果を参照）。

## 目標値

置かない。表示はゲームの規則と数値を変えず、ペースの指標に影響しない。

## 検証結果

2026-11-22。

- `src/ui/view.test.ts`: 初期状態で採集機に「買うと毎秒の生産が 1 増える」、解放の前の工場に「買うと毎秒の生産が 10 増える」（品物は見えていない）、自動購入に「採集機と工場を、買える額に達するたびに自動で買う」を返すことと、採集機 3 台・工場 2 台の状態でも採集機は 1、工場は 10 と示すことを確かめた。到達しうる形の状態（採集機 0〜300 台、工場 0〜100 台、コイン 0〜1e200）を生成する性質テストで、採集機と工場それぞれについて、示す数が、買ったものを足した状態の「毎秒の生産」の表示と今の表示の差に等しいことを確かめた。
- `e2e/shop.e2e.ts`: 実ブラウザで、開いた直後に採集機のボタンの説明が「買うと毎秒の生産が 1 増える」、自動購入のボタンの説明が「採集機と工場を、買える額に達するたびに自動で買う」で、どちらの文も見えていること、工場の説明の文は解放の前は隠れていることを確かめた。12 秒後に採集機を買うと「毎秒の生産」が 1 から 2 になり、さらに 44 秒後に工場が解放されると、工場のボタンとその説明「買うと毎秒の生産が 10 増える」が見えることを確かめた。自動購入の値段ちょうどのコインを持つ保存データで開いて自動購入を買うと、そのボタンと説明が隠れることを確かめた。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

2026-11-22、造幣所（[mint.md](mint.md)）を足したとき。`src/ui/view.test.ts` で、造幣所に「買うと毎秒の生産が 30 増える」を示すことと、性質テストで示す数が「毎秒の生産」の表示の差に等しいことを、採集機・工場と同じく確かめた。`e2e/unlock.e2e.ts` で、解放された造幣所のボタンの説明が「買うと毎秒の生産が 30 増える」であることを確かめた。自動購入の説明は「採集機・工場・造幣所を、買える額に達するたびに自動で買う」に替え、`src/ui/view.test.ts` と `e2e/shop.e2e.ts` で確かめた。

2026-11-22、改良（[upgrade.md](upgrade.md)）を足したとき。`src/ui/view.unlock.test.ts` で、採集機 10 台と工場 2 台（毎秒 30）で改良に「買うと毎秒の生産が 7 増える（すべての施設の生産が 1.25 倍になる）」を示すことを確かめた。`src/ui/view.test.ts` の性質テストで、改良を持たない状態では示す数が「毎秒の生産」の表示の差に等しく、改良を持つ状態（毎秒の生産が 10 億未満）では差が示す数か 1 多いことを確かめた。`e2e/unlock.e2e.ts` で、解放された改良のボタンの説明が同じ文であることを、`src/ui/view.test.ts` と `e2e/shop.e2e.ts` で自動購入の説明が「採集機・工場・造幣所・改良を、買える額に達するたびに自動で買う」であることを確かめた。

2026-11-23、精錬所（[refinery.md](refinery.md)）を足したとき。`src/ui/view.test.ts` で、解放の前の精錬所に「買うと毎秒の生産が 100 増える」を示すことと、性質テストで示す数が「毎秒の生産」の表示の差に等しいこと（改良を持つ状態では差が示す数か 1 多いこと）を、ほかの施設と同じく確かめた。`src/ui/view.refinery.test.ts` で、精錬所を 1 つ持つ状態で同じ文を示すことを確かめた。`e2e/refinery.e2e.ts` で、解放された精錬所のボタンの説明が「買うと毎秒の生産が 100 増える」で、買うと「毎秒の生産」が 30 から 130 になることを確かめた。自動購入と控えめな自動購入の説明は精錬所を含む文に替え、`src/ui/view.test.ts` と `e2e/shop.e2e.ts` で確かめた。

2026-11-23、交易所（[exchange.md](exchange.md)）を足したとき。`src/ui/view.test.ts` で、解放の前の交易所に「買うと毎秒の生産が 300 増える」を示すことと、性質テストで示す数が「毎秒の生産」の表示の差に等しいこと（改良を持つ状態では差が示す数か 1 多いこと）を、ほかの施設と同じく確かめた。`src/ui/view.exchange.test.ts` で、交易所を 1 つ持つ状態で同じ文を示すことを確かめた。`e2e/exchange.e2e.ts` で、解放された交易所のボタンの説明が「買うと毎秒の生産が 300 増える」で、買うと「毎秒の生産」が 30 から 330 になることを確かめた。自動購入と控えめな自動購入の説明は交易所を含む文に替え、`src/ui/view.test.ts` と `e2e/shop.e2e.ts` で確かめた。

2026-11-23、採集機の改修（[collector-upgrade.md](collector-upgrade.md)）を足したとき。`src/ui/view.collector-upgrade.test.ts` で、採集機 3 台と採集機の改修 1 つで採集機の改修に「買うと毎秒の生産が 6 増える（採集機の生産が 2 倍になる）」を示すことと、性質テストで、改良を持たない状態では示す数が「毎秒の生産」の表示の差に等しく、改良を持つ状態（毎秒の生産が 10 億未満）では差が示す数か 1 多いことを確かめた。`e2e/collector-upgrade.e2e.ts` で、採集機 10 台で解放された採集機の改修のボタンの説明が「買うと毎秒の生産が 10 増える（採集機の生産が 2 倍になる）」で、買うと「毎秒の生産」が 30 から 40 になることを確かめた。自動購入と控えめな自動購入の説明は採集機の改修を含む文に替え、`src/ui/view.test.ts` と `e2e/shop.e2e.ts` で確かめた。`e2e/shop.e2e.ts` は、採集機の説明が採集機の改修の説明の書き出しと同じ語で始まるため、採集機の説明を文全体の一致で探す。

## 限界

- 表示がプレイヤーの選び方や満足に与える影響は測っていない。シミュレーターのボットは表示を読まない。
- 置き場所、文言、値段あたりの生産量や最良の品物を示さないことには直接の出典が無く、出典から導いた仮説と設計原則から決めた。Alharthi ほかは、PDF から取り出した文字のうち上の範囲だけを読んだ。
- 自動購入の働きの文は、ゲームの規則を言葉にしたもので、規則から求めていない。自動購入が買う品物や時機を変えるときは、`src/ui/view.ts` の文も合わせて直す。この対応はテストで守っていない。
- 増える毎秒の生産は、今の生産量と買った後の生産量の差で求める。生産量が number の精度（およそ 9e15）を超える大きさになると、差の桁が失われうる。今のゲームでは台数の値段が指数的に伸びるため、そこまでの生産量には届かない。毎秒の生産が 10 億以上になると、毎秒の生産の表示は指数表記（有効数字 3 桁）になり、示した増分は買った後の表示の変化として見えないことがある。また、増分の表示は整数に切り捨てるので、1 未満の増分（たとえば倍率で 0.5 増える品物）は「0 増える」と示す。そうした品物を足すときは書き方を決め直す。
- 増える毎秒の生産は、買う 1 つの分だけを示す。何台か続けて買ったときの合計は示さない。改良のようにほかの品物の生産を変える品物も、今の生産量と買った後の生産量の差で示すため、増える量は正しいが、改良を持つと上のとおり表示の差と 1 ずれることがある。
