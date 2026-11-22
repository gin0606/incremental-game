// 目標値のファイル（docs/design/*.targets.json）の、2 つの時刻の毎秒の生産量の比の下限（`growth.rateRatios`）の形と、
// 読み込んだ値の検査。意味は docs/design/README.md にある。
import type { Reader } from "./fields.ts";
import { fail, fieldsOf, finite, list, positive } from "./fields.ts";

/** 時刻 `to` 秒の毎秒の生産量が、時刻 `from` 秒の `min` 倍以上になる。 */
export interface RateRatio {
  readonly from: number;
  readonly to: number;
  readonly min: number;
}

const ratio =
  (duration: number): Reader<RateRatio> =>
  (value, path) => {
    const field = fieldsOf(value, path, ["from", "to", "min"]);
    const each = {
      from: field("from", finite),
      to: field("to", finite),
      min: field("min", positive),
    };
    if (each.from < 0) {
      return fail(`${path}.from`, "0 以上にする");
    }
    if (each.to <= each.from) {
      return fail(`${path}.to`, "from より後の時刻にする");
    }
    return each.to <= duration
      ? each
      : fail(`${path}.to`, "測り方の遊ぶ時間（settings.duration）以下にする");
  };

/**
 * 毎秒の生産量の比の下限を読む。`duration` は測り方の遊ぶ時間。項目が無ければ `undefined`（比を確かめない）。書くなら
 * 1 つ以上書く。遊ぶ時間の外の時刻と、0 より前の時刻は、記録が無く比を測れないため失敗にする。
 */
export const rateRatios =
  (duration: number): Reader<readonly RateRatio[] | undefined> =>
  (value, path) =>
    value === undefined ? undefined : list(ratio(duration))(value, path);
