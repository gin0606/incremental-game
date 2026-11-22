// 画面の要素、localStorage、時計、タイマー、Web Locks をゲームにつなぐ。判断は session.ts・restore.ts・
// notices.ts・tab-lock.ts・view.ts・shop-focus.ts・shop-rows.ts に置いてユニットテストとミューテーションテストで確かめ、
// ここには置かない（このファイルはミューテーションテストの対象外で、E2E テストだけが確かめる）。
import type { Action } from "../core/game.ts";
import { createNotices } from "./notices.ts";
import { startSession } from "./session.ts";
import type { SaveStorage, Session } from "./session.ts";
import { focusMove } from "./shop-focus.ts";
import type { RowDisplay } from "./shop-rows.ts";
import { rowDisplay } from "./shop-rows.ts";
import { playInOneTab, webLocks } from "./tab-lock.ts";
import type { ShopItem, View } from "./view.ts";
import { view } from "./view.ts";

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
const upgrades = requireElement("upgrades");
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
  away.hidden = report === undefined;
  awayReport.textContent = report ?? "";
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
 * 店に品物の行を足す。得られるものの説明は、支援技術でもボタンと一緒に読めるようボタンの説明にもする。`render` は、行を
 * 品物 `item` の状態と見せ方 `display` で描く。
 */
const addOffer = (
  action: Action,
  buy: () => void,
): {
  readonly row: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly render: (item: ShopItem, display: RowDisplay) => void;
} => {
  const row = document.createElement("p");
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", buy);
  const effect = document.createElement("span");
  effect.id = `effect-${action.type}`;
  button.setAttribute("aria-describedby", effect.id);
  row.append(button, " ", effect);
  shop.append(row);
  const render = (item: ShopItem, display: RowDisplay): void => {
    button.textContent = item.label;
    // disabled だとフォーカスを受けられず、買って足りなくなると外れる。押せば押した時刻に買えるときだけ買う。
    // ariaDisabled の反映は Firefox 119 からで、ビルドの対象（Firefox 114 から）に無いため setAttribute で書く。
    button.setAttribute("aria-disabled", String(!item.affordable));
    effect.textContent = item.effect;
    // 場所だけを残す行は visibility: hidden にする。Tab の順と支援技術からも外れる。
    row.hidden = display === "none";
    row.style.visibility = display === "space" ? "hidden" : "";
  };
  return { row, button, render };
};

/** 値の一覧（店より前の部分）を描く。 */
const renderStats = (current: View): void => {
  coins.textContent = current.coins;
  totalEarned.textContent = current.totalEarned;
  productionText.textContent = current.production;
  collectors.textContent = current.collectors;
  factories.textContent = current.factories;
  mints.textContent = current.mints;
  upgrades.textContent = current.upgrades;
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

  const offers = view(session.state()).shop.map((item) =>
    addOffer(item.action, () => {
      session.perform(item.action, Date.now());
      render();
    }),
  );

  /** ページを開いてから一度でも見せた品物の行。 */
  const shownRows = new Set<HTMLElement>();

  function render(): void {
    const current = view(session.state(), session.pausedFor(Date.now()));
    renderStats(current);
    let focused = -1;
    let focusVisible = false;
    for (const [index, item] of current.shop.entries()) {
      const offer = offers[index];
      if (offer !== undefined) {
        if (offer.button === document.activeElement) {
          focused = index;
          focusVisible = offer.button.matches(":focus-visible");
        }
        offer.render(item, rowDisplay(item.visible, shownRows.has(offer.row)));
        if (item.visible) {
          shownRows.add(offer.row);
        }
      }
    }
    // 隠した品物のボタンがフォーカスを持っていたら、ブラウザが文書の先頭へ外す前に店の中へ移す。
    const move = focusMove(current.shop, focused, focusVisible);
    if (move !== undefined) {
      offers[move.index]?.button.focus({ preventScroll: move.preventScroll });
    }
  }

  render();
  keepPlaying(session, render);
};

// ロックは遊んでいる間ずっと持つため、この await はページを閉じるまで終わらない。
await playInOneTab(webLocks(globalThis), notices, start);
