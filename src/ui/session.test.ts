import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { advance, initialState, perform } from "../core/game.ts";
import { num } from "../core/num.ts";
import { serialize } from "../save/save.ts";
import type { Notices } from "./notices.ts";
import { SAVE_KEY } from "./restore.ts";
import type { SaveStorage } from "./session.ts";
import { startSession } from "./session.ts";
import { view } from "./view.ts";

const T0 = 1_000_000;

const saved: GameState = {
  coins: num(100),
  totalEarned: num(100),
  collectors: 2,
  factories: 0,
  autoBuyer: false,
};

type Event = readonly ["show" | "clear" | "saveError", string | undefined];

/** 呼ばれた順に記録する通知。 */
const recordingNotices = (): { readonly events: Event[]; readonly notices: Notices } => {
  const events: Event[] = [];
  return {
    events,
    notices: {
      show: (message) => {
        events.push(["show", message]);
      },
      clear: () => {
        events.push(["clear", undefined]);
      },
      setSaveError: (message) => {
        events.push(["saveError", message]);
      },
    },
  };
};

interface FakeStorage {
  readonly items: Map<string, string>;
  /** setItem で書いた順のキー。失敗した書き込みも含む。 */
  readonly writes: string[];
  readonly storage: SaveStorage;
}

/** メモリ上の保存先。`failReads`・`failWrites` が true の間は、読み書きで例外を投げる。 */
const fakeStorage = (
  initial: Readonly<Record<string, string>> = {},
): FakeStorage & { failReads: boolean; failWrites: boolean } => {
  const fake = {
    items: new Map(Object.entries(initial)),
    writes: [] as string[],
    failReads: false,
    failWrites: false,
    storage: {
      getItem: (key: string): string | null => {
        if (fake.failReads) {
          throw new Error("読めない");
        }
        return fake.items.get(key) ?? null;
      },
      setItem: (key: string, value: string): void => {
        fake.writes.push(key);
        if (fake.failWrites) {
          throw new Error("書けない");
        }
        fake.items.set(key, value);
      },
    },
  };
  return fake;
};

test("保存データが無ければ初期状態から始め、保存すると状態とその時刻を書く", () => {
  const fake = fakeStorage();
  const { events, notices } = recordingNotices();

  const session = startSession(fake.storage, notices, T0);
  expect(session.state()).toBe(initialState);
  session.save(T0 + 2000);

  expect(fake.items.get(SAVE_KEY)).toBe(
    serialize({ state: advance(initialState, 2), savedAt: T0 + 2000 }),
  );
  expect(events).toStrictEqual([["saveError", undefined]]);
});

test("保存データから、保存してから今までの時間を進めて始める", () => {
  const fake = fakeStorage({ [SAVE_KEY]: serialize({ state: saved, savedAt: T0 }) });

  const session = startSession(fake.storage, recordingNotices().notices, T0 + 60_000);

  expect(session.state()).toStrictEqual(advance(saved, 60));
  expect(fake.writes).toStrictEqual([]);
});

test("時刻まで進め、同じ時刻では状態を変えない", () => {
  const session = startSession(fakeStorage().storage, recordingNotices().notices, T0);

  session.tick(T0 + 1500);
  const after = session.state();
  expect(after).toStrictEqual(advance(initialState, 1.5));
  session.tick(T0 + 1500);

  expect(session.state()).toBe(after);
});

test("時計が戻ったときは、追いつくまで進めず、戻った間を二重に数えない", () => {
  const fake = fakeStorage();
  const session = startSession(fake.storage, recordingNotices().notices, T0);

  session.tick(T0 - 5000);
  expect(session.state()).toBe(initialState);
  session.save(T0 - 5000);
  expect(fake.items.get(SAVE_KEY)).toBe(serialize({ state: initialState, savedAt: T0 }));
  session.tick(T0 + 1000);

  expect(session.state()).toStrictEqual(advance(initialState, 1));
});

// SUSPECTED_BUG: 時計が戻って生産が止まっている間も、止まる前と同じ待ち時間（約 12 秒）を示し続ける。実際には
// 時計が追いつくまで（ここでは 1 時間）生産しないため、届かない時間を示している。止まっていることを示すべき。
test("時計が戻って生産が止まっている間も、待ち時間の表示が止まる前のまま（不具合の疑い）", () => {
  const session = startSession(fakeStorage().storage, recordingNotices().notices, T0);

  session.tick(T0 - 3_600_000);

  expect(view(session.state()).nextPurchase).toBe("今の生産のままで約 12 秒");
});

test("保存した時刻が今より先なら、保存時の状態と時刻から始めて知らせる", () => {
  const fake = fakeStorage({ [SAVE_KEY]: serialize({ state: saved, savedAt: T0 }) });
  const { events, notices } = recordingNotices();

  const session = startSession(fake.storage, notices, T0 - 60_000);
  session.tick(T0 + 1000);

  expect(session.state()).toStrictEqual(advance(saved, 1));
  expect(events).toStrictEqual([
    [
      "show",
      "保存した時刻（1970-01-01T00:16:40.000Z）が今の時計より先のため、時計がその時刻を過ぎるまで生産を数えない。",
    ],
  ]);
});

test("行動できたら、行動の時刻まで進めてから行動し、保存する", () => {
  const fake = fakeStorage({ [SAVE_KEY]: serialize({ state: saved, savedAt: T0 }) });
  const session = startSession(fake.storage, recordingNotices().notices, T0);

  session.perform({ type: "buyCollector" }, T0 + 1000);

  const expected = perform(advance(saved, 1), { type: "buyCollector" });
  expect(expected).toBeDefined();
  expect(session.state()).toStrictEqual(expected);
  expect(fake.items.get(SAVE_KEY)).toBe(serialize({ state: session.state(), savedAt: T0 + 1000 }));
});

test("行動できなければ、時刻まで進めるだけで保存しない", () => {
  const fake = fakeStorage();
  const session = startSession(fake.storage, recordingNotices().notices, T0);

  session.perform({ type: "buyFactory" }, T0 + 1000);

  expect(session.state()).toStrictEqual(advance(initialState, 1));
  expect(fake.writes).toStrictEqual([]);
});

test("保存できなければ知らせ、保存できたら消す", () => {
  const fake = fakeStorage();
  const { events, notices } = recordingNotices();
  const session = startSession(fake.storage, notices, T0);

  fake.failWrites = true;
  session.save(T0);
  fake.failWrites = false;
  session.save(T0);

  expect(events).toStrictEqual([
    ["saveError", "保存できなかった: Error: 書けない"],
    ["saveError", undefined],
  ]);
  expect(fake.items.get(SAVE_KEY)).toBe(serialize({ state: initialState, savedAt: T0 }));
});

test("保存データを読めなければ、知らせて初期状態から始め、以後は保存しない", () => {
  const fake = fakeStorage({ [SAVE_KEY]: serialize({ state: saved, savedAt: T0 }) });
  fake.failReads = true;
  const { events, notices } = recordingNotices();

  const session = startSession(fake.storage, notices, T0);
  session.save(T0 + 1000);

  expect(session.state()).toBe(initialState);
  expect(fake.writes).toStrictEqual([]);
  expect(events).toStrictEqual([
    ["show", "保存データを読めないため、進行を保存せずに始める: Error: 読めない"],
  ]);
});

test("読み込めない保存データは退避して知らせ、最初から始めて保存する", () => {
  const text = '{"version":99}';
  const fake = fakeStorage({ [SAVE_KEY]: text });
  const { events, notices } = recordingNotices();

  const session = startSession(fake.storage, notices, T0);
  session.save(T0);

  const backupKey = `${SAVE_KEY}:unreadable:${T0}`;
  expect(fake.items.get(backupKey)).toBe(text);
  expect(fake.writes).toStrictEqual([backupKey, SAVE_KEY]);
  expect(session.state()).toBe(initialState);
  expect(events).toStrictEqual([
    [
      "show",
      `保存データを読み込めなかったため、最初から始める（未知の版: 99）。元のデータは localStorage の ${backupKey} に残した。`,
    ],
    ["saveError", undefined],
  ]);
});

test("読み込めない保存データを退避できなければ、知らせて以後は保存せず、元のデータを残す", () => {
  const text = '{"version":99}';
  const fake = fakeStorage({ [SAVE_KEY]: text });
  fake.failWrites = true;
  const { events, notices } = recordingNotices();

  const session = startSession(fake.storage, notices, T0);
  fake.failWrites = false;
  session.save(T0);

  expect(fake.writes).toStrictEqual([`${SAVE_KEY}:unreadable:${T0}`]);
  expect(fake.items.get(SAVE_KEY)).toBe(text);
  expect(events).toStrictEqual([
    [
      "show",
      "読み込めなかった保存データを退避できなかったため、上書きしないよう進行を保存せずに始める: Error: 書けない",
    ],
  ]);
});
