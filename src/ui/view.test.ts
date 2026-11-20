import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { initialState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { view } from "./view.ts";

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test("初期状態では採集機と自動購入を並べ、工場は解放されるまで隠す。どれもまだ買えない", () => {
  expect(view(initialState)).toStrictEqual({
    coins: "0",
    production: "1",
    collectors: "1",
    factories: "0",
    autoBuyer: "なし",
    shop: [
      {
        action: { type: "buyCollector" },
        label: "採集機を買う（12 コイン）",
        visible: true,
        affordable: false,
      },
      {
        action: { type: "buyFactory" },
        label: "工場を買う（150 コイン）",
        visible: false,
        affordable: false,
      },
      {
        action: { type: "buyAutoBuyer" },
        label: "自動購入を買う（300 コイン）",
        visible: true,
        affordable: false,
      },
    ],
  });
});

test("工場が解放され、買える額があれば買える。自動購入を買い終えたら隠す", () => {
  const current = view(
    state({
      coins: num(200.7),
      totalEarned: num(1000),
      collectors: 3,
      factories: 2,
      autoBuyer: true,
    }),
  );

  expect(current).toStrictEqual({
    coins: "200",
    production: "23",
    collectors: "3",
    factories: "2",
    autoBuyer: "稼働中",
    shop: [
      {
        action: { type: "buyCollector" },
        label: "採集機を買う（16 コイン）",
        visible: true,
        affordable: true,
      },
      {
        action: { type: "buyFactory" },
        label: "工場を買う（216 コイン）",
        visible: true,
        affordable: false,
      },
      {
        action: { type: "buyAutoBuyer" },
        label: "自動購入を買う（300 コイン）",
        visible: false,
        affordable: false,
      },
    ],
  });
});
