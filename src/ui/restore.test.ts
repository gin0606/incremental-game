import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { advance, initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { serialize } from "../save/save.ts";
import { restore } from "./restore.ts";

const saved: GameState = {
  coins: num(5),
  totalEarned: num(20),
  collectors: 2,
  factories: 1,
  autoBuyer: false,
};
const savedAt = 1_000_000;

test("保存データが無ければ初期状態から始める", () => {
  expect(restore(null, savedAt)).toStrictEqual({ state: initialState, at: savedAt });
});

test("保存してから今までの時間をオフラインの経過として進める", () => {
  const text = serialize({ state: saved, savedAt });

  // 毎秒 12 で 1 時間。
  expect(restore(text, savedAt + 3_600_000)).toStrictEqual({
    state: advance(saved, 3600),
    at: savedAt + 3_600_000,
  });
  expect(restore(text, savedAt + 3_600_000).state.coins).toBeApprox(num(5 + 12 * 3600));
});

test("時計が保存時より戻っていれば、保存時の状態と時刻から始め、そのことを知らせる", () => {
  const text = serialize({ state: saved, savedAt });

  expect(restore(text, savedAt - 60_000)).toStrictEqual({
    state: saved,
    at: savedAt,
    notice:
      "保存した時刻（1970-01-01T00:16:40.000Z）が今の時計より先のため、時計がその時刻を過ぎるまで生産を数えない。",
  });
});

test("保存時と同じ時刻なら経過 0 で、知らせることは無い", () => {
  const text = serialize({ state: saved, savedAt });

  expect(restore(text, savedAt)).toStrictEqual({ state: saved, at: savedAt });
});

test("読み込めない保存データなら最初から始め、元のデータを時刻付きのキーへ退避する", () => {
  const text = '{"version":99}';

  expect(restore(text, savedAt)).toStrictEqual({
    state: initialState,
    at: savedAt,
    backup: { key: "incremental-game:save:unreadable:1000000", text },
    notice:
      "保存データを読み込めなかったため、最初から始める（未知の版: 99）。元のデータは localStorage の incremental-game:save:unreadable:1000000 に残した。",
  });
});
