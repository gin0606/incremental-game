# 後の局面で 1 日離れていられること

## 目的

ペースの指標は、2026-11-22 から 12 時間・24 時間ごとに開くボットでも放置の効率を測る（[upgrade.md](upgrade.md#12-時間24-時間ごとに開くボットで測った後)）。最小ゲームの放置の許容間隔は、局面 0・1・4・12・24・48 時間で 60、3600、86400、86400、86400、86400 秒（86400 秒は組の最長の間隔）になった。この記録の前、目標値の放置の許容間隔の段（`idle.reach`）は、局面 1 時間以降で 3600 秒、局面 4 時間以降で 28800 秒までしか求めず、後の局面で 8 時間より長く離れられることを守らなかった。

この記録は次の 2 つを決める。

- 後の局面で 1 日離れていられることを目標値の段に置くか、置くならどの局面から求めるか。
- 許容間隔が局面 1 時間の 3600 秒から局面 4 時間で一度に 86400 秒へ伸びる形に、ゲームの数値で途中の段（たとえば局面 4 時間で 8 時間ほど）を作るか。

## 出典

| 出典                                                                                                                                                                                                                                                                      | 根拠の種類 | 読んだ範囲                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sultan A. Alharthi, Olaa Alsaedi, Phoebe O. Toups Dugas, Theresa Jean Tanenbaum, Jessica Hammer, "Playing to Wait: A Taxonomy of Idle Games"（CHI 2018, Paper 621）。https://doi.org/10.1145/3173574.3174195 。https://par.nsf.gov/servlets/purl/10061230 の PDF で読んだ | 査読論文   | pp. 6–9 の本文（Taxonomy of Idle Games、Interactivity Spectrum、Discussion and Design Implications のうち Shifting Interaction Levels まで）。2026-11-22 に PDF から取り出した文字で読んだ。ほかのページは読んでいない |

## 原典の主張

- 日々の活動の合間に置いておけること: "Being able to leave the game in the background, without interacting with it, makes these games easy to interleave with daily activities [35, 37, 54]."（Alharthi ほか, p. 8, Why Idle Games Are Interesting）。
- 長く離れるほど、戻ったときに多くを選べること: "Conversely, the longer players go without interacting with the game, the more options they have when they return."（同, p. 8, Playful Idling）。
- 決定が日をまたいで進むこと: "because they retain the characteristics of idle games, the player's economic decisions may play out across days, months, or years"（同, p. 8, Differentiating Incremental Games from Idle Games）。
- 開ける時間もプレイヤーの計画に入ること: "the player's plans must also include their physical ability to check on the game, their time and attention, and their ability to remember the plan."（同, p. 9, Playing at Planning）。
- 決まった間隔で戻らないと進行を失う形は、放置ゲームと区別される: "unlike idle games, social games do carry a penalty for players to wait too long: players must check in at specified intervals or lose progress."（同, p. 6, Idle Games）。放置ゲームの基準の一つは "features temporal flexibility—players have the flexibility to set aside the game until they are ready to return to it, with minor or no penalty for not returning"（同, p. 6）。
- 進むほど関わりが減ること: "idle games typically give the player more rewards for doing less as the game progresses."（同, p. 8, Against Playbour）。局面ごとに求める関わり方が変わること: "a more typical pattern is for different phases of each game to invite different levels of interaction."（同, p. 7, Interactivity Spectrum）。

原典は、局面ごとに何時間離れられるべきかの数値を示していない。

## 導いた仮説

- 後の局面では、日々の活動の合間に置いておけ、決定が日をまたいで進む（Alharthi ほか, p. 8）。そこで、1 日に 1 回開くだけでほとんど損をしないことを、後の局面の目安にする。1 日（86400 秒）は、日々の暮らしの 1 周期（寝て起きる、出かけて戻る）に当たる長さとして置いた仮説の値で、原典の数値ではない。
- [auto-buyer-price.md](auto-buyer-price.md#導いた仮説) の仮説は、局面 4 時間から「指標で測れる最長」を離れても損をしない時間にする。段 `{ "by": 14400, "tolerance": 28800 }` の 28800 秒は、その段を置いたときの組の最長の間隔だった。組の最長が 86400 秒になった今、同じ仮説は局面 4 時間から 86400 秒を求める。
- そこで、1 日を求め始める局面は 4 時間（14400 秒）にする。局面 4 時間の許容間隔を 1 日より縮めて途中の段を作る形は、下の「途中の段をゲームの数値で作らないこと」で採らないと決めたため、局面 4 時間から 1 日を守っても、採りうる途中の段（局面 1 時間の許容間隔を伸ばす形）を妨げない。

### 途中の段をゲームの数値で作らないこと

許容間隔は局面 1 時間の 3600 秒から局面 4 時間で一度に 86400 秒に伸びる。その間の途中の段（局面 1 時間か 4 時間で 8 時間ほど）を、この記録ではゲームの数値で作らないと決めた。

- 局面 4 時間以降は、600 秒ごとから 24 時間ごとまでのどのボットも、常に開いているボットと同じだけ生産する（効率 1.00000。60 秒ごとのボットは efficiency・roi の購入規則で 1.002〜1.007 と、常に開いているボットより多い）。自動購入（`src/core/game.ts`）は採集機・工場・造幣所・改良のすべてを買える額に届くたびに買い、自動購入が造幣所を買わない版を一時的に作ると、局面 24 時間で 24 時間ごとに開くボットの効率は 0.90095 に下がった（下の「検証結果」）。
- 局面 4 時間の許容間隔を 8 時間ほどにするには、許容間隔の定義（[README.md](README.md#放置の指標)）から、局面 4 時間で 12 時間か 24 時間ごとに開くボットの効率を 0.995 未満にする必要がある。自動購入が買わない品物を足す、自動購入の範囲を狭める、常に開いているプレイヤーだけが得をする操作を足す、のどれかになる。どれも離れたプレイヤーの損を増やすか、プレイヤーの時間を求める方向の変更で、AGENTS.md「ゲームの設計原則」の「離れていても報われる方向で作る」と、原典が放置ゲームと区別する「決まった間隔で戻らないと進行を失う」形（Alharthi ほか, p. 6）に向きが近づく。
- 離れたプレイヤーに損をさせない向き、つまり局面 1 時間の許容間隔を 3600 秒から伸ばして途中の段にする案も、今の数値では作れなかった。局面 1 時間の許容間隔は、局面の始まり（3600 秒）に自動購入をまだ持たず、4 時間後に戻るまで何も買わない 4 時間ごとのボット（効率 0.97808）で止まる。2026-11-22、全組・刻み幅 60 秒で、自動購入の値段だけを一時的に 300000 から変えて測ると、150000 では局面 1 時間の許容間隔が 86400 秒（局面の始まりに自動購入を持つ）、200000 では 3600 秒のままで、その間の値にならなかった。自動購入はすべての品物を一度に自動にするため、局面の始まりに持つかどうかで許容間隔が短いか組の最長かに分かれる。途中の段には、自動化を段階に分ける（施設ごとに自動購入を解放する、など）購入が要ると考えられ、購入の種類を足すと判定の基盤（`src/sim/minimal-game.ts`）も変わるため、この記録では扱わない（後に、控えめな自動購入で局面 1 時間を 43200 秒にした。[auto-buyer-stages.md](auto-buyer-stages.md)）。局面 1 時間の 3600 秒は、[auto-buyer-price.md](auto-buyer-price.md#導いた仮説) が序盤を品物を選んで買う局面として残すために選んだ値でもある。
- 「少しずつ伸びていく」は、局面 0・1・4 時間で 60、3600、86400 秒と、遊び始めの数時間で段階的に伸びる形で保つ（後に局面 1 時間は 43200 秒になった。[auto-buyer-stages.md](auto-buyer-stages.md)）。目標値の段は許容間隔の下限だけを求め、途中の段が縮むことを止める。一度に伸びすぎる形を止める上限は置かない。上限は、プレイヤーが長く離れられるようにするゲームの変更を判定で落とし、「離れていても報われる方向」と向きが逆になるため。

## 目標値

[minimal-game.targets.json](minimal-game.targets.json) の `idle.reach` の段 `{ "by": 14400, "tolerance": 28800 }` を `{ "by": 14400, "tolerance": 86400 }` に上げた。局面 4 時間（14400 秒）以降、今の測り方では局面 4・12・24・48 時間で、放置の許容間隔が 86400 秒以上であることを求める。目標値の段は、前の段より後の局面から確かめ始め、前の段より長い許容間隔を求める形でしか並べられず（[README.md](README.md#比べ方)）、同じ局面 4 時間から確かめる 28800 秒の段と 86400 秒の段は並べられないため、段を足さずに上げた。上げた段は前の段が求めたこと（28800 秒以上）をすべて求めるので、緩めていない。局面 1 時間の段（`{ "by": 3600, "tolerance": 3600 }`）と、目標値のほかの項目は変えていない。ゲームの数値も変えていない。

86400 秒は組の最長の間隔で、この段は、組のどの間隔（60 秒〜86400 秒）で開いても効率が 0.995 以上であることを求める。

## 検証結果

2026-11-22、遊ぶ時間 3 日、刻み幅 60 秒（守りは 420 秒）。値は、`src/sim/pace-settings.json` を `parseSettings`、`minimal-game.targets.json` を `parseTargets`（`src/sim/pace-targets.ts`）で読み、`measure(minimalGame, settings, targets, set, settings.step)`（`src/sim/pace.ts`）の `plays` の `rateRatios` と `idles` を書き出す一時的なスクリプトを `node` で実行して出した（リポジトリには置いていない）。

- 放置の許容間隔は、局面 0・1・4・12・24・48 時間で 60、3600、86400、86400、86400、86400 秒だった（全組の efficiency・roi の購入規則と、速い組の efficiency の購入規則で同じ。速い組は放置を efficiency でしか測らない）。局面ごとの効率は [upgrade.md](upgrade.md#12-時間24-時間ごとに開くボットで測った後) の表と同じ値だった。局面 4・12・24・48 時間で 600 秒ごとから 24 時間ごとまでのボットの効率は 1.00000 で、上げた段を満たす。
- 72 時間と 12 時間の毎秒の生産の比は 12.950（efficiency@always・roi@always）で、前と同じ。ゲームの数値を変えていないため、毎秒の生産も前と同じ。
- `pnpm run test:pace:full`（全組）と `pnpm run test --update=none`（速い組）で、上げた傾向「放置の許容間隔が 14400 秒以降の局面で 86400 秒以上」を含む 18 項目すべてが通った（段を上げる前の目標値は 18 項目で、項目の数は変わらない）。
- 自動購入が造幣所を買わない版（全組、一時的に作って戻した）では、efficiency の購入規則の許容間隔が局面 0・1・4・12・24・48 時間で 60、3600、43200、43200、43200、3600 秒になり、上げた段が失敗した。上げる前の段（28800 秒）は局面 48 時間（3600 秒）でしか失敗せず、局面 4・12・24 時間の 43200 秒を捉えるのは上げた段だけだった。この版では、ほかに帯「区間ごとの対数成長速度」「購入の間隔の最長」「259200 秒の毎秒の生産量が 43200 秒の何倍か」と傾向「放置の許容間隔が局面とともに縮まない」も失敗した。
- `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test --update=none`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

## 限界

- 1 日は文献から導いた数値ではなく、日々の暮らしの 1 周期として置いた仮説の値。原典は放置ゲームの分類の研究で、離れていられる長さとプレイヤーの満足の関係を測っていない。
- 許容間隔は組の最長の 24 時間までしか測らず、この段はその最長をちょうど求める。24 時間より長く離れて損をしないかは確かめていない。局面 4・12・24・48 時間で、60 秒ごとから 24 時間ごとまでのどれかのボットの効率が 0.995 を下回る変更で失敗する。
- 局面 4 時間で 12 時間・24 時間ごとに開くと損をする要素（自動購入が買わない新しい品物など）を足す変更は、この段で失敗する。そうした要素を足すなら、離れたプレイヤーの損にならない形にするか、目標値と設計原則の扱いを別に判断する。
- 途中の段は作っていない（後に作った。[auto-buyer-stages.md](auto-buyer-stages.md)）。局面 1 時間と 4 時間の間（たとえば 2 時間）の局面は測っていない。自動購入の値段のほかの数値で局面 1 時間の許容間隔を伸ばす案は測っていない。
