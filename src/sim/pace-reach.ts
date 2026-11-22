// 目標値のファイル（docs/design/*.targets.json）の放置の許容間隔の段（`idle.reach`）の形と、読み込んだ値の検査。
// 段の意味は docs/design/README.md にある。
import type { Reader } from "./fields.ts";
import { fail, fieldsOf, finite, list, positive } from "./fields.ts";

/** 放置の許容間隔の段。`by` 秒以降の局面では、放置の許容間隔が `tolerance` 秒以上になる。 */
export interface Reach {
  readonly by: number;
  readonly tolerance: number;
}

const stage: Reader<Reach> = (value, path) => {
  const field = fieldsOf(value, path, ["by", "tolerance"]);
  return { by: field("by", finite), tolerance: field("tolerance", positive) };
};

/** 局面の始まり `phases` のうち、時刻 `by` 以降で最初の局面の位置。最後の局面より後の時刻なら -1。 */
const startOf = (phases: readonly number[], by: number): number =>
  phases.findIndex((phase) => phase >= by);

/**
 * 放置の許容間隔の段を読む。`phases` は測り方の局面の始まり（昇順）。後の段ほど、確かめ始める局面が後で、許容間隔が
 * 長い。確かめる局面が無い段と、前の段との組でどちらかが働かない段は、検査が何もしないまま通るため失敗にする。
 */
export const reachStages =
  (phases: readonly number[]): Reader<readonly Reach[]> =>
  (value, path) =>
    list(stage)(value, path).map((each, index, stages) => {
      const previous = stages[index - 1];
      const start = startOf(phases, each.by);
      if (start === -1) {
        return fail(
          `${path}[${index}].by`,
          "測り方の最後の局面（settings.idle.phases の最後）以下にする",
        );
      }
      if (previous !== undefined && start <= startOf(phases, previous.by)) {
        return fail(
          `${path}[${index}].by`,
          "前の段より後の局面から確かめる時刻にする（同じ局面から確かめる段は、許容間隔の長いほうしか働かない）",
        );
      }
      return previous === undefined || each.tolerance > previous.tolerance
        ? each
        : fail(
            `${path}[${index}].tolerance`,
            "前の段より長くする（前の段以下なら、前の段がすでに守っていて働かない）",
          );
    });
