# 離れていた間に進んだことの知らせを閉じた後のキーボードのフォーカス

## 目的

離れていた間に進んだことの知らせ（`index.html` の `#away`、[away-report.md](away-report.md)）は、プレイヤーが「閉じる」ボタンで閉じるまで出しておく。キーボードで閉じると、フォーカスを持っていた「閉じる」が知らせの領域ごと隠れ（`hidden`）、フォーカスが文書の先頭（body）へ外れていた。

この記録は、閉じた後にフォーカスをどこへ移すかと、マウスで閉じたときも同じに扱うかを決める。キーボードで遊ぶプレイヤーが、戻って知らせを閉じた後も続けて操作できるようにするため。表示と操作だけの変更で、ゲームの規則と数値（`src/core/`）は変えない。

移した先が何の一覧かを支援技術へどう伝えるかは、後の節「[移す先の名前](#移す先の名前)」で決める。

## 出典

[shop-focus.md](shop-focus.md) と同じ出典のうち、Developing a Keyboard Interface（Persistence of focus）、Understanding WCAG 2.2 の 2.4.3、HTML Living Standard の 8.1.7.3 を使い、次を足す。

| 出典                                                                                                                                                                         | 根拠の種類 | 読んだ範囲                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| W3C Web Accessibility Initiative, "Dialog (Modal) Pattern"（ARIA Authoring Practices Guide）。https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ 。2026-11-22 に読んだ版 | それ以外   | About This Pattern と、Keyboard Interaction の注記（開いたときと閉じたときのフォーカスの置き場所）                  |
| W3C, "Selectors Level 4"（W3C Working Draft, 22 January 2026）。https://www.w3.org/TR/selectors-4/                                                                           | それ以外   | 9.4 The Focus-Indicated Pseudo-class: `:focus-visible` のうち、フォーカスの印を出すかを決める手がかりの例（非規範） |

## 原典の主張

- フォーカスを失うこと: "Persistence of focus: It is essential that there is always a component within the user interface that is active (document.activeElement is not null or is not the body element) and that the active element has a visual focus indicator." 続けて、ダイアログを閉じたときやリストの項目を消したときにフォーカスを持つ要素が隠れたり取り除かれたりし、移さなければブラウザが body へ移すと述べる（APG, Developing a Keyboard Interface。引用の全文は [shop-focus.md](shop-focus.md#原典の主張)）。
- ブラウザがフォーカスを外す時機: フォーカスを持つ領域が focusable でなくなると、描画の更新でフォーカスを viewport へ移す。注記の例に `hidden` 属性を付けた場合を挙げる（HTML Living Standard, 8.1.7.3。引用は [shop-focus.md](shop-focus.md#原典の主張)）。
- 閉じた後のフォーカス: "When a dialog closes, focus returns to the element that invoked the dialog unless either: The invoking element no longer exists. Then, focus is set on another element that provides logical work flow."（APG, Dialog (Modal) Pattern, Keyboard Interaction の注記）。
- 操作できない要素へのフォーカス: 同じ注記は、ダイアログを開いたときの置き場所について、中身が一続きの文として読み上げると分かりにくい構造（リスト、表、複数の段落）を持つなら "it is advisable to add tabindex="-1" to a static element at the start of the content and initially focus that element." とし、"This makes it easier for assistive technology users to read the content by navigating the semantic structures." と述べる。
- 閉じた要素の後の順: 非モーダルなダイアログの例で "When the dialog is closed, the focus order goes from the button to the following element."、モーダルなダイアログの例で "When the dialog is dismissed, focus returns to the button or the element following the button."（Understanding 2.4.3, Examples）。
- フォーカスの印: "If the previously-focused element indicated focus, and a script causes focus to move elsewhere, indicate focus on the newly focused element." "Conversely, if the previously-focused element did not indicate focus, and a script causes focus to move elsewhere, don’t indicate focus on the newly focused element."（Selectors Level 4, 9.4。ブラウザが選べる手がかりの非規範の例）。

知らせはダイアログではない。ページに重ねず、ほかの部分を操作できなくもせず、開いたときにフォーカスも移さない。上の出典のうち、ダイアログについての指針は、閉じる操作で領域が消える点が同じなので類推に使う。

## 導いた仮説

- 「閉じる」で知らせを閉じたら、フォーカスを知らせの後に続く値の一覧（`index.html` の `#stats`、コインや施設の数を並べた `<dl>`）へ移す。移さないと、ブラウザは次の描画の更新でフォーカスを body へ移し、プレイヤーは続けて操作する位置を失う（APG, Persistence of focus。HTML Living Standard, 8.1.7.3）。
- 移す先を値の一覧にするのは、それが文書の中で知らせの後に続く内容だからである（一覧の前には一覧の名前にする見出しがある。見出しへ移さない理由は「[移す先の名前](#移す先の名前)」）。知らせを出したボタンは無い（開いたときに出る）ので、APG のダイアログの指針の「呼び出した要素が無い」ときに当たり、閉じた要素の後の順を「後に続く要素」へ進める Understanding 2.4.3 の例に倣って、後に続く要素を移す先にする。値の一覧は離れていた間に増えたコインや施設の今の数を示し、戻ったプレイヤーが知らせの次に確かめる内容でもある。
- 値の一覧は操作できる要素ではないので、`tabindex="-1"` でフォーカスを受けられるようにし、Tab の順には入れない。APG のダイアログの指針が、リストなどの構造を持つ中身の先頭の静的な要素に `tabindex="-1"` を付けてフォーカスを置く形を挙げており、その形を使う。値の一覧から Tab を押すと、店の最初の品物のボタンへ進む。

### 出典ではなく、仮説と設計原則から決めたこと

- 店の品物のボタンへは移さない。移すと、閉じるために押した Enter を押し続けたとき（キーの自動の繰り返し）や続けてもう一度押したときに、移した先の品物を買う。離れていた後はコインが多く貯まっていることが多く、意図しない購入は取り消せない。Enter を繰り返しても何も起きない値の一覧へ移し、店へ進むのに Tab を 1 回多く押すことを受け入れる。
- マウスで閉じた場合も同じに移す。Chromium は押したボタンにフォーカスを移すので、移さないと body へ外れる。Chromium でマウスで閉じたときは、移した先にフォーカスの印が出ない（Selectors Level 4 の手がかりのとおり）。値の一覧はキーを押しても何も起きないので、印が出ないまま Enter を押しても何も買わない。
- 「閉じる」がフォーカスを持っていなくても（押したボタンにフォーカスを移さないブラウザなど）、閉じたら同じ先へ移す。閉じた後のフォーカスの位置を、ブラウザや押し方によらず同じにするため。

## 目標値

置かない。表示と操作だけの変更で、ゲームの規則と数値を変えず、ペースの指標に影響しない。[minimal-game.targets.json](minimal-game.targets.json) は変えていない。

## 検証結果

2026-11-22。Playwright 1.65.1 の Chromium headless shell 159.0.8154.6。

- 直す前: 知らせが出る保存データ（保存してから 1 時間 1 分後に開く）で開き、Tab で「閉じる」へ移って Enter を押すと、描画の更新の後に `document.activeElement` は body になった。
- `e2e/away.e2e.ts`: 実ブラウザで、キーボードで閉じると、描画の更新の後にフォーカスが値の一覧にあってフォーカスの印（`:focus-visible`）を出し、Enter を押し続けても（2 回目の keydown は repeat）採集機を買わず、続けて Tab で採集機のボタンへ移れることを確かめた。マウスで閉じても、フォーカスが値の一覧へ移り、フォーカスの印は出さず、続けて Enter を押しても採集機を買わないことを確かめた。知らせが無いときは、最初の Tab で採集機のボタンへ進み、値の一覧が Tab の順に入らないことを確かめた。フォーカスを移さない版では、この 2 つのテストのフォーカスの確認が失敗し、店の最初の品物のボタンへ移す版では、Enter を押し続けると採集機を 1 台買って失敗することを確かめた。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

## 限界

- 確かめたのは Chromium だけで、Firefox と Safari では確かめていない。マウスで押したボタンがフォーカスを持つかはブラウザで違いうる。押したボタンにフォーカスを移さないブラウザで、キーボードで店のボタンへ移った後にマウスで「閉じる」を押すと、フォーカスは店から値の一覧へ移り、Selectors Level 4 の手がかりのとおりなら印も出る。
- スクリーンリーダーで、閉じた後に値の一覧へ移ったことと、その中身がどう読まれるかは確かめていない。移す先に付けた名前の限界は「[移す先の名前](#移す先の名前)」に書く。
- 値の一覧は `tabindex="-1"` を持つので、マウスで一覧の中を押すと一覧がフォーカスを受けうる。そのときの見た目と、その後の Tab の進み方は確かめていない。
- 閉じた後に Shift+Tab を押すと、値の一覧より前にフォーカスを受ける要素が無いので、フォーカスはページの外（ブラウザの画面の部品）へ出る。閉じる前は、店から Shift+Tab で「閉じる」に戻れた。
- 知らせと値の一覧の並びを変えるときや、間に要素を足すときは、後に続く要素が変わるので、移す先を決め直す。

## 移す先の名前

### 目的

閉じた後にフォーカスを移す値の一覧（`<dl id="stats">`）には、アクセシブルな名前が無かった。支援技術はフォーカスを受けた要素の役割と名前を読み上げるので、名前が無いと、スクリーンリーダーを使うプレイヤーに、移った先が何の一覧か伝わらないおそれがある。この節は、移した先が何の一覧かを伝える形を決める。移す先と、上で決めたフォーカスの振る舞いは変えない。

### 出典

上の出典のうち APG の Dialog (Modal) Pattern を使い、次を足す。

| 出典                                                                                                                                | 根拠の種類 | 読んだ範囲                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3C, "ARIA in HTML"（W3C Recommendation, 11 August 2026）。https://www.w3.org/TR/html-aria/                                         | それ以外   | 4 Document conformance requirements for use of ARIA attributes in HTML の冒頭（Naming Prohibited の定義）と表の `dl` の行、4.1 Requirements for use of ARIA attributes to name elements |
| W3C, "HTML Accessibility API Mappings 1.0"（W3C Working Draft, 26 October 2026）。https://www.w3.org/TR/html-aam-1.0/               | それ以外   | 3.5.36 `dl`                                                                                                                                                                             |
| W3C, "Accessible Rich Internet Applications (WAI-ARIA) 1.2"（W3C Recommendation, 6 June 2023）。https://www.w3.org/TR/wai-aria-1.2/ | それ以外   | 5.2.8.4 Roles Supporting Name from Author、5.2.8.6 Roles which cannot be named (Name prohibited)、5.4 の `list` role の Characteristics（Name From）、6.7 の `aria-label`               |

### 原典の主張

- `dl` に名前を付けてよいか（ARIA in HTML）: 表の `dl` の行は、暗黙の役割を "No corresponding role"、使ってよいものを "Roles: group, list, none or presentation" と "Global aria-\* attributes and any aria-\* attributes applicable to the allowed roles." とし、Naming Prohibited の印を付けていない。Naming Prohibited は "Elements which are identified as Naming prohibited are those which authors MUST NOT specify an aria-label or aria-labelledby attribute" と定義する。4.1 は "Authors MAY use aria-label and aria-labelledby attributes to specify accessible names for elements which have an implicit or explicit ARIA role which allows naming from authors." と "Authors MUST NOT specify aria-label or aria-labelledby on elements with implicit WAI-ARIA roles which cannot be named." と述べる。
- `dl` の役割（HTML-AAM）: 3.5.36 は `dl` を WAI-ARIA 1.2 の "list role" に対応させ、Computed Role を "list" とし、"Editorial Note: This value may change upon resolution of ARIA #1662." と注記する。
- 名前を付けられる役割（WAI-ARIA 1.2）: 5.2.8.4 は `list` を Name from Author を持つ役割に挙げ、`list` role の Characteristics は "Name From: author" とする。5.2.8.6 が名前を禁じる役割は "caption code deletion emphasis generic insertion paragraph presentation strong subscript superscript" で、`list` を含まない。
- 名前の付け方（WAI-ARIA 1.2, 6.7 `aria-label`）: "If the label text is available in the DOM (i.e. typically visible text content), authors SHOULD use aria-labelledby and SHOULD NOT use aria-label."
- フォーカスを置く静的な要素（APG, Dialog (Modal) Pattern, Keyboard Interaction の注記）: 上で引いた、構造を持つ中身の "static element at the start of the content" に加え、"If content is large enough that focusing the first interactive element could cause the beginning of content to scroll out of view, it is advisable to add tabindex="-1" to a static element at the top of the dialog, such as the dialog title or first paragraph, and initially focus that element."

### 導いた仮説

- 値の一覧の前に、見える見出し `<h2 id="stats-heading">コインと施設</h2>` を置き、一覧に `aria-labelledby="stats-heading"` を付けて、見出しの文言を一覧の名前にする。`dl` は HTML-AAM で `list` に対応し、`list` は名前を付けられる役割なので、ARIA in HTML の 4.1 に従って `aria-labelledby` を付けてよい。名前にする文言を画面にも出すので、WAI-ARIA 1.2 の `aria-label` の定めに従って `aria-label` ではなく `aria-labelledby` を使う。
- 移す先は値の一覧のままにし、見出しへは移さない。一覧が名前を持てば、フォーカスを受けた要素そのものが、一覧であることと何の一覧かを支援技術へ渡す。APG がダイアログの題へフォーカスを置く形を挙げるのは、最初の操作できる要素へ移すと中身の先頭が画面の外へ出る場合で、ここには当たらない。一覧のままなら、上で決めた振る舞い（店の品物のボタンへ移さない、マウスで閉じても同じ先へ移す、Tab の順に入れない、次の Tab で店の最初の品物のボタンへ進む）も変わらない。
- 見出しの文言は「コインと施設」にする。一覧は、コイン（今の数、これまでの生産、毎秒の生産、次に買えるまで、次の解放）と施設（採集機、工場、造幣所、改良、自動購入）を並べる。見出しはページの見出しの構造にも入り、見出しで移動する支援技術の利用者も一覧の位置を見つけられる。改良（[upgrade.md](upgrade.md)）を足した後も、見出しは「コインと施設」のままにする。見出しの「施設」は、生産するものに限らず自動購入も含めて、店で買って持っているもののまとまりを指し、改良もそこに入る。種類ごとに見出しに並べると、一覧に並ぶものの種類が増えるたびに見出しが長くなる。

#### 出典ではなく、仮説と設計原則から決めたこと

- 名前を見える見出しから取り、`aria-label` だけの見えない名前にしない。目で見るプレイヤーにも同じ区切りが見え、画面と支援技術で一覧の呼び名が食い違わない。
- 店の品物の並びの前にも見出し「店」を置く。値の一覧の見出しだけを足すと、見出しの構造の上で、その後に続く店の品物まで「コインと施設」の下に続いて見える。見出しは操作できる要素ではなく、Tab の順とフォーカスの振る舞いは変わらない。

### 目標値

置かない。表示だけの変更で、ゲームの規則と数値を変えず、ペースの指標に影響しない。[minimal-game.targets.json](minimal-game.targets.json) は変えていない。

### 検証結果

2026-11-22。Playwright 1.65.1 の Chromium headless shell 159.0.8154.6。

- `e2e/away.e2e.ts`: キーボードで知らせを閉じ、描画の更新の後にフォーカスを持つ値の一覧の名前を、Playwright の `toHaveAccessibleName` と、Chromium が計算したアクセシビリティツリー（Chrome DevTools Protocol の `Accessibility.getPartialAXTree`）で確かめた。Chromium は、フォーカスを持つ要素を役割 `DescriptionList`（Chromium での `<dl>` の役割）、名前「コインと施設」とした。
- 直す前の版（見出しと `aria-labelledby` が無い `index.html`）では、キーボードで閉じるテストがこの名前の確かめで失敗した。Playwright の計算した名前は空で、Chromium の計算した名前も空だった（役割は `DescriptionList`）。
- 上の節で確かめたこと（キーボードで閉じる・Enter の押し続けで買わない・次の Tab で店へ、マウスで閉じる、知らせが無いときの Tab の順）は、同じテストのファイルで通った。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

### 限界

- スクリーンリーダーの実機では確かめていない。確かめたのは、Chromium がアクセシビリティツリーで渡す役割と名前までで、各スクリーンリーダーが、フォーカスを受けた `<dl>` の名前と役割を読み上げるかは確かめていない。
- HTML-AAM は、`dl` の役割の対応が ARIA #1662 の決着で変わりうると注記している。`dl` が名前を禁じる役割（`generic` など）に対応するよう変われば、`aria-labelledby` は使えなくなり、名前の付け方を決め直す。そのときも見える見出しは残る。
- 確かめたのは Chromium だけで、Firefox と Safari で `<dl>` の役割と名前がどう渡るかは確かめていない。
- 知らせの欄（`#notice`）は店の品物の後にあるので、見出しの構造の上では「店」の下に続いて見える。そこには、別のタブで遊んでいることや保存の失敗など、店に限らない知らせも出る。
- 別のタブで遊んでいて、このタブがそのタブを閉じるのを待つ間も、2 つの見出しは出る。その下の値の一覧と店は空のまま。
