import { expect, test } from "vitest";

import type { Parsed } from "./args.ts";
import { parseArgs, parseDuration } from "./args.ts";
import type { Bot } from "./bot.ts";
import { botName } from "./bot.ts";
import { fastSet, fullSet } from "./sets.ts";

const message = (parsed: Parsed): string => (parsed.ok ? "" : parsed.message);

test.each([
  { text: "90", expected: 90 },
  { text: "90s", expected: 90 },
  { text: "1.5m", expected: 90 },
  { text: "1.25m", expected: 75 },
  { text: "2h", expected: 7200 },
  { text: "3d", expected: 259_200 },
  { text: "1e3", expected: 1000 },
  { text: "1e-7s", expected: 1e-7 },
  { text: "1.5e+21s", expected: 1.5e21 },
] as const)("時間 $text は $expected 秒", ({ text, expected }) => {
  expect(parseDuration(text)).toBe(expected);
});

test.each([
  "",
  "0",
  "0s",
  "-1s",
  " 1h",
  "1w",
  "1 h",
  "h",
  "e3",
  "1e",
  "1e+",
  "1E3",
  "1.s",
  "1.5.5",
  "9".repeat(400),
])("時間 %j は読めない", (text) => {
  expect(parseDuration(text)).toBeUndefined();
});

test("ボットと時間を指定し、残りは既定の値を使う", () => {
  expect(parseArgs(["--bot", "efficiency@always", "--duration", "3d"])).toStrictEqual({
    ok: true,
    command: {
      trials: [
        {
          bot: { purchase: "efficiency", checkIn: { kind: "always" }, prestige: "never" },
          seed: 1,
        },
      ],
      settings: { duration: 259_200, step: 60, sampleEvery: 3600 },
    },
  });
});

test("先頭の `--` は読み飛ばす", () => {
  expect(parseArgs(["--", "--bot", "efficiency@always", "--duration", "3d"])).toStrictEqual(
    parseArgs(["--bot", "efficiency@always", "--duration", "3d"]),
  );
});

test("ボットを複数指定し、シード・刻み幅・記録の間隔を `=` でも指定できる", () => {
  expect(
    parseArgs([
      "--bot=random@10m",
      "--bot",
      "cheapest@90",
      "--duration=1h",
      "--seed=-17",
      "--step",
      "5s",
      "--sample=1m",
    ]),
  ).toStrictEqual({
    ok: true,
    command: {
      trials: [
        {
          bot: { purchase: "random", checkIn: { kind: "every", seconds: 600 }, prestige: "never" },
          seed: -17,
        },
        {
          bot: { purchase: "cheapest", checkIn: { kind: "every", seconds: 90 }, prestige: "never" },
          seed: -17,
        },
      ],
      settings: { duration: 3600, step: 5, sampleEvery: 60 },
    },
  });
});

test("全組のボットの名前（botName）は --bot で同じボットに読める", () => {
  const parsed = parseArgs([
    ...fullSet.flatMap(({ bot }) => ["--bot", botName(bot)]),
    "--duration",
    "1d",
  ]);

  expect(parsed).toStrictEqual({
    ok: true,
    command: {
      trials: fullSet.map(({ bot }) => ({ bot, seed: 1 })),
      settings: { duration: 86_400, step: 60, sampleEvery: 3600 },
    },
  });
});

test.each([1e-7, 0.1 + 0.2, 1e21])(
  "間隔 %d 秒のボットの名前は --bot で同じボットに読める",
  (seconds) => {
    const bot: Bot = { purchase: "roi", checkIn: { kind: "every", seconds }, prestige: "never" };
    const parsed = parseArgs(["--bot", botName(bot), "--duration", "1d"]);

    expect(parsed).toStrictEqual({
      ok: true,
      command: {
        trials: [{ bot, seed: 1 }],
        settings: { duration: 86_400, step: 60, sampleEvery: 3600 },
      },
    });
  },
);

test.each([
  { name: "fast", expected: fastSet },
  { name: "full", expected: fullSet },
] as const)("--set $name は決まった組を使う", ({ name, expected }) => {
  expect(parseArgs(["--set", name, "--duration", "1d"])).toStrictEqual({
    ok: true,
    command: { trials: expected, settings: { duration: 86_400, step: 60, sampleEvery: 3600 } },
  });
});

test.each([
  { args: ["--duration", "1d"], error: "--bot か --set を指定する" },
  { args: ["--bot", "roi@always"], error: "--duration を指定する" },
  { args: ["--bot", "roi@always", "--set", "fast", "--duration", "1d"], error: "--bot と --set" },
  { args: ["--set", "fast", "--seed", "2", "--duration", "1d"], error: "--seed は --bot と" },
  { args: ["--set", "slow", "--duration", "1d"], error: "--set は fast か full" },
  { args: ["--set", "constructor", "--duration", "1d"], error: "--set は fast か full" },
  { args: ["--set", "fast", "--set", "full", "--duration", "1d"], error: "--set は 1 回だけ" },
  {
    args: ["--bot", "roi@always", "--duration", "1d", "--duration", "2d"],
    error: "--duration は 1 回だけ",
  },
  { args: ["--bot", "roi@always", "--duration", "0"], error: "--duration は 0 より長い時間" },
  {
    args: ["--bot", "roi@always", "--duration", "1d", "--step", "x"],
    error: "--step は 0 より長い時間",
  },
  {
    args: ["--bot", "roi@always", "--duration", "1d", "--sample", "0s"],
    error: "--sample は 0 より長い時間",
  },
  { args: ["--bot", "roi@always", "--duration", "1d", "--seed", "1.5"], error: "--seed は整数" },
  { args: ["--bot", "roi@always", "--duration", "1d", "--seed", "1e3"], error: "--seed は整数" },
  {
    args: ["--bot", "roi@always", "--duration", "1d", "--seed", "9007199254740993"],
    error: "--seed は整数",
  },
  { args: ["--bot", "roi", "--duration", "1d"], error: "--bot の指定が読めない: roi" },
  { args: ["--bot", "best@always", "--duration", "1d"], error: "--bot の指定が読めない" },
  { args: ["--bot", "roi@sometimes", "--duration", "1d"], error: "--bot の指定が読めない" },
  { args: ["--bot", "roi@0s", "--duration", "1d"], error: "--bot の指定が読めない" },
  { args: ["--bot", "roi@always@1h", "--duration", "1d"], error: "--bot の指定が読めない" },
  { args: ["--bot", "roi@always", "--duration"], error: "--duration に値が無い" },
  { args: ["--bot", "roi@always", "--duration", "1d", "extra"], error: "知らない引数: extra" },
  { args: ["--bot", "roi@always", "--", "--duration", "1d"], error: "知らない引数: --" },
  { args: ["--Bot", "roi@always", "--duration", "1d"], error: "知らない引数: --Bot" },
  { args: ["--bot", "roi@always", "x--duration", "1d"], error: "知らない引数: x--duration" },
  { args: ["--bot", "roi@always", "--duration2", "1d"], error: "知らない引数: --duration2" },
  { args: ["--help"], error: "知らない引数: --help" },
  {
    args: ["--bot", "roi@always", "--duration", "1m", "--step", "0.0000000000000001"],
    error: "duration 60 秒に対して step 1e-16 秒が短すぎ、丸め誤差と区別できない",
  },
] as const)("誤った引数は理由と使い方を返す: $error", ({ args, error }) => {
  const parsed = parseArgs(args);

  expect(parsed.ok).toBe(false);
  expect(message(parsed).startsWith(error)).toBe(true);
  expect(message(parsed)).toContain("\n\n使い方: pnpm run sim ");
});

test("使い方に購入規則の一覧を示す", () => {
  expect(message(parseArgs([]))).toContain("購入規則: efficiency、roi、cheapest、newest、random\n");
});

test("引数の誤り以外の例外は投げ直す", () => {
  const broken = new Proxy<string[]>([], {
    get: () => {
      throw new TypeError("壊れた引数");
    },
  });

  expect(() => parseArgs(broken)).toThrow(TypeError);
});
