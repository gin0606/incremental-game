import type { GameState } from "../core/game.ts";
import { advance, initialState } from "../core/game.ts";
import { deserialize } from "../save/save.ts";

/** 保存データを置く localStorage のキー。 */
export const SAVE_KEY = "incremental-game:save";

export interface Restored {
  readonly state: GameState;
  /** `state` の時刻（Unix 時刻のミリ秒）。時計が保存時より戻っていれば保存時の時刻。 */
  readonly at: number;
  /** 読み込めなかった保存データ。上書きして失わないよう、別のキーへ退避する。 */
  readonly backup?: { readonly key: string; readonly text: string };
  /** 利用者に知らせること。 */
  readonly notice?: string;
}

/**
 * 保存データ（無ければ `null`）から、時刻 `now`（Unix 時刻のミリ秒）の状態を作る。保存してから今までの時間は
 * オフラインの経過として進める。時計が保存時より戻っていれば、保存時の状態と時刻から始め、そのことを知らせる。
 * 読み込めなければ最初から始め、元のデータを退避先とともに返す。
 */
export function restore(text: string | null, now: number): Restored {
  if (text === null) {
    return { state: initialState, at: now };
  }
  const result = deserialize(text);
  if (!result.ok) {
    const key = `${SAVE_KEY}:unreadable:${now}`;
    return {
      state: initialState,
      at: now,
      backup: { key, text },
      notice: `保存データを読み込めなかったため、最初から始める（${result.error}）。元のデータは localStorage の ${key} に残した。`,
    };
  }
  const { state, savedAt } = result.data;
  if (savedAt > now) {
    // 時計が戻っていれば保存時の時刻のままにし、時計が追いつくまでの時間を二重に数えない。
    return {
      state,
      at: savedAt,
      notice: `保存した時刻（${new Date(savedAt).toISOString()}）が今の時計より先のため、時計がその時刻を過ぎるまで生産を数えない。`,
    };
  }
  return { state: advance(state, (now - savedAt) / 1000), at: now };
}
