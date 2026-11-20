import { expect, test } from "vitest";

import type { Bot, CheckIn } from "./bot.ts";
import { minimalGame } from "./minimal-game.ts";
import type { Settings } from "./simulate.ts";
import { settingsProblem } from "./schedule.ts";
import { simulate } from "./simulate.ts";

const bot = (checkIn: CheckIn): Bot => ({ purchase: "cheapest", checkIn, prestige: "never" });

const settings = (overrides: Partial<Settings>): Settings => ({
  duration: 30,
  step: 100,
  sampleEvery: 100,
  seed: 1,
  ...overrides,
});

test.each([
  {
    overrides: { duration: -1 },
    message: "duration は 0 以上 Number.MAX_VALUE / 2 以下の秒数で渡す: -1",
  },
  {
    overrides: { duration: Number.NaN },
    message: "duration は 0 以上 Number.MAX_VALUE / 2 以下の秒数で渡す: NaN",
  },
  {
    overrides: { duration: Number.POSITIVE_INFINITY },
    message: "duration は 0 以上 Number.MAX_VALUE / 2 以下の秒数で渡す: Infinity",
  },
  {
    overrides: { duration: 1.6e308 },
    message: "duration は 0 以上 Number.MAX_VALUE / 2 以下の秒数で渡す: 1.6e+308",
  },
  { overrides: { step: 0 }, message: "step は正の有限の秒数で渡す: 0" },
  {
    overrides: { step: Number.POSITIVE_INFINITY },
    message: "step は正の有限の秒数で渡す: Infinity",
  },
  { overrides: { sampleEvery: 0 }, message: "sampleEvery は正の有限の秒数で渡す: 0" },
] as const)("時間の設定が不正なら RangeError: $message", ({ overrides, message }) => {
  expect(() => simulate(minimalGame, bot({ kind: "always" }), settings(overrides))).toThrow(
    new RangeError(message),
  );
});

test("チェックインの間隔が正でなければ RangeError", () => {
  expect(() => simulate(minimalGame, bot({ kind: "every", seconds: 0 }), settings({}))).toThrow(
    new RangeError("checkIn.seconds は正の有限の秒数で渡す: 0"),
  );
});

// 1 秒に対して同じ時刻とみなす幅の 2 倍は 2^-48 秒。
const tooShort = 2 ** -48;

test.each([
  { checkIn: { kind: "always" }, overrides: { step: tooShort }, name: "step" },
  { checkIn: { kind: "always" }, overrides: { sampleEvery: tooShort }, name: "sampleEvery" },
  { checkIn: { kind: "every", seconds: tooShort }, overrides: {}, name: "checkIn.seconds" },
] as const)(
  "遊ぶ時間に比べて $name が丸め誤差と区別できないほど短ければ RangeError",
  ({ checkIn, overrides, name }) => {
    expect(() =>
      simulate(minimalGame, bot(checkIn), settings({ duration: 1, ...overrides })),
    ).toThrow(
      new RangeError(
        `duration 1 秒に対して ${name} ${tooShort} 秒が短すぎ、丸め誤差と区別できない`,
      ),
    );
    // 遊ぶ時間がわずかに短ければ、幅の 2 倍より長くなり受け付ける（遊ばせると時間がかかるため理由だけを見る）。
    expect(
      settingsProblem(bot(checkIn), settings({ duration: 1 - 2 ** -53, ...overrides })),
    ).toBeUndefined();
  },
);

test("遊ぶ時間は Number.MAX_VALUE / 2 まで受け付ける", () => {
  const half = Number.MAX_VALUE / 2;
  expect(
    settingsProblem(
      bot({ kind: "every", seconds: half }),
      settings({ duration: half, step: half, sampleEvery: half }),
    ),
  ).toBeUndefined();
});

test("常に開いているボットは、見積もりで進む時間の下限も遊ぶ時間に比べて短すぎてはいけない", () => {
  // 2^34 秒では、1 マイクロ秒（見積もりで進む時間の下限）が同じ時刻とみなす幅の 2 倍より短い。
  const longRun = settings({ duration: 2 ** 34, step: 2 ** 34, sampleEvery: 2 ** 34 });
  expect(() => simulate(minimalGame, bot({ kind: "always" }), longRun)).toThrow(
    new RangeError(
      "duration 17179869184 秒に対して 見積もりで進む時間の下限 0.000001 秒が短すぎ、丸め誤差と区別できない",
    ),
  );
  // 間隔を決めて開くボットは見積もりで進まないため、同じ設定で遊べる。
  expect(() =>
    simulate(minimalGame, bot({ kind: "every", seconds: 2 ** 34 }), longRun),
  ).not.toThrow();
});
