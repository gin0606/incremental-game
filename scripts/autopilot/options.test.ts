import { expect, test } from "vitest";

import type { Options } from "./options.ts";
import { parseDuration, parseOptions, parseTime, USAGE } from "./options.ts";

const NOW = Date.parse("2026-11-21T12:00:00+09:00");
const UNTIL = "2026-11-23T23:59:00+09:00";
const REQUIRED = ["--until", UNTIL, "--log-dir", "logs"];

/** 読めた設定。読めなければ理由を例外にする。 */
const options = (args: readonly string[], now = NOW): Options => {
  const parsed = parseOptions(args, now);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.options;
};

test("長さは秒・分・時間の単位で読み、0 と単位の無い値と整数でない値は読まない", () => {
  expect(parseDuration("30s")).toBe(30_000);
  expect(parseDuration("90m")).toBe(5_400_000);
  expect(parseDuration("4h")).toBe(14_400_000);
  expect(parseDuration("1s")).toBe(1000);
  for (const text of [
    "0s",
    "30",
    "s",
    "",
    "1.5h",
    "-1m",
    "+1m",
    "1e3s",
    "01m",
    "1d",
    " 1s",
    "1s ",
  ]) {
    expect(parseDuration(text)).toBeUndefined();
  }
  expect(parseDuration(`${"9".repeat(20)}h`)).toBeUndefined();
  expect(parseDuration(`${String(Number.MAX_SAFE_INTEGER)}s`)).toBeUndefined();
  // Node.js のタイマーが待てる長さ（2147483647 ミリ秒）まで。
  expect(parseDuration("2147483s")).toBe(2_147_483_000);
  expect(parseDuration("2147484s")).toBeUndefined();
  expect(parseDuration("596h")).toBe(2_145_600_000);
  expect(parseDuration("597h")).toBeUndefined();
});

test("時刻は時差まで書いたものだけを読む", () => {
  expect(parseTime("2026-11-23T23:59:00+09:00")).toBe(Date.UTC(2026, 10, 23, 14, 59));
  expect(parseTime("2026-11-23T14:59Z")).toBe(Date.UTC(2026, 10, 23, 14, 59));
  expect(parseTime("2026-11-23T14:59:30.5-01:00")).toBe(Date.UTC(2026, 10, 23, 15, 59, 30, 500));
  expect(parseTime("2026-11-23T14:59:30.25Z")).toBe(Date.UTC(2026, 10, 23, 14, 59, 30, 250));
  expect(parseTime("2028-02-29T08:00Z")).toBe(Date.UTC(2028, 1, 29, 8));
  expect(parseTime("2026-12-31T08:00Z")).toBe(Date.UTC(2026, 11, 31, 8));
  for (const text of [
    "2026-11-23T23:59:00",
    "2026-11-23 23:59:00+09:00",
    "2026-11-23",
    "x2026-11-23T23:59Z",
    "+002026-11-23T23:59Z",
    "2026-11-23T23:59Zx",
    "2026-11-23T23:59+09:00x",
    "2026-13-45T99:99Z",
    // 暦に無い日。Date.parse は翌月の日に読み替える。
    "2027-02-29T08:00Z",
    "2026-11-31T08:00+09:00",
    "2026-00-10T08:00Z",
  ]) {
    expect(parseTime(text)).toBeUndefined();
  }
});

test("既定の値を補う", () => {
  expect(parseOptions(REQUIRED, NOW)).toStrictEqual({
    ok: true,
    options: {
      until: Date.parse(UNTIL),
      logDir: "logs",
      direction: undefined,
      waitFile: undefined,
      stopFile: undefined,
      previousReport: undefined,
      maxFailures: 3,
      maxIdle: 3,
      minFreeBytes: 20 * 1024 ** 3,
      roundTimeout: 4 * 3_600_000,
      poll: 30_000,
    },
  });
});

test("指定した値で既定の値を置き換える", () => {
  expect(
    parseOptions(
      [
        ...REQUIRED,
        "--direction",
        "試運転",
        "--wait-file",
        "w",
        "--stop-file",
        "s",
        "--previous-report",
        "r.md",
        "--max-failures",
        "12",
        "--max-idle",
        "5",
        "--min-free-gb",
        "0.25",
        "--round-timeout",
        "10s",
        "--poll",
        "1s",
      ],
      NOW,
    ),
  ).toStrictEqual({
    ok: true,
    options: {
      until: Date.parse(UNTIL),
      logDir: "logs",
      direction: "試運転",
      waitFile: "w",
      stopFile: "s",
      previousReport: "r.md",
      maxFailures: 12,
      maxIdle: 5,
      minFreeBytes: 0.25 * 1024 ** 3,
      roundTimeout: 10_000,
      poll: 1000,
    },
  });
});

test("空の値は指定しなかったものとして扱う", () => {
  const parsed = options([...REQUIRED, "--direction", "", "--wait-file", ""]);
  expect(parsed.direction).toBeUndefined();
  expect(parsed.waitFile).toBeUndefined();
  expect(parseOptions(["--until", UNTIL, "--log-dir", ""], NOW)).toStrictEqual({
    ok: false,
    error: "TypeError: --until と --log-dir は必ず指定する",
  });
});

test("誤った引数は理由を返す", () => {
  const cases: readonly (readonly [readonly string[], string])[] = [
    [["--log-dir", "logs"], "--until と --log-dir は必ず指定する"],
    [["--until", UNTIL], "--until と --log-dir は必ず指定する"],
    [[...REQUIRED, "--unknown", "1"], "知らない引数: --unknown"],
    [[...REQUIRED, "--poll"], "--poll に値が無い"],
    [[...REQUIRED, "--log-dir", "other"], "--log-dir を 2 回指定した"],
    [
      ["--until", "2026-11-23T23:59:00", "--log-dir", "logs"],
      "--until は時差まで書いた ISO 8601 の時刻にする: 2026-11-23T23:59:00",
    ],
    [
      ["--until", "2026-11-21T12:00:00+09:00", "--log-dir", "logs"],
      "--until が過去の時刻: 2026-11-21T12:00:00+09:00",
    ],
    [[...REQUIRED, "--max-failures", "0"], "--max-failures の値が読めない: 0"],
    [[...REQUIRED, "--max-failures", "1.5"], "--max-failures の値が読めない: 1.5"],
    [[...REQUIRED, "--max-failures", "+1"], "--max-failures の値が読めない: +1"],
    [[...REQUIRED, "--max-failures", "1e3"], "--max-failures の値が読めない: 1e3"],
    [
      [...REQUIRED, "--max-failures", "99999999999999999999"],
      "--max-failures の値が読めない: 99999999999999999999",
    ],
    [[...REQUIRED, "--min-free-gb", "-1"], "--min-free-gb の値が読めない: -1"],
    [[...REQUIRED, "--min-free-gb", "1."], "--min-free-gb の値が読めない: 1."],
    [[...REQUIRED, "--round-timeout", "10"], "--round-timeout の値が読めない: 10"],
    [[...REQUIRED, "--poll", "0s"], "--poll の値が読めない: 0s"],
  ];
  for (const [args, error] of cases) {
    expect(parseOptions(args, NOW)).toStrictEqual({ ok: false, error: `TypeError: ${error}` });
  }
});

test("使い方はすべての引数を挙げる", () => {
  for (const name of [
    "--until",
    "--log-dir",
    "--direction",
    "--wait-file",
    "--stop-file",
    "--previous-report",
    "--max-failures",
    "--min-free-gb",
    "--round-timeout",
    "--poll",
  ]) {
    expect(USAGE).toContain(`  ${name} <`);
  }
});

test("値の位置にある `--` で始まる文字列は値として読む", () => {
  expect(options([...REQUIRED, "--direction", "--poll"]).direction).toBe("--poll");
});

test("終了時刻がちょうど今なら過去として扱い、1 ミリ秒先なら受け付ける", () => {
  const until = "2026-11-21T12:00:00.001+09:00";
  expect(parseOptions(["--until", until, "--log-dir", "l"], NOW + 1).ok).toBe(false);
  expect(parseOptions(["--until", until, "--log-dir", "l"], NOW).ok).toBe(true);
});
