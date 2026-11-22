import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { advance, initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { serialize } from "../save/save.ts";
import { awayReport, restore } from "./restore.ts";

const saved: GameState = {
  coins: num(5),
  totalEarned: num(20),
  collectors: 2,
  factories: 1,
  mints: 0,
  refineries: 0,
  upgrades: 0,
  autoBuyer: false,
  cautiousAutoBuyer: false,
};
const savedAt = 1_000_000;

test("保存データが無ければ初期状態から始める", () => {
  expect(restore(null, savedAt)).toStrictEqual({ state: initialState, at: savedAt });
});

test("保存してから今までの時間をオフラインの経過として進める", () => {
  const text = serialize({ state: saved, savedAt });

  // 毎秒 12 で 1 時間。自動購入を持たないので、施設は増えない。
  expect(restore(text, savedAt + 3_600_000)).toStrictEqual({
    state: advance(saved, 3600),
    at: savedAt + 3_600_000,
    away: "離れていた 1 時間 0 分のあいだに、コインを 43200 生産した。",
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

test("離れていた時間が 10 秒以下なら、離れていた間に進んだことを知らせない", () => {
  const text = serialize({ state: saved, savedAt });

  expect(restore(text, savedAt + 10_000)).toStrictEqual({
    state: advance(saved, 10),
    at: savedAt + 10_000,
  });
  expect(awayReport(saved, advance(saved, 10), 10)).toBeUndefined();
  // 10 秒を超えれば知らせる。経った時間は切り捨てて示す。
  expect(awayReport(saved, advance(saved, 10.001), 10.001)).toBe(
    "離れていた 10 秒のあいだに、コインを 120 生産した。",
  );
});

test("生産したコインは、手元のコインではなく、これまでに生産したコインの増分で示す", () => {
  // 離れている間に自動購入でコインを使っても、生産した量は減らない。
  const after: GameState = { ...saved, coins: num(3), totalEarned: num(20 + 1234.9) };

  expect(awayReport(saved, after, 90)).toBe(
    "離れていた 1 分 30 秒のあいだに、コインを 1234 生産した。",
  );
});

test.each([
  { collectors: 5, factories: 1, mints: 0, upgrades: 0, added: "採集機が 3 台" },
  { collectors: 2, factories: 4, mints: 0, upgrades: 0, added: "工場が 3 台" },
  { collectors: 2, factories: 1, mints: 2, upgrades: 0, added: "造幣所が 2 台" },
  { collectors: 2, factories: 1, mints: 0, upgrades: 2, added: "改良が 2 個" },
  {
    collectors: 3,
    factories: 2,
    mints: 1,
    upgrades: 1,
    added: "採集機が 1 台、工場が 1 台、造幣所が 1 台、改良が 1 個",
  },
] as const)(
  "自動購入で増えた施設と改良だけを示す（採集機 $collectors 台、工場 $factories 台、造幣所 $mints 台、改良 $upgrades）",
  ({ collectors, factories, mints, upgrades, added }) => {
    const after: GameState = {
      ...saved,
      totalEarned: num(120),
      collectors,
      factories,
      mints,
      upgrades,
    };

    expect(awayReport(saved, after, 86_400 * 2 + 3600 * 5 + 59)).toBe(
      `離れていた 2 日 5 時間のあいだに、コインを 100 生産した。自動購入で${added}増えた。`,
    );
  },
);

test("増えた数は、離れる前の数との差で示す", () => {
  const before: GameState = { ...saved, mints: 2, upgrades: 3 };
  const after: GameState = { ...before, totalEarned: num(120), mints: 3, upgrades: 15 };

  expect(awayReport(before, after, 3600)).toBe(
    "離れていた 1 時間 0 分のあいだに、コインを 100 生産した。自動購入で造幣所が 1 台、改良が 12 個増えた。",
  );
});

test("自動購入を持っていれば、離れていた間の購入で増えた施設を添える", () => {
  const rich: GameState = { ...saved, coins: num(1000), totalEarned: num(1000), autoBuyer: true };
  const text = serialize({ state: rich, savedAt });
  const after = advance(rich, 600);

  // 10 分の間に、自動購入が採集機を 2 台から 50 台に、工場を 1 台から 23 台にする。
  expect([after.collectors, after.factories]).toStrictEqual([50, 23]);
  expect(restore(text, savedAt + 600_000).away).toBe(
    "離れていた 10 分 0 秒のあいだに、コインを 121996 生産した。自動購入で採集機が 48 台、工場が 22 台増えた。",
  );
});
