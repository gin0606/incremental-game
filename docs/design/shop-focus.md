# 店の品物を買った後のキーボードのフォーカス

## 目的

店（`index.html` の `#shop`）の品物は、ボタンで買う。キーボードで買うと、ボタンがキーボードのフォーカスを持ったまま描き直される。このとき次の 2 つの場合に、フォーカスが店から外れていた。

- 一度しか買えない品物（今は自動購入）を買うと、その行が隠れる（`hidden`）。
- 買った後にコインが次の値段に足りなくなると、ボタンが押せなくなる（`disabled`）。

この記録は、フォーカスをどこに置くかと、押せない品物のボタンの示し方を決める。キーボードで遊ぶプレイヤーが、買った後も続けて店を操作できるようにするため。表示と操作だけの変更で、ゲームの規則と数値（`src/core/`）は変えない。

## 出典

| 出典                                                                                                                                                                                                                                                                                                                                                          | 根拠の種類 | 読んだ範囲                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3C Web Accessibility Initiative, "Developing a Keyboard Interface"（ARIA Authoring Practices Guide）。https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ 。2026-11-22 に読んだ版                                                                                                                                                                  | それ以外   | 節 Discernible and Predictable Keyboard Focus の全文（Persistence of focus と Predictability of movement を含む）と、節 Focusability of disabled controls の全文 |
| W3C Web Accessibility Initiative, "Listbox Example with Rearrangeable Options"（ARIA Authoring Practices Guide, Page last updated: 12 August 2025）。https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/ と、その例のスクリプト https://www.w3.org/WAI/content-assets/wai-aria-practices/patterns/listbox/examples/js/listbox.js | それ以外   | ページの Accessibility Features の Keyboard shortcuts の項。スクリプトは `checkKeyPress` の `Backspace`・`Delete`・`Enter` の分岐                                |
| W3C, "Understanding Success Criterion 2.4.3: Focus Order"（Understanding WCAG 2.2, Updated 04 October 2026）。https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html                                                                                                                                                                                    | それ以外   | Success Criterion、Intent、Benefits、Examples                                                                                                                    |
| W3C, "Accessible Rich Internet Applications (WAI-ARIA) 1.2"（W3C Recommendation 06 June 2023）。https://www.w3.org/TR/wai-aria-1.2/                                                                                                                                                                                                                           | それ以外   | 6.7 の `aria-disabled` の定義                                                                                                                                    |
| WHATWG, "HTML Living Standard"（Last Updated 20 November 2026）。https://html.spec.whatwg.org/multipage/webappapis.html                                                                                                                                                                                                                                       | それ以外   | 8.1.7.3 Processing model の update the rendering のうち、フォーカスを持つ領域が focusable でなくなったときの手順と、その注記                                     |
| W3C, "CSS Color Module Level 4"（W3C Candidate Recommendation Draft, 18 November 2026）。https://www.w3.org/TR/css-color-4/                                                                                                                                                                                                                                   | それ以外   | 6.2 System Colors の `GrayText` の定義                                                                                                                           |
| MDN Web Docs, "Firefox 119 release notes for developers"。https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/119 。2026-11-22 に読んだ版                                                                                                                                                                                                       | それ以外   | ARIA reflection の項                                                                                                                                             |

## 原典の主張

- フォーカスを失うこと: "Persistence of focus: It is essential that there is always a component within the user interface that is active (document.activeElement is not null or is not the body element) and that the active element has a visual focus indicator. Authors need to manage events that effect the currently active element so focus remains visible and moves logically. For example, if the user closes a dialog or performs a destructive operation like deleting an item from a list, the active element may be hidden or removed from the DOM. If such events are not managed to set focus on the button that triggered the dialog or on the list item following the deleted item, browsers move focus to the body element, effectively causing a loss of focus within the user interface."（APG, Developing a Keyboard Interface, Discernible and Predictable Keyboard Focus）。
- ブラウザがフォーカスを外す時機: "For each doc of docs, if the focused area of doc is not a focusable area, then run the focusing steps for doc's viewport"。注記に "For example, this might happen because an element has the hidden attribute added, causing it to stop being rendered. It might also happen to an input element when the element gets disabled."（HTML Living Standard, 8.1.7.3 の update the rendering）。
- 項目が無くなった後の移す先: 並べ替えられるリストボックスの例は、追加の操作について "If the option that had focus before the add operation is no longer present in the list, focus lands on the first of the subsequent options that is still present."（APG, Listbox Example with Rearrangeable Options, Keyboard shortcuts）。例のスクリプトは、移す項目の後ろの兄弟から残る項目を探し、見つからなければ前の兄弟から探して、そこへフォーカスを移す（`listbox.js` の `checkKeyPress`）。
- 消えた要素の後の位置: 非モーダルなダイアログの例で "When the dialog is closed, the focus order goes from the button to the following element."、モーダルなダイアログの例で "When the dialog is dismissed, focus returns to the button or the element following the button."（Understanding 2.4.3, Examples）。達成基準は "focusable components receive focus in an order that preserves meaning and operability."。
- 押せない要素のフォーカス: "Browsers remove HTML input elements with the disabled attribute from the tab sequence. However, there are some contexts where it is useful for an element to convey a disabled state while remaining focusable, especially inside of composite widgets. This can be accomplished by applying the state aria-disabled="true"." "Removing focusability from disabled elements can offer users both advantages and disadvantages. Allowing keyboard users to skip disabled elements usually reduces the number of key presses required to complete a task. However, screen reader users are far less likely to discover disabled elements that are not focusable because moving focus is one of their primary methods of discovery." 例の慣例として "When a disabled element does need to remain discoverable, aria-disabled="true" is applied so that it will remain focusable."（APG, Developing a Keyboard Interface, Focusability of disabled controls。例にツールバーの Copy・Cut・Paste のボタンを挙げる）。
- `aria-disabled` の意味と見た目: "Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable." "In addition to setting the aria-disabled attribute, authors SHOULD change the appearance (grayed out, etc.) to indicate that the item has been disabled."（WAI-ARIA 1.2, `aria-disabled`）。
- `GrayText`: "Disabled text. (Often, but not necessarily, gray.)"（CSS Color Module Level 4, 6.2 System Colors）。
- ARIA の属性の反映: "ARIA reflection is now supported by default for attributes that do not reference other elements"（MDN, Firefox 119 release notes for developers）。

どの出典も、インクリメンタルゲームの店や、買えない品物のボタンを直接には論じていない。APG の Persistence of focus と Focusability of disabled controls は、APG が "Work to complete this section is tracked by issue 217." と書く節にあり、完成した指針ではない。

## 導いた仮説

- 隠れた品物から外れたフォーカスは、店の中の品物のボタンへ移すべきである。移さないと、ブラウザは次の描画の更新でフォーカスを body へ移し、プレイヤーは続けて操作する位置を失う（APG, Persistence of focus。HTML Living Standard, 8.1.7.3）。
- 移す先は、隠れた品物の後ろで最も近い見えている品物とし、後ろに無ければ前で最も近い見えている品物とする。リストから無くなった項目の次の項目へ移すのは APG の Persistence of focus とリストボックスの例が挙げる形で、消えたダイアログの後に続く要素の順も同じ向きである（Understanding 2.4.3）。後ろに無いときに前へ移すのは、APG のリストボックスの例のスクリプトの振る舞いに倣う。こうすると、移した後の Tab・Shift+Tab の順が、品物が隠れる前の店の並びと変わらない。
- 押せない品物のボタンも、フォーカスを受けられるようにする（`aria-disabled="true"`）。店の品物は、買えない間も値段と得られるもの（[shop-effects.md](shop-effects.md)）を読んで、どれを目指して貯めるかを決める材料になり、APG の言う、押せなくても見つけられる必要がある要素に当たる。フォーカスを受けられれば、買った後にコインが足りなくなってもフォーカスはそのボタンに残り、届けば続けて同じキーで買える。
- フォーカスを受けられる押せない品物が Tab の順に入るので、店を通り抜けるのに要る Tab の回数は、品物の数（今は最大 3）まで増える。品物が少ない今は、見つけられることと、フォーカスを失わないことを優先する（APG, Focusability of disabled controls の利点と欠点）。

### 出典ではなく、仮説と設計原則から決めたこと

- 見えている品物が 1 つも無いときは移さない。今のゲームでは採集機がいつも見えているので起きない。
- 押せない品物のボタンは、文字の色をシステムの色 `GrayText` にして、押せないことを見た目でも示す。WAI-ARIA 1.2 が見た目を変えることを求め、CSS Color Module Level 4 が `GrayText` を使えない文字の色と定めるため。色だけを選んだのは出典ではなく、ブラウザが `disabled` のボタンに付ける見た目（背景と枠も薄くする）と同じにはしていない。
- 押せない品物のボタンを押したときは、押した時刻の状態で買えるときだけ買い、買えなければ何も起きず、知らせも出さない。買えるかどうかは値段の表示と「次に買えるまで」の表示が示している。表示は時計の刻み（0.1 秒）ごとに描き直すので、前の描き直しの後に値段に届いていれば、押せない見た目のまま押しても買える。`disabled` のボタンはこのとき押しても何も起きなかったが、届いた品物を買えるほうがプレイヤーの意図に合うので、描いた状態で押下を止めることはしない。
- フォーカスを移すのは、店を描き直すとき（購入の直後と、時計の刻みごと）に、隠れた品物のボタンがフォーカスを持っていた場合だけにする。マウスで買ってボタンがフォーカスを持った場合も同じく移す。
- 押せない状態は `aria-disabled` 属性を `setAttribute` で書く。ARIA の属性をプロパティ（`ariaDisabled`）で書く反映は Firefox 119 からで（MDN, "Firefox 119 release notes for developers"）、Vite の既定のビルドの対象（Firefox 114 以降）より新しいため。

## 目標値

置かない。表示と操作だけの変更で、ゲームの規則と数値を変えず、ペースの指標に影響しない。[minimal-game.targets.json](minimal-game.targets.json) は変えていない。

## 検証結果

2026-11-22。Playwright 1.65.1 の Chromium headless shell 159.0.8154.6。

- 直す前: 自動購入の値段ちょうどのコインを持つ保存データで開き、キーボード（Enter）で自動購入を買うと、描画の更新の後に `document.activeElement` は body になった。コインを使い切ってほかのボタンもすべて押せない（`disabled`）ため、続けて Tab を押しても body のままだった。コイン 12 で採集機をキーボードで買い、コインが次の値段に足りなくなった場合も、描画の更新の後に body になった。購入の直後（描画の更新の前）にはまだボタンがフォーカスを持っていることがあり、HTML Living Standard の手順のとおり、フォーカスが外れるのは描画の更新の中だった。E2E テストは、スクリーンショットで描画の更新を待ってから確かめる。
- `src/ui/shop-focus.test.ts`: フォーカスを持つ品物が見えたままならそのまま、隠れたら後ろで最も近い見えている品物、後ろに無ければ前で最も近い見えている品物を返すこと、見えている品物が無いときと店の品物がフォーカスを持っていないときは返さないことを確かめた。実際の店の表示（`view`）で、自動購入を買い終えた後は、工場が解放されていれば工場、解放の前なら採集機を返すことを確かめた。
- `e2e/shop.e2e.ts`: 実ブラウザで、キーボードで自動購入を買うと、フォーカスが工場のボタン（押せない状態）へ移り、Shift+Tab で採集機のボタンへ移れることを確かめた。キーボードで採集機を買ってコインが足りなくなると、フォーカスがそのボタン（押せない状態）に残り、押しても買わず、コインが届くとフォーカスを置いたまま続けて買えることを確かめた。直す前の版では、この 2 つのテストのフォーカスの確認が失敗することを確かめた（フォーカスを移す処理だけを外した版では自動購入のテストが、押せない品物を `disabled` に戻した版では両方が失敗した）。
- `pnpm run check`、`pnpm run test:pace:full`、`pnpm run test:e2e`、`pnpm run test:mutation` が通った。

## 限界

- 確かめたのは Chromium だけで、Firefox と Safari では確かめていない。マウスでボタンを押したときにボタンがフォーカスを持つかはブラウザで違いうるが、これも確かめていない。
- スクリーンリーダーで、フォーカスが移ったことや押せない状態がどう読まれるかは確かめていない。
- 押せない品物の見た目（`GrayText`）が、ブラウザの `disabled` のボタンと同じくらい押せないと分かるかは確かめていない。文字の色だけを変え、背景と枠は変えていない。マウスを重ねたときと押したときの見た目も、押せるボタンと同じに変わる。
- 自動購入をキーボードで買った直後にもう一度 Enter を押す（キーの押しっぱなしを含む）と、フォーカスを移した先の品物（工場）を、買えれば買う。リストボックスの例で、項目を消した後のフォーカスが次の項目に移り、続けて消せるのと同じ形である。今は自動購入が工場を自動で買うので損は小さいが、一度しか買えない品物を足すときは、移す先の品物を意図せず買うことがある点に注意する。マウスで買ってフォーカスが移ったときはフォーカスの印が出ない（`:focus-visible` に当たらない）ので、その後に Enter を押すと、プレイヤーに見えていない品物を買うことがある。
- 品物が増えると、押せない品物も Tab の順に入るため、店を通り抜ける Tab の回数が増える。品物が多くなったら、店を一つのまとまりにして矢印キーで品物の間を移る形（APG の Toolbar など）を検討し直す。
- 一度しか買えない品物を足すときも、隠れる品物は同じ規則で移す先を選ぶ。品物の並びを変えるときは、移す先が変わることに注意する。
