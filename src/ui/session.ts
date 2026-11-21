import type { Action, GameState } from "../core/game.ts";
import { advance, perform } from "../core/game.ts";
import { serialize } from "../save/save.ts";
import type { Notices } from "./notices.ts";
import type { Restored } from "./restore.ts";
import { SAVE_KEY, restore } from "./restore.ts";

/** 保存先。localStorage と同じく、使えないときは例外を投げる。 */
export interface SaveStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

/** 遊んでいる状態。時刻はどれも Unix 時刻のミリ秒で受け取る。 */
export interface Session {
  readonly state: () => GameState;
  /** 時刻 `now` まで進める。時計が戻ったときは、追いつくまで進めない。 */
  readonly tick: (now: number) => void;
  /** 時刻 `now` から、時計が戻って止めている生産を再開するまでの秒数。止めていなければ 0。 */
  readonly pausedFor: (now: number) => number;
  /** 時刻 `now` まで進めて行動し、行動できたら保存する。 */
  readonly perform: (action: Action, now: number) => void;
  /** 時刻 `now` まで進めて、状態とその時刻を組で保存する。保存できなければ、そのことを知らせる。 */
  readonly save: (now: number) => void;
}

const read = (
  storage: SaveStorage,
): { readonly text: string | null } | { readonly error: unknown } => {
  try {
    return { text: storage.getItem(SAVE_KEY) };
  } catch (error) {
    return { error };
  }
};

/**
 * 保存データを時刻 `now` に読み込み、読めなかった保存データを退避する。保存データを読めないか、読み込めなかった
 * データを退避できなければ、元のデータを上書きしないよう保存してはいけない（`writable` が false）。
 */
const load = (
  storage: SaveStorage,
  notices: Notices,
  now: number,
): { readonly restored: Restored; readonly writable: boolean } => {
  const loaded = read(storage);
  const restored = restore("text" in loaded ? loaded.text : null, now);
  let writable = true;
  if ("error" in loaded) {
    writable = false;
    notices.show(`保存データを読めないため、進行を保存せずに始める: ${String(loaded.error)}`);
  }
  if (restored.backup !== undefined) {
    try {
      storage.setItem(restored.backup.key, restored.backup.text);
    } catch (error) {
      writable = false;
      notices.show(
        `読み込めなかった保存データを退避できなかったため、上書きしないよう進行を保存せずに始める: ${String(error)}`,
      );
    }
  }
  if (writable && restored.notice !== undefined) {
    notices.show(restored.notice);
  }
  return { restored, writable };
};

/** 保存データを時刻 `now` に読み込んで遊び始める（{@link load}）。 */
export function startSession(storage: SaveStorage, notices: Notices, now: number): Session {
  const { restored, writable } = load(storage, notices, now);
  // 遊んでいる状態と、その状態の時刻。時計が戻ったときに戻った時刻を記録すると、追いつくまでの時間を二重に数える。
  let state = restored.state;
  let at = restored.at;
  const tick = (time: number): void => {
    if (time > at) {
      state = advance(state, (time - at) / 1000);
      at = time;
    }
  };
  const save = (time: number): void => {
    if (!writable) {
      return;
    }
    tick(time);
    try {
      storage.setItem(SAVE_KEY, serialize({ state, savedAt: at }));
      notices.setSaveError(undefined);
    } catch (error) {
      notices.setSaveError(`保存できなかった: ${String(error)}`);
    }
  };
  return {
    state: () => state,
    tick,
    pausedFor: (time) => Math.max(0, (at - time) / 1000),
    perform: (action, time) => {
      tick(time);
      const next = perform(state, action);
      if (next !== undefined) {
        state = next;
        save(time);
      }
    },
    save,
  };
}
