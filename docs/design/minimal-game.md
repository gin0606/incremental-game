# 最小ゲームのペースの仮の目標値

## 目的

最小ゲーム（`src/core/game.ts`。コレクター、工場、造幣所、精錬所、改良、自動購入、控えめな自動購入）について、ペースの指標のテストが動き、ゲームを壊す変更を検出できることを確かめるための目標値を置く。

**この目標値は判定の仕組みを確かめるための仮の値で、ゲームの体験の目標ではない。** 帯の多くは、2026-11-21 時点の最小ゲームの測定値に余裕を持たせて置いた。ゲームの題材と数値を設計するときに、出典から導いた仮説として置き直す。指標が実際のプレイヤーの体験を保証しないことは [README](README.md#指標が保証しないこと) に書いた。

目標値のファイル: [minimal-game.targets.json](minimal-game.targets.json)。遊ぶ時間、刻み幅、放置の局面などの測り方は判定の基盤の `src/sim/pace-settings.json` にあり、この記録では決めない。

## 出典

| 出典                                                                                                                                                                                                                                     | 根拠の種類                 | 読んだ範囲                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Anthony Pecorella, "The Math of Idle Games, Part I"（Game Developer, 2016-10-13）。https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i                                                                                    | 開発者の公開資料           | 記事の全文                                                                        |
| Anthony Pecorella, "The Math of Idle Games, Part II"（Game Developer, 2016-12-14）。https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii                                                                          | 開発者の公開資料           | 記事の全文                                                                        |
| Anthony Pecorella, "The Math of Idle Games, Part III"（Game Developer, 2017-02-01）。https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii                                                                                | 開発者の公開資料           | 記事の全文                                                                        |
| Anthony Pecorella, "Idle Chatter: What We All Can Learn from Self-Playing Games"（GDC 2016）。スライド: https://pt.slideshare.net/AnthonyPecorella/idle-chatter-gdc-2016-59734260                                                        | 開発者の公開講演           | スライドの文字（SlideShare のページから取り出したもの。講演の音声は聞いていない） |
| Anthony Pecorella, "Quest for Progress: The Math and Design of Idle Games"（GDC Europe 2016）。スライド: https://de.slideshare.net/AnthonyPecorella/quest-for-progress-gdc-europe-2016                                                   | 開発者の公開講演           | スライドの文字（同上）                                                            |
| José P. Zagal, Staffan Björk, Chris Lewis, "Dark Patterns in the Design of Games"（Foundations of Digital Games 2013, pp. 39–46）。https://gup.ub.gu.se/file/101018                                                                      | 査読論文                   | 全文（定義、4.1 Temporal Dark Patterns）                                          |
| Mark J. Nelson, "Game Metrics Without Players: Strategies for Understanding Game Artifacts"（AIIDE 2011 Workshop on Artificial Intelligence in the Game Design Process, pp. 14–18）。https://www.kmjn.org/publications/Metrics_IDP11.pdf | 査読論文（ワークショップ） | 全文                                                                              |
| Alexander Jaffe, "Understanding Game Balance with Quantitative Methods"（博士論文, University of Washington, 2013）。https://digital.lib.washington.edu/researchworks/handle/1773/22797                                                  | それ以外（博士論文）       | 要旨、1 章、4 章 4.2–4.3（restricted play）                                       |
| Erik D. Demaine ほか, "Cookie Clicker"（arXiv:1808.07540, 2018）。https://arxiv.org/abs/1808.07540                                                                                                                                       | それ以外（プレプリント）   | 要旨、定義 2.1、2.4.2 節                                                          |
| Sultan A. Alharthi ほか, "Playing to Wait: A Taxonomy of Idle Games"（CHI 2018）。https://doi.org/10.1145/3173574.3174195                                                                                                                | 査読論文                   | 要旨だけ（Monash University のリポジトリのページ）。本文は取得できず読んでいない  |

同じ著者の "Evaluating Competitive Game Balance with Restricted Play"（Jaffe ほか, AIIDE 2012）は取得できず、内容を含む博士論文を読んだ。

Alharthi ほかは要旨しか読んでいないため、原典の主張にも、導いた仮説と目標値の根拠にも使っていない。

## 原典の主張

- 放置されることが前提: "It is expected that players leave the game alone regularly"（Quest for Progress）。
- 離れていた時間が戻る理由になる: "The longer you don't the play the game, the bigger the reason to return!"（Idle Chatter, スライド 21）。"Quick check-ins can be very profitable by shifting up the growth curve"（同, スライド 20）。
- オフラインの計算: "Calculate offline the same as online"、"Use the math of exponential growth as a soft offline limit"（同, スライド 93）。
- 伸びの頭打ち: 値段は指数的に、生産は線形に伸び、"exponential growth will eventually catch and far exceed any polynomial growth"（Math of Idle Games, Part I）。
- 起伏: "Smooth curves are boring, lack surprise and delight"（Idle Chatter, スライド 31）。倍率は "Provide bumps and local victories"（Quest for Progress）。
- 選ぶこと: "players will regularly be deciding what to buy next"（Quest for Progress）。
- 不在を罰する設計: Playing by Appointment は "require that players play at specific times (and or dates) as defined by the game, rather than the players"（Zagal ほか, 4.1.2）。
- 選択の影響の測り方: ある振る舞いを制限したプレイヤーと制限しないプレイヤーの成績の差で、その振る舞いがゲームに与える影響を測る（restricted play。Jaffe, 4 章）。
- プレイヤーのいない指標の役割: 単純化したプレイヤーのモデルは "not intended mainly to insert a realistic player model, but to investigate how the game operates in various extreme or idealized cases"（Nelson, Strategy 6）。

どの出典にも、購入の間隔や放置できる時間の具体的な数値の目標は無い。

## 導いた仮説と目標値

| 仮説                                                                           | 目標値の項目                                            | 値                                                                              | 2026-11-21 の測定値（efficiency・roi、常に開いている）                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 進むほど、常に操作した場合とほとんど変わらない効率で離れていられる時間が伸びる | `idle.efficiency`、`idle.reach`、許容間隔が縮まない傾向 | 効率 0.995 以上。1 時間以降の局面で 12 時間以上、4 時間以降の局面で 24 時間以上 | 局面 0・1・4 時間で 60・600・14400 秒、12 時間以降は 28800 秒（組の最長）。自動購入の値段を下げた後は 60・3600・28800 秒、以降 28800 秒 |
| 長く離れて戻るほど、戻ったときに伸ばせる量が大きい                             | 報酬曲線の傾向                                          | 3 日離れたときが最も伸びる                                                      | 各局面で単調に増え、3 日が最大                                                                                                          |
| 不在を罰しない                                                                 | 不変条件                                                | 違反なし                                                                        | 違反なし                                                                                                                                |
| 序盤は節目が早く、間隔が伸びていく                                             | `milestones.ratio`                                      | 1〜50                                                                           | 2.0〜26.2                                                                                                                               |
| 伸びは鈍っても止まらない                                                       | `growth.speed`、`growth.change`                         | 0.008〜10 桁/時、比 0.005〜2                                                    | 2.66〜0.00084 桁/時、比 0.011〜0.69                                                                                                     |
| 後の局面まで毎秒の生産が伸び続ける（改良の到達点）                             | `growth.rateRatios`                                     | 72 時間の毎秒の生産が 12 時間の 10 倍以上                                       | 2026-11-22 に足した。足したときは 12.95 倍（[upgrade.md](upgrade.md#目標値)）                                                           |
| 買う機会が途切れない                                                           | `purchases.median`、`purchases.longest`                 | 中央値 600 秒以下、最長 2 時間以下                                              | 13.4 秒、1795 秒                                                                                                                        |
| 新しい要素が出る                                                               | `novelty.perDay`、`novelty.longestGap`                  | 1 日 1.2 以上、空白は 30 時間以下                                               | 1 日 1/3（後から解放されるのは工場だけ、36 秒）、空白は約 3 日                                                                          |
| 長い壁が無い                                                                   | `walls.longest`                                         | 最長 1 日以下                                                                   | 13 時間                                                                                                                                 |
| 選び方に意味があるが、最良の選び方を知らなくても置いていかれない               | `choice.lead`                                           | 0.005〜0.5 桁                                                                   | 0.0099〜0.063 桁（全組）                                                                                                                |

表の測定値は 2026-11-21 のもので、造幣所を足す前の版のもの。足した後の値は [mint.md](mint.md#検証結果) に、自動購入の値段を下げた後の値は [auto-buyer-price.md](auto-buyer-price.md#検証結果) に、改良を足した後の値は [upgrade.md](upgrade.md#検証結果) に、控えめな自動購入を足した後の値は [auto-buyer-stages.md](auto-buyer-stages.md#検証結果) に、精錬所を足した後の値は [refinery.md](refinery.md#検証結果) にある。

放置の許容間隔が 8 時間以上であることを求める局面（当時の `idle.reachBy`）は、2026-11-22 に 12 時間（43200 秒）から 4 時間（14400 秒）に早めた。自動購入の値段を 1000000 から 300000 に下げ、局面 4 時間の許容間隔が 14400 秒から 28800 秒に伸びたため。値段を戻すなどで局面 4 時間が 8 時間を下回る変更で失敗する。放置の許容間隔の段（`idle.reach`）で書くと `{ "by": 14400, "tolerance": 28800 }`（後に 86400 秒に上げた。下）。同じ日、局面 1 時間（3600 秒）以降で 3600 秒以上の段 `{ "by": 3600, "tolerance": 3600 }` を足した（根拠は [auto-buyer-price.md](auto-buyer-price.md#目標値)。後に、控えめな自動購入を足して 43200 秒に上げた。根拠は [auto-buyer-stages.md](auto-buyer-stages.md#目標値)）。局面 1 時間の許容間隔を 43200 秒より縮める変更で失敗する。同じ日、12 時間・24 時間ごとに開くボットでも放置の効率を測るようになった後に、局面 4 時間の段を `{ "by": 14400, "tolerance": 86400 }` に上げた。局面 4・12・24・48 時間で、24 時間までのどれかの間隔で開くと損をする変更で失敗する。根拠と、途中の段をゲームの数値で作らない理由は [idle-day.md](idle-day.md) にある。

1 日あたりの新要素の数は、最初から解放されている要素を数えない。最小ゲームで後から解放されるのは工場（35 秒）、改良（約 6.7 時間）、造幣所（約 29.9 時間）、精錬所（約 49.2 時間）なので、3 日で 4 つ（1 日 1.33）になる。下限 1.2 は、3 日のうちに 4 つの要素が解放されることを求め、どれかの解放を失う変更で失敗する（3 つなら 1 日 1.0）。精錬所を足す前は、3 つ（1 日 1）に対して下限を 0.9 に、改良を足す前は、工場と造幣所の 2 つ（1 日 2/3）に対して 0.6 にしていた。

新要素の空白の最長は 30 時間（108000 秒）以下にした。精錬所を足した後の測定値は 83472 秒（改良の解放から造幣所の解放まで）で、精錬所の解放（約 49.2 時間）の前後の空白は 69498 秒と 82069 秒。精錬所の解放が約 42 時間より前か約 60 時間より後にずれるか、精錬所の解放を失う（空白は造幣所の解放から遊ぶ時間の終わりまでの 151567 秒になる）と失敗する。精錬所を足す前は 2.5 日（216000 秒）以下にしていた。そのときの測定値は約 2 日（造幣所を足した後は 174159 秒、自動購入の値段を下げた後は 173579 秒、改良を足して造幣所の解放を遅らせ直した後は 174802 秒、改良の解放を遅らせた後は 151644 秒。造幣所の解放から遊ぶ時間の終わりまで）で、造幣所の解放が 12 時間より前か 2.5 日より後にずれるか、解放を失うと失敗した。造幣所を足す前は、序盤より後の新要素が無いため遊ぶ時間（3 日）そのものを上限にしており、空白は定義上それを超えないので、この帯は失敗しえなかった。

対数成長速度の下限は 0.008 桁/時（1 日で約 1.56 倍）にした。改良を足した後の最も遅い区間は 48〜72 時間の 0.0129 桁/時。改良を足す前の最も遅い区間は 12〜24 時間の 0.00264 桁/時で、改良を解放しない版では 24〜48 時間が 0.00121 桁/時まで落ちる。後から生産を伸ばす要素を失って、伸びが改良を足す前の速さに戻る変更で失敗する。下限は、その測定値 0.0129 に余裕を持たせた値。改良を足す前は 0.002 で、造幣所を足す前（0.0005）から造幣所で引き上げていた。

## 検証結果

2026-11-23、精錬所を足し、`novelty.perDay.min` を 1.2、`novelty.longestGap.max` を 108000 にした版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 18 項目すべてが通った。精錬所を解放しない版で帯「1 日あたりの新要素の数」「新要素の空白の最長」が、精錬所を最初から解放した版で同じ 2 つの帯と「選択の重み」が失敗した。測った値は [refinery.md](refinery.md#検証結果) にある。

2026-11-22、控えめな自動購入を足し、`idle.reach` の局面 1 時間の段を 3600 秒から 43200 秒に上げた版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 18 項目すべてが通った。控えめな自動購入を足す前の版では、上げた段が失敗した（局面 1 時間で 3600 秒、速い組）。測った値は [auto-buyer-stages.md](auto-buyer-stages.md#検証結果) にある。

2026-11-22、ゲームの数値を変えず、`idle.reach` の局面 4 時間の段を 28800 秒から 86400 秒に上げた版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 18 項目すべてが通った。自動購入が造幣所を買わない版では、上げた段が失敗した（局面 4・12・24 時間で 43200 秒）。測った値は [idle-day.md](idle-day.md#検証結果) にある。

2026-11-22、ゲームの数値を変えず、`growth.rateRatios` に 72 時間が 12 時間の 10 倍以上を足した版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 18 項目すべてが通った。測った値は [upgrade.md](upgrade.md#生産量の比を目標値に置いた後) にある。

2026-11-22、改良を足し、造幣所の解放を遅らせ直し、`growth.speed.min` を 0.008、`novelty.perDay.min` を 0.9 にした版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 16 項目すべてが通った。改良を解放しない版では、帯「区間ごとの対数成長速度」「1 日あたりの新要素の数」「新要素の空白の最長」が失敗した（速い組）。測った値は [upgrade.md](upgrade.md#検証結果) にある。

2026-11-22、自動購入の値段を 300000 に下げ、`idle.reachBy` を 14400 にした版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 16 項目すべてが通った。値段を 1000000 に戻した版では、傾向「放置の許容間隔が 14400 秒以降の局面で 28800 秒以上」が失敗した（局面 4 時間で 14400 秒）。測った値は [auto-buyer-price.md](auto-buyer-price.md#検証結果) にある。

2026-11-22、造幣所を足した版で、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。`pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で 16 項目すべてが通った。造幣所を解放しない版で帯「区間ごとの対数成長速度」「1 日あたりの新要素の数」「新要素の空白の最長」が、造幣所を最初から解放した版で新要素の 2 つの帯と「選択の重み」が失敗した。測った値と、ほかの版での失敗は [mint.md](mint.md#検証結果) にある。

2026-11-21、刻み幅 60 秒（守りは 420 秒）、遊ぶ時間 3 日。

- `pnpm run test`（速い組）と `pnpm run test:pace:full`（全組）で、16 項目すべてが通った。そのうち帯「新要素の空白の最長」は失敗しえず検証になっていないため、検証として通った項目は 15。
- 工場を最初から解放した版と、工場を解放しない版では、帯「1 日あたりの新要素の数」が失敗した（1 日あたり 0）。
- 自動購入を外した版では、傾向「放置の許容間隔が 43200 秒以降の局面で 28800 秒以上」が失敗した（許容間隔は 12 時間の局面で 3600 秒、1 日以降で 14400 秒）。帯「購入の間隔の最長」も失敗した。
- 手元のコインが減衰する版では、不変条件「放置で資源と生産量が失われず、一度に進めても刻んで進めても同じ」が失敗した。
- 生産量が時間で伸び、ゲームが資源を使って自動で買うゲームでは、刻み幅の守りが失敗した（刻み幅 60 秒と 420 秒で購入の回数が違った）。
- 最小ゲームの速い組の指標は、刻み幅 1・60/7・60・420 秒で一致した。

## 限界

- 帯は測定値から置いたもので、体験の目標としての根拠は無い。
- Alharthi ほかは要旨しか読んでいない。GDC の講演はスライドの文字だけを読んだ。
- 刻み幅の守りは、測り方の刻み幅とその 7 倍のどちらでも同じように見逃す違いを捉えない。
