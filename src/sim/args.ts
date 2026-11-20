import type { CheckIn } from "./bot.ts";
import { purchaseRules } from "./bot.ts";
import type { Trial } from "./sets.ts";
import { fastSet, fullSet } from "./sets.ts";
import type { Settings } from "./simulate.ts";
import { settingsProblem } from "./schedule.ts";

/** CLI（src/sim/cli/main.ts）の使い方。引数が誤っているときに、誤りの説明に続けて示す。 */
const usage = `使い方: pnpm run sim (--bot <ボット>... | --set fast|full) --duration <時間> [オプション]

ボットにゲームを遊ばせ、時系列を JSON Lines で標準出力に書く。

  --bot <ボット>      <購入規則>@<チェックイン>。繰り返して複数指定できる。
                      購入規則: ${purchaseRules.join("、")}
                      チェックイン: always（常に開いている）か、開く間隔の時間（例: 10m）
                      例: efficiency@always、random@1h
  --set fast|full     決まったボットの組（src/sim/sets.ts）。fast は pre-commit、full は取り込み前に回す組。
  --duration <時間>   遊ぶ時間。例: 3d
  --seed <整数>       --bot のボットの乱数のシード（既定: 1）。下位 32 ビットだけを使う。--set の組はシードを組の中で決める。
  --step <時間>       刻み幅（既定: 1m）
  --sample <時間>     資源量と生産量を記録する間隔（既定: 1h）

時間は数に単位 s（秒）・m（分）・h（時間）・d（日）を付けて書く。単位が無ければ秒。数は 1e-3 のような指数表記でもよい。
`;

export interface Command {
  readonly trials: readonly Trial[];
  readonly settings: Omit<Settings, "seed">;
}

export type Parsed =
  | { readonly ok: true; readonly command: Command }
  /** 誤りの説明と使い方。 */
  | { readonly ok: false; readonly message: string };

/** 引数の誤り。{@link parseArgs} の中だけで投げて受け取る。 */
class UsageError extends Error {
  override readonly name = "UsageError";
}

const units: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** `3d`・`10m`・`90`・`1e-7s` のような 0 より長い時間を秒にする。読めなければ `undefined`。 */
export function parseDuration(text: string): number | undefined {
  const scale = units[text.slice(-1)];
  const digits = scale === undefined ? text : text.slice(0, -1);
  // 指数表記は、botName が JavaScript の数の表記で書いた間隔（1e-7s、1e+21s）を読み戻すために受け付ける。
  if (!/^\d+(?:\.\d+)?(?:e[+\-]?\d+)?$/v.test(digits)) {
    return undefined;
  }
  const seconds = Number(digits) * (scale ?? 1);
  return seconds > 0 && Number.isFinite(seconds) ? seconds : undefined;
}

const parseCheckIn = (text: string | undefined): CheckIn | undefined => {
  if (text === "always") {
    return { kind: "always" };
  }
  const seconds = text === undefined ? undefined : parseDuration(text);
  return seconds === undefined ? undefined : { kind: "every", seconds };
};

/** `text` が `list` のどれかか。 */
const isOneOf = <T extends string>(list: readonly T[], text: string | undefined): text is T =>
  list.some((item) => item === text);

/** `efficiency@always` のようなボットの指定を読む。 */
const parseBot = (text: string, seed: number): Trial => {
  const [purchase, checkInText, ...rest] = text.split("@");
  const checkIn = parseCheckIn(checkInText);
  if (!isOneOf(purchaseRules, purchase) || checkIn === undefined || rest.length > 0) {
    throw new UsageError(`--bot の指定が読めない: ${text}`);
  }
  return { bot: { purchase, checkIn, prestige: "never" }, seed };
};

const setNames = ["fast", "full"] as const;

const sets: Readonly<Record<(typeof setNames)[number], readonly Trial[]>> = {
  fast: fastSet,
  full: fullSet,
};

const optionNames = ["bot", "set", "duration", "seed", "step", "sample"] as const;

type OptionName = (typeof optionNames)[number];

type Values = Readonly<Partial<Record<OptionName, readonly string[]>>>;

/**
 * `--name value` と `--name=value` を、名前ごとの値の並びにする。npm の書き方（`pnpm run sim -- --bot ...`）で
 * pnpm がそのまま渡す先頭の `--` は読み飛ばす。
 */
const tokenize = (args: readonly string[]): Values => {
  const values: Partial<Record<OptionName, readonly string[]>> = {};
  const rest = args[0] === "--" ? args.slice(1) : [...args];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    const match = /^--([a-z]+)(?:=(.*))?$/v.exec(arg);
    const name = match?.[1];
    if (!isOneOf(optionNames, name)) {
      throw new UsageError(`知らない引数: ${arg}`);
    }
    const value = match?.[2] ?? rest.shift();
    if (value === undefined) {
      throw new UsageError(`--${name} に値が無い`);
    }
    values[name] = [...(values[name] ?? []), value];
  }
  return values;
};

/** 1 回だけ指定できる引数の値。指定が無ければ `fallback`。 */
const single = (values: Values, name: OptionName, fallback?: string): string => {
  const [value = fallback, ...rest] = values[name] ?? [];
  if (value === undefined) {
    throw new UsageError(`--${name} を指定する`);
  }
  if (rest.length > 0) {
    throw new UsageError(`--${name} は 1 回だけ指定する`);
  }
  return value;
};

const readDuration = (values: Values, name: OptionName, fallback?: string): number => {
  const text = single(values, name, fallback);
  const seconds = parseDuration(text);
  if (seconds === undefined) {
    throw new UsageError(`--${name} は 0 より長い時間で指定する: ${text}`);
  }
  return seconds;
};

const readSeed = (values: Values): number => {
  const text = single(values, "seed", "1");
  const seed = Number(text);
  if (!/^-?\d+$/v.test(text) || !Number.isSafeInteger(seed)) {
    throw new UsageError(`--seed は整数で指定する: ${text}`);
  }
  return seed;
};

const readTrials = (values: Values): readonly Trial[] => {
  const bots = values.bot ?? [];
  if (bots.length > 0) {
    if (values.set !== undefined) {
      throw new UsageError("--bot と --set は一緒に指定しない");
    }
    const seed = readSeed(values);
    return bots.map((text) => parseBot(text, seed));
  }
  if (values.seed !== undefined) {
    throw new UsageError("--seed は --bot と一緒に指定する（--set の組はシードを組の中で決める）");
  }
  if (values.set === undefined) {
    throw new UsageError("--bot か --set を指定する");
  }
  const name = single(values, "set");
  // `sets[name]` だけで判定すると、`constructor` などの Object.prototype の名前を組として読んでしまう。
  if (!isOneOf(setNames, name)) {
    throw new UsageError(`--set は fast か full で指定する: ${name}`);
  }
  return sets[name];
};

/** シミュレーターが受け付けない時間の設定（遊ぶ時間に比べて短すぎる刻み幅など）を、引数の誤りにする。 */
const checkSettings = ({ trials, settings }: Command): void => {
  for (const { bot, seed } of trials) {
    const problem = settingsProblem(bot, { ...settings, seed });
    if (problem !== undefined) {
      throw new UsageError(problem);
    }
  }
};

/**
 * CLI の引数を読む。
 */
export function parseArgs(args: readonly string[]): Parsed {
  try {
    const values = tokenize(args);
    const command: Command = {
      trials: readTrials(values),
      settings: {
        duration: readDuration(values, "duration"),
        step: readDuration(values, "step", "1m"),
        sampleEvery: readDuration(values, "sample", "1h"),
      },
    };
    checkSettings(command);
    return { ok: true, command };
  } catch (error) {
    if (error instanceof UsageError) {
      return { ok: false, message: `${error.message}\n\n${usage}` };
    }
    throw error;
  }
}
