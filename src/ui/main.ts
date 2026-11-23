// 画面の要素、localStorage、時計、タイマー、Web Locks をゲームにつなぐ。判断は session.ts・restore.ts・
// notices.ts・tab-lock.ts・view.ts・shop-focus.ts・shop-rows.ts に置いてユニットテストとミューテーションテストで確かめ、
// ここには置かない（このファイルはミューテーションテストの対象外で、E2E テストだけが確かめる）。
import type { Action } from "../core/game.ts";
import { createNotices } from "./notices.ts";
import { startSession } from "./session.ts";
import type { SaveStorage, Session } from "./session.ts";
import { focusedIndex, moveFocus, pressedByKeyboard } from "./shop-focus.ts";
import type { RowLook } from "./shop-rows.ts";
import { rowLooks, shownAfter } from "./shop-rows.ts";
import { playInOneTab, webLocks } from "./tab-lock.ts";
import type { View } from "./view.ts";
import { awayPanel, view } from "./view.ts";

const TICK_MS = 100;
const AUTOSAVE_MS = 1000;

const requireElement = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`#${id}`);
  if (found === null) {
    throw new Error(`#${id} が index.html に無い`);
  }
  return found;
};

const coins = requireElement("coins");
const totalEarned = requireElement("total-earned");
const productionText = requireElement("production");
const collectors = requireElement("collectors");
const factories = requireElement("factories");
const mints = requireElement("mints");
const refineries = requireElement("refineries");
const exchanges = requireElement("exchanges");
const upgrades = requireElement("upgrades");
const collectorUpgrades = requireElement("collector-upgrades");
const autoBuyer = requireElement("auto-buyer");
const stats = requireElement("stats");
const nextPurchase = requireElement("next-purchase");
const nextUnlock = requireElement("next-unlock");
const shop = requireElement("shop");
const notice = requireElement("notice");
const away = requireElement("away");
const awayReport = requireElement("away-report");
const awayClose = requireElement("away-close");

const notices = createNotices((text) => {
  notice.textContent = text;
});

// localStorage は、参照するだけで例外を投げる文脈がある（ストレージを使えない設定など）。読み書きのたびに参照し、
// 例外を session.ts が扱えるようにする。
const storage: SaveStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    localStorage.setItem(key, value);
  },
};

/** 離れていた間に進んだこと（無ければ `undefined` で、隠したままにする）を、プレイヤーが閉じるまで出しておく。 */
const showAway = (report: string | undefined): void => {
  const panel = awayPanel(report);
  away.hidden = panel.hidden;
  awayReport.textContent = panel.text;
  awayClose.addEventListener("click", () => {
    away.hidden = true;
    // フォーカスを、知らせの後に続く値の一覧（その見出しで名前を付けたもの）へ移す。「閉じる」が持っていた
    // フォーカスは、移さないとブラウザが文書の先頭へ外す。店の品物のボタンへは移さない（閉じた Enter を押し続けると、
    // そのボタンで品物を買う）。
    stats.focus();
  });
};

/** 時計に合わせて進めて描き直し、自動保存し、ページを離れるときに保存する。 */
const keepPlaying = (session: Session, render: () => void): void => {
  setInterval(() => {
    session.tick(Date.now());
    render();
  }, TICK_MS);
  setInterval(() => {
    session.save(Date.now());
  }, AUTOSAVE_MS);
  globalThis.addEventListener("pagehide", () => {
    session.save(Date.now());
  });
};

/**
 * 店に品物の行を足す。得られるものの説明は、支援技術でもボタンと一緒に読めるようボタンの説明にもする。`buy` には、
 * ボタンをキーボードで押したかを渡す。`render` は、行を `look` で描く。
 */
const addOffer = (
  action: Action,
  buy: (byKeyboard: boolean) => void,
): {
  readonly button: HTMLButtonElement;
  readonly render: (look: RowLook) => void;
} => {
  const row = document.createElement("p");
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", (event: Readonly<Pick<MouseEvent, "detail">>) => {
    buy(pressedByKeyboard(event.detail));
  });
  const effect = document.createElement("span");
  effect.id = `effect-${action.type}`;
  button.setAttribute("aria-describedby", effect.id);
  row.append(button, " ", effect);
  shop.append(row);
  const render = (look: RowLook): void => {
    button.textContent = look.label;
    // ariaDisabled の反映は Firefox 119 からで、ビルドの対象（Firefox 114 から）に無いため setAttribute で書く。
    button.setAttribute("aria-disabled", look.ariaDisabled);
    effect.textContent = look.effect;
    row.hidden = look.hidden;
    row.style.visibility = look.visibility;
  };
  return { button, render };
};

/** 値の一覧（店より前の部分）を描く。 */
const renderStats = (current: View): void => {
  coins.textContent = current.coins;
  totalEarned.textContent = current.totalEarned;
  productionText.textContent = current.production;
  collectors.textContent = current.collectors;
  factories.textContent = current.factories;
  mints.textContent = current.mints;
  refineries.textContent = current.refineries;
  exchanges.textContent = current.exchanges;
  upgrades.textContent = current.upgrades;
  collectorUpgrades.textContent = current.collectorUpgrades;
  autoBuyer.textContent = current.autoBuyer;
  nextPurchase.textContent = current.nextPurchase;
  nextUnlock.textContent = current.nextUnlock;
};

// 時刻は Date.now() で測る。performance.now() は端末のスリープ中に進まないことがあり、その間の生産が失われる。
const start = (): void => {
  const session = startSession(storage, notices, Date.now());
  // 最初の自動保存より前にページが失われても、次に開いたときに閉じていた間を数えられるよう、すぐ保存する。
  session.save(Date.now());
  showAway(session.away);

  /** 品物のボタンと、行を描く関数（店の並び）。 */
  const buttons: HTMLButtonElement[] = [];
  const renderRows: ((look: RowLook) => void)[] = [];
  for (const item of view(session.state()).shop) {
    const offer = addOffer(item.action, (byKeyboard) => {
      session.perform(item.action, Date.now());
      render(byKeyboard);
    });
    buttons.push(offer.button);
    renderRows.push(offer.render);
  }

  /** ページを開いてから各品物の行を一度でも見せたか。 */
  let shown: readonly boolean[] = [];

  /** 画面を描き直す。`byKeyboard` は、描き直すきっかけの購入をキーボードで押したか。 */
  function render(byKeyboard: boolean): void {
    const current = view(session.state(), session.pausedFor(Date.now()));
    renderStats(current);
    const focused = focusedIndex(buttons, document.activeElement);
    for (const [index, look] of rowLooks(current.shop, shown).entries()) {
      renderRows[index]?.(look);
    }
    shown = shownAfter(current.shop, shown);
    // 隠した品物のボタンがフォーカスを持っていたら、ブラウザが文書の先頭へ外す前に店の中へ移す。
    moveFocus(current.shop, focused, byKeyboard, (index, options) => {
      buttons[index]?.focus(options);
    });
  }

  render(false);
  keepPlaying(session, () => {
    render(false);
  });
};

// ロックは遊んでいる間ずっと持つため、この await はページを閉じるまで終わらない。
await playInOneTab(webLocks(globalThis), notices, start);
