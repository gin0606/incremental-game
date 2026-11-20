import { expect, test } from "vitest";

import type { Notices } from "./notices.ts";
import type { Locks } from "./tab-lock.ts";
import { LOCK_NAME, playInOneTab, webLocks } from "./tab-lock.ts";

type Event = readonly ["show", string] | readonly ["clear"] | readonly ["start"];

const lock: Lock = { name: LOCK_NAME, mode: "exclusive" };

/** 呼ばれた順に、通知と遊び始めたことを記録する。 */
const recorder = (): {
  readonly events: Event[];
  readonly notices: Notices;
  readonly start: () => void;
} => {
  const events: Event[] = [];
  return {
    events,
    notices: {
      show: (message) => {
        events.push(["show", message]);
      },
      clear: () => {
        events.push(["clear"]);
      },
      setSaveError: () => {
        throw new Error("ロックの扱いでは保存の失敗を知らせない");
      },
    },
    start: () => {
      events.push(["start"]);
    },
  };
};

/**
 * 要求ごとに `grants` を先頭から 1 つずつ使うロック。Lock か null（取れない）ならそれを渡してコールバックを呼び、
 * `{ reject }` なら要求をその文の Error で拒否する。要求の名前と options を記録する。
 */
const fakeLocks = (
  grants: readonly (Lock | null | { readonly reject: string })[],
): { readonly requests: unknown[]; readonly locks: Locks } => {
  const requests: unknown[] = [];
  let next = 0;
  return {
    requests,
    locks: {
      request: async (name, options, callback) => {
        requests.push([name, options]);
        const grant = grants[next];
        next += 1;
        if (grant !== undefined && grant !== null && "reject" in grant) {
          throw new Error(grant.reject);
        }
        await callback(grant ?? null);
      },
    },
  };
};

/** `run` の返す Promise がすぐに決着するか。遊び始めたら解決しないことを確かめる。 */
const settlesSoon = async (run: () => Promise<void>): Promise<boolean> => {
  const settled = async (): Promise<boolean> => {
    await run();
    return true;
  };
  const pending = new Promise<boolean>((resolve) => {
    setTimeout(resolve, 10, false);
  });
  const result = await Promise.race([settled(), pending]);
  return result;
};

test("ロックの名前は版をまたいで変えない（別の版を開いたタブとも重複を防ぐ）", () => {
  expect(LOCK_NAME).toBe("incremental-game");
});

test("安全なコンテキストで navigator.locks があれば、それを使う", () => {
  const { locks } = fakeLocks([]);

  expect(webLocks({ isSecureContext: true, navigator: { locks } })).toBe(locks);
  expect(webLocks({ isSecureContext: false, navigator: { locks } })).toBeUndefined();
  expect(webLocks({ isSecureContext: true, navigator: {} })).toBeUndefined();
});

test("ロックを取れたら遊び始め、ロックを持ったまま解決しない", async () => {
  const { requests, locks } = fakeLocks([lock]);
  const { events, notices, start } = recorder();

  await expect(
    settlesSoon(async () => {
      await playInOneTab(locks, notices, start);
    }),
  ).resolves.toBe(false);

  expect(events).toStrictEqual([["start"]]);
  expect(requests).toStrictEqual([[LOCK_NAME, { ifAvailable: true }]]);
});

test("別のタブがロックを持っていれば知らせて待ち、取れたら知らせを消して遊び始める", async () => {
  const { requests, locks } = fakeLocks([null, lock]);
  const { events, notices, start } = recorder();

  await expect(
    settlesSoon(async () => {
      await playInOneTab(locks, notices, start);
    }),
  ).resolves.toBe(false);

  expect(events).toStrictEqual([
    ["show", "別のタブでこのゲームを開いている。そのタブを閉じると、ここで続きから始める。"],
    ["clear"],
    ["start"],
  ]);
  expect(requests).toStrictEqual([
    [LOCK_NAME, { ifAvailable: true }],
    [LOCK_NAME, {}],
  ]);
});

test("Web Locks が無ければ、複数のタブで開くと上書きしうることを知らせて遊び始める", async () => {
  const { events, notices, start } = recorder();

  await playInOneTab(undefined, notices, start);

  expect(events).toStrictEqual([
    [
      "show",
      "このブラウザではタブの重複を防げないため、複数のタブで開くと互いの進行を上書きしうる。1 つのタブで遊んでほしい。",
    ],
    ["start"],
  ]);
});

test("ロックの要求が拒否されたら、その理由と上書きしうることを知らせて遊び始める", async () => {
  const { locks } = fakeLocks([{ reject: "拒否" }]);
  const { events, notices, start } = recorder();

  await playInOneTab(locks, notices, start);

  expect(events).toStrictEqual([
    [
      "show",
      "タブの重複を防ぐロックを使えない（Error: 拒否）ため、複数のタブで開くと互いの進行を上書きしうる。1 つのタブで遊んでほしい。",
    ],
    ["start"],
  ]);
});

test("別のタブが閉じるのを待つ間にロックを使えなくなったら、遊び始めずに開き直すよう知らせる", async () => {
  const { locks } = fakeLocks([null, { reject: "拒否" }]);
  const { events, notices, start } = recorder();

  await playInOneTab(locks, notices, start);

  expect(events).toStrictEqual([
    ["show", "別のタブでこのゲームを開いている。そのタブを閉じると、ここで続きから始める。"],
    ["clear"],
    ["show", "別のタブが閉じるのを待てなくなった（Error: 拒否）。ページを開き直してほしい。"],
  ]);
});

test("遊び始めた後の失敗は扱わずに投げる", async () => {
  const { locks } = fakeLocks([lock]);
  const { events, notices } = recorder();

  await expect(
    playInOneTab(locks, notices, () => {
      throw new Error("始められない");
    }),
  ).rejects.toThrow("始められない");
  expect(events).toStrictEqual([]);
});

test("待った後に遊び始めてからの失敗も扱わずに投げる", async () => {
  const { locks } = fakeLocks([null, lock]);
  const { events, notices } = recorder();

  await expect(
    playInOneTab(locks, notices, () => {
      throw new Error("始められない");
    }),
  ).rejects.toThrow("始められない");
  expect(events).toStrictEqual([
    ["show", "別のタブでこのゲームを開いている。そのタブを閉じると、ここで続きから始める。"],
    ["clear"],
  ]);
});
