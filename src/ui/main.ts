import { advance, initialState, perform } from "../core/game.ts";
import { serialize } from "../save/save.ts";
import { SAVE_KEY, restore } from "./restore.ts";
import { view } from "./view.ts";

const TICK_MS = 100;
const AUTOSAVE_MS = 1000;
// 同じ保存データを複数のタブが上書きし合わないよう、遊べるタブを 1 つにする Web Locks の名前。
const LOCK_NAME = "incremental-game";

const requireElement = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`#${id}`);
  if (found === null) {
    throw new Error(`#${id} が index.html に無い`);
  }
  return found;
};

const coins = requireElement("coins");
const productionText = requireElement("production");
const collectors = requireElement("collectors");
const factories = requireElement("factories");
const autoBuyer = requireElement("auto-buyer");
const shop = requireElement("shop");
const notice = requireElement("notice");

const notices: string[] = [];
// 保存の失敗は自動保存のたびに起きうるため、積み重ねず 1 つだけ示し、保存できたら消す。
let saveError: string | undefined;
const renderNotice = (): void => {
  notice.textContent = [...notices, ...(saveError === undefined ? [] : [saveError])].join("\n");
};
const showNotice = (message: string): void => {
  notices.push(message);
  renderNotice();
};
const setSaveError = (message: string | undefined): void => {
  if (message !== saveError) {
    saveError = message;
    renderNotice();
  }
};

const readSave = (): { readonly text: string | null } | { readonly error: unknown } => {
  try {
    return { text: localStorage.getItem(SAVE_KEY) };
  } catch (error) {
    return { error };
  }
};

// 遊んでいる状態と、その状態の時刻（Date.now() のミリ秒）。時刻は Date.now() で測る。performance.now() は端末の
// スリープ中に進まないことがあり、その間の生産が失われる。
let state = initialState;
let lastTick = 0;
// 保存してよいか。読めなかったデータを退避できないまま上書きしないよう、読み込みか退避に失敗したら保存しない。
let writable = true;

// 時計が戻ったときは、追いつくまで進めない。戻った時刻を記録すると、追いつくまでの時間を二重に数える。
const tick = (): void => {
  const now = Date.now();
  if (now > lastTick) {
    state = advance(state, (now - lastTick) / 1000);
    lastTick = now;
  }
};

/** 状態と、その状態の時刻を組で保存する。 */
const save = (): void => {
  if (!writable) {
    return;
  }
  tick();
  try {
    localStorage.setItem(SAVE_KEY, serialize({ state, savedAt: lastTick }));
    setSaveError(undefined);
  } catch (error) {
    setSaveError(`保存できなかった: ${String(error)}`);
  }
};

const buttons = view(state).shop.map((item) => {
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", () => {
    tick();
    const next = perform(state, item.action);
    if (next !== undefined) {
      state = next;
      save();
    }
    render();
  });
  return button;
});

function render(): void {
  const current = view(state);
  coins.textContent = current.coins;
  productionText.textContent = current.production;
  collectors.textContent = current.collectors;
  factories.textContent = current.factories;
  autoBuyer.textContent = current.autoBuyer;
  for (const [index, item] of current.shop.entries()) {
    const button = buttons[index];
    if (button !== undefined) {
      button.textContent = item.label;
      button.hidden = !item.visible;
      button.disabled = !item.affordable;
    }
  }
}

/** 保存データを読み込み、読めなかったデータを退避する。 */
function load(): void {
  const read = readSave();
  const restored = restore("text" in read ? read.text : null, Date.now());
  if ("error" in read) {
    writable = false;
    showNotice(`保存データを読めないため、進行を保存せずに始める: ${String(read.error)}`);
  }
  if (restored.backup !== undefined) {
    try {
      localStorage.setItem(restored.backup.key, restored.backup.text);
    } catch (error) {
      writable = false;
      showNotice(
        `読み込めなかった保存データを退避できなかったため、上書きしないよう進行を保存せずに始める: ${String(error)}`,
      );
    }
  }
  if (writable && restored.notice !== undefined) {
    showNotice(restored.notice);
  }
  state = restored.state;
  lastTick = restored.at;
}

let started = false;

/** 保存データを読み込んで遊び始める。 */
function start(): void {
  started = true;
  load();
  // 最初の自動保存より前にページが失われても、次に開いたときに閉じていた間を数えられるよう、すぐ保存する。
  save();
  shop.append(...buttons);
  render();
  setInterval(() => {
    tick();
    render();
  }, TICK_MS);
  setInterval(save, AUTOSAVE_MS);
  globalThis.addEventListener("pagehide", save);
}

/** 遊び始め、ページが閉じられてロックが解放されるまで解決しない。 */
async function playHoldingLock(): Promise<void> {
  start();
  await new Promise<never>(() => {
    // 解決しない Promise。
  });
}

/** ロックを使えないときは、複数のタブで開くと進行を上書きしうることを知らせて始める。 */
const startWithoutLock = (reason: string): void => {
  showNotice(
    `${reason}ため、複数のタブで開くと互いの進行を上書きしうる。1 つのタブで遊んでほしい。`,
  );
  start();
};

// 別のタブがロックを手放すのを待っているか。
let waiting = false;

/** ロックを取って遊ぶ。ロックを取れなければ、別のタブで遊んでいる。そのタブが閉じられるまで待ってから始める。 */
async function playInOneTab(): Promise<void> {
  try {
    await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock !== null) {
        await playHoldingLock();
        return;
      }
      showNotice("別のタブでこのゲームを開いている。そのタブを閉じると、ここで続きから始める。");
      waiting = true;
      await navigator.locks.request(LOCK_NAME, async () => {
        notices.length = 0;
        renderNotice();
        await playHoldingLock();
      });
    });
  } catch (error) {
    // ストレージを使えない文脈などでは、ロックの要求が拒否される。遊び始めた後の失敗は、ここでは扱わない。
    if (started) {
      throw error;
    }
    if (waiting) {
      // 別のタブがロックを持ったままなので、ここでは始めない。
      notices.length = 0;
      showNotice(
        `別のタブが閉じるのを待てなくなった（${String(error)}）。ページを開き直してほしい。`,
      );
      return;
    }
    startWithoutLock(`タブの重複を防ぐロックを使えない（${String(error)}）`);
  }
}

// ロックは遊んでいる間ずっと持つため、この await はページを閉じるまで終わらない。
if (globalThis.isSecureContext && "locks" in navigator) {
  await playInOneTab();
} else {
  // Web Locks は安全なコンテキスト（https・localhost）でしか使えず、古いブラウザには無い。
  startWithoutLock("このブラウザではタブの重複を防げない");
}
