import { expect, test, vi } from "vitest";

import type { Bot } from "./bot.ts";
import { minimalGame } from "./minimal-game.ts";
import { toJsonLines } from "./output.ts";
import { runCli } from "./run.ts";
import { fastSet } from "./sets.ts";
import { simulate } from "./simulate.ts";

// 1 件の時間切れを広げる。最小ゲームを遊ばせるテストは 1 件 1 秒ほど（2026-11 に測って最長 0.7 秒）で終わるが、ほかの処理で機械が
// 混み合うと Vitest の既定の 5 秒を超え、結果と関係なく commit の検査が落ちた。時間切れは遅くなった実装を検出する
// ためのものではない（所要時間は src/sim/sets.ts の目安で見る）。
vi.setConfig({ testTimeout: 120_000 });

const capture = (
  args: readonly string[],
): {
  readonly code: number;
  readonly out: readonly string[];
  readonly error: readonly string[];
} => {
  const out: string[] = [];
  const error: string[] = [];
  const code = runCli(args, {
    out: (text) => {
      out.push(text);
    },
    error: (text) => {
      error.push(text);
    },
  });
  return { code, out, error };
};

test("指定したボットごとに最小ゲームを遊ばせ、時系列を書く", () => {
  const result = capture([
    "--bot",
    "roi@always",
    "--bot",
    "random@10m",
    "--duration",
    "2h",
    "--seed",
    "4",
  ]);
  const bots: readonly Bot[] = [
    { purchase: "roi", checkIn: { kind: "always" }, prestige: "never" },
    { purchase: "random", checkIn: { kind: "every", seconds: 600 }, prestige: "never" },
  ];
  const expected = bots.map((bot) =>
    toJsonLines(
      simulate(minimalGame, bot, { duration: 7200, step: 60, sampleEvery: 3600, seed: 4 }),
    ),
  );

  expect(result).toStrictEqual({ code: 0, out: expected, error: [] });
});

test("組を指定すると、組のボットとシードで遊ばせる", () => {
  const result = capture(["--set", "fast", "--duration", "10m", "--step", "10m"]);

  expect(result.out).toStrictEqual(
    fastSet.map(({ bot, seed }) =>
      toJsonLines(
        simulate(minimalGame, bot, { duration: 600, step: 600, sampleEvery: 3600, seed }),
      ),
    ),
  );
});

test("引数が誤っていれば、何も遊ばせずに理由と使い方を書いて 2 を返す", () => {
  const result = capture(["--bot", "roi@always"]);

  expect(result.code).toBe(2);
  expect(result.out).toStrictEqual([]);
  expect(result.error).toHaveLength(1);
  expect(result.error[0]).toMatch(/^--duration を指定する\n\n使い方: /v);
});
