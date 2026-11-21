// 画面の要素、localStorage、時計、タイマー、Web Locks をゲームにつなぐ。判断は session.ts・restore.ts・
// notices.ts・tab-lock.ts・view.ts に置いてユニットテストとミューテーションテストで確かめ、ここには置かない
// （このファイルはミューテーションテストの対象外で、E2E テストだけが確かめる）。
import { createNotices } from "./notices.ts";
import { startSession } from "./session.ts";
import type { SaveStorage, Session } from "./session.ts";
import { playInOneTab, webLocks } from "./tab-lock.ts";
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
const autoBuyer = requireElement("auto-buyer");
const nextPurchase = requireElement("next-purchase");
const nextUnlockLabel = requireElement("next-unlock-label");
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

// 時刻は Date.now() で測る。performance.now() は端末のスリープ中に進まないことがあり、その間の生産が失われる。
const start = (): void => {
  const session = startSession(storage, notices, Date.now());
  // 最初の自動保存より前にページが失われても、次に開いたときに閉じていた間を数えられるよう、すぐ保存する。
  session.save(Date.now());
  showAway(session.away);

  const buttons = view(session.state()).shop.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => {
      session.perform(item.action, Date.now());
      render();
    });
    return button;
  });

  function render(): void {
    const current = view(session.state(), session.pausedFor(Date.now()));
    coins.textContent = current.coins;
    totalEarned.textContent = current.totalEarned;
    productionText.textContent = current.production;
    collectors.textContent = current.collectors;
    factories.textContent = current.factories;
    autoBuyer.textContent = current.autoBuyer;
    nextPurchase.textContent = current.nextPurchase;
    nextUnlockLabel.hidden = current.nextUnlock === undefined;
    nextUnlock.hidden = current.nextUnlock === undefined;
    nextUnlock.textContent = current.nextUnlock ?? "";
    for (const [index, item] of current.shop.entries()) {
      const button = buttons[index];
      if (button !== undefined) {
        button.textContent = item.label;
        button.hidden = !item.visible;
        button.disabled = !item.affordable;
      }
    }
  }

  shop.append(...buttons);
  render();
  keepPlaying(session, render);
};

// ロックは遊んでいる間ずっと持つため、この await はページを閉じるまで終わらない。
await playInOneTab(webLocks(globalThis), notices, start);
