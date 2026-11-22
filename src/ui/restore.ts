import type { GameState } from "../core/game.ts";
import { advance, initialState } from "../core/game.ts";
import { format, num, sub } from "../core/num.ts";
import { deserialize } from "../save/save.ts";
import { formatDuration } from "./view.ts";

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
  /** 離れていた間に進んだこと（{@link awayReport}）。 */
  readonly away?: string;
}

/**
 * 離れていた時間がこの秒数以下なら、離れていた間に進んだことを知らせない。それより短い不在（再読み込みなど）
 * では、プレイヤーは画面の状態を覚えている（docs/design/away-report.md）。
 */
const AWAY_REPORT_MIN_SECONDS = 10;

/**
 * 離れていた間に進んだことの知らせ。`before` は保存した状態、`after` はそれを `seconds` 秒進めた状態。生産した
 * コインは、離れている間に自動購入が使った分も数えるよう、これまでに生産したコインの増分で示す。施設と改良が
 * 増えるのは離れている間の自動購入だけ。離れていた時間が {@link AWAY_REPORT_MIN_SECONDS} 以下なら `undefined`。
 */
export function awayReport(
  before: GameState,
  after: GameState,
  seconds: number,
): string | undefined {
  if (seconds <= AWAY_REPORT_MIN_SECONDS) {
    return undefined;
  }
  const report = `離れていた ${formatDuration(num(seconds), "down")}のあいだに、コインを ${format(sub(after.totalEarned, before.totalEarned))} 生産した。`;
  const added = (
    [
      { name: "採集機", count: after.collectors - before.collectors, unit: "台" },
      { name: "工場", count: after.factories - before.factories, unit: "台" },
      { name: "造幣所", count: after.mints - before.mints, unit: "台" },
      { name: "改良", count: after.upgrades - before.upgrades, unit: "個" },
    ] as const
  )
    .filter(({ count }) => count > 0)
    .map(({ name, count, unit }) => `${name}が ${count} ${unit}`);
  return added.length === 0 ? report : `${report}自動購入で${added.join("、")}増えた。`;
}

/**
 * 保存データ（無ければ `null`）から、時刻 `now`（Unix 時刻のミリ秒）の状態を作る。保存してから今までの時間は
 * オフラインの経過として進め、離れていた間に進んだことを添える。時計が保存時より戻っていれば、保存時の状態と
 * 時刻から始め、そのことを知らせる。
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
  const seconds = (now - savedAt) / 1000;
  const advanced = advance(state, seconds);
  const away = awayReport(state, advanced, seconds);
  return { state: advanced, at: now, ...(away === undefined ? {} : { away }) };
}
