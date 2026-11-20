import type { Notices } from "./notices.ts";

/** 同じ保存データを複数のタブが上書きし合わないよう、遊べるタブを 1 つにする Web Locks の名前。 */
export const LOCK_NAME = "incremental-game";

/** Web Locks（navigator.locks）のうち、ここで使う部分。 */
export interface Locks {
  readonly request: (
    name: string,
    options: { readonly ifAvailable?: boolean },
    callback: (lock: Lock | null) => Promise<void>,
  ) => Promise<void>;
}

/** Web Locks を使えれば返す。Web Locks は安全なコンテキスト（https・localhost）でしか使えず、古いブラウザには無い。 */
export function webLocks(scope: {
  readonly isSecureContext: boolean;
  readonly navigator: { readonly locks?: Locks };
}): Locks | undefined {
  return scope.isSecureContext ? scope.navigator.locks : undefined;
}

const startWithoutLock = (notices: Notices, start: () => void, reason: string): void => {
  notices.show(
    `${reason}ため、複数のタブで開くと互いの進行を上書きしうる。1 つのタブで遊んでほしい。`,
  );
  start();
};

/**
 * ロックを取って遊び始める（`start` を呼ぶ）。ロックを取れなければ別のタブで遊んでいるので、そのタブが閉じられて
 * ロックを取れるまで待ってから始める。ロックは遊んでいる間ずっと持つため、遊び始めたら解決しない。
 *
 * ロックを使えないときは、複数のタブで開くと進行を上書きしうることを知らせて、ロックなしで始める。ただし、別の
 * タブが閉じるのを待っている間にロックを使えなくなったら、別のタブがまだ遊んでいるので始めない。遊び始めた後の
 * 失敗は、ここでは扱わずに投げる。
 */
export async function playInOneTab(
  locks: Locks | undefined,
  notices: Notices,
  start: () => void,
): Promise<void> {
  if (locks === undefined) {
    startWithoutLock(notices, start, "このブラウザではタブの重複を防げない");
    return;
  }
  // ロックの要求が失敗したときに、どこまで進んでいたか。
  const progress = { waiting: false, started: false };
  const playHoldingLock = async (): Promise<void> => {
    progress.started = true;
    start();
    await new Promise<never>(() => {
      // 解決しない Promise。
    });
  };
  try {
    await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock !== null) {
        await playHoldingLock();
        return;
      }
      notices.show("別のタブでこのゲームを開いている。そのタブを閉じると、ここで続きから始める。");
      progress.waiting = true;
      await locks.request(LOCK_NAME, {}, async () => {
        notices.clear();
        await playHoldingLock();
      });
    });
  } catch (error) {
    // ストレージを使えない文脈などでは、ロックの要求が拒否される。
    if (progress.started) {
      throw error;
    }
    if (progress.waiting) {
      notices.clear();
      notices.show(
        `別のタブが閉じるのを待てなくなった（${String(error)}）。ページを開き直してほしい。`,
      );
      return;
    }
    startWithoutLock(notices, start, `タブの重複を防ぐロックを使えない（${String(error)}）`);
  }
}
