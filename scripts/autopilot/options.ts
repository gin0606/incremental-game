// 無人運転のドライバ（cli/main.ts）の引数の読み方。パスは読んだままの文字列で返し、CLI が起動したディレクトリから解く。

/** ドライバの設定。時刻は UNIX エポックからのミリ秒、長さはミリ秒、容量はバイト。 */
export interface Options {
  /** この時刻を過ぎたら次の回を始めない。実行中の回は終わるまで待つ。 */
  readonly until: number;
  readonly logDir: string;
  /** `/supervise` に渡す方向性。無ければ引数なしで呼ぶ。 */
  readonly direction: string | undefined;
  /** このファイルが消えるまで最初の回を始めない。 */
  readonly waitFile: string | undefined;
  /** このファイルがあれば次の回を始めない。無ければログの置き場の `stop`。 */
  readonly stopFile: string | undefined;
  /** 最初の回に前の回の最終報告として渡すファイル（前のドライバの実行が残したもの）。 */
  readonly previousReport: string | undefined;
  readonly maxFailures: number;
  readonly maxIdle: number;
  readonly minFreeBytes: number;
  readonly roundTimeout: number;
  readonly poll: number;
}

export type ParseResult =
  | { readonly ok: true; readonly options: Options }
  | { readonly ok: false; readonly error: string };

export const USAGE = `使い方: node scripts/autopilot/cli/main.ts --until <終了時刻> --log-dir <ログの置き場> [設定]

  main checkout のルートで、nohup caffeinate -i node scripts/autopilot/cli/main.ts ... > <ログ> 2>&1 & の形で起動する
  （ドライバ自身はスリープを防がない）。

  --until <時刻>             この時刻を過ぎたら次の回を始めない。ISO 8601 で、時差（Z か +09:00 など）まで書く。
  --log-dir <ディレクトリ>   回ごとの出力・最終報告・結果と、プロセスの識別子（driver.pid）を置く。Git 管理外にする。
  --direction <文>           /supervise に渡す方向性。
  --wait-file <ファイル>     このファイルが消えるまで最初の回を始めない。
  --stop-file <ファイル>     置くと、実行中の回が終わった後に止まる。既定はログの置き場の stop。
  --previous-report <ファイル> 最初の回に前の回の最終報告として渡す。
  --max-failures <回数>      ready を取り込めた回を挟まずにこの回数だけ失敗したら止まる。既定は 3。
  --max-idle <回数>          ready を取り込めた回を挟まずにこの回数だけ nothing で終わったら止まる。既定は 3。
  --min-free-gb <GB>         ディスクの空きがこれを下回ったら止まる。既定は 20。
  --round-timeout <長さ>     1 回の監督セッションの時間の上限（例: 4h、90m、30s）。既定は 4h。
  --poll <長さ>              待機ファイルを確かめる間隔。既定は 30s。
`;

const GIGABYTE = 1024 ** 3;

const UNIT_MS: ReadonlyMap<string, number> = new Map([
  ["s", 1000],
  ["m", 60_000],
  ["h", 3_600_000],
]);

const parsePositiveInteger = (text: string): number | undefined =>
  /^[1-9]\d*$/v.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : undefined;

/**
 * Node.js のタイマーが待てる最も長い時間（2147483647 ミリ秒。超える値を渡すと 1 ミリ秒で発火する）を、最も小さい
 * 単位の秒で切り捨てたもの。
 */
const MAX_TIMER_MS = 2_147_483_000;

/** `30s`・`90m`・`4h` の形の長さをミリ秒で返す。0、読めない値、タイマーで待てない長さは undefined。 */
export const parseDuration = (text: string): number | undefined => {
  const amount = parsePositiveInteger(text.slice(0, -1));
  const unit = UNIT_MS.get(text.slice(-1));
  if (amount === undefined || unit === undefined) {
    return undefined;
  }
  const value = amount * unit;
  return value <= MAX_TIMER_MS ? value : undefined;
};

/**
 * `YYYY-MM-DD` で始まる、Date.parse が読めた時刻の日が暦に在るか。Date.parse は 2 月 30 日などを翌月の日に読み替える
 * ので、その年月の日として作り直して日が変わらないかを見る。
 */
const isCalendarDay = (text: string): boolean => {
  const day = Number(text.slice(8, 10));
  return (
    new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, day)).getUTCDate() ===
    day
  );
};

/**
 * ISO 8601 の時刻をエポックからのミリ秒で返す。時差の無い書き方は実行環境のタイムゾーンで読まれるため受け付けない。
 * 書き方を確かめた部分だけを Date.parse に渡す（Date.parse は年の前の `+00` などほかの書き方も読む）。
 */
export const parseTime = (text: string): number | undefined => {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+\-]\d{2}:\d{2})$/v.exec(
    text,
  );
  if (match === null) {
    return undefined;
  }
  const value = Date.parse(match[0]);
  return Number.isNaN(value) || !isCalendarDay(match[0]) ? undefined : value;
};

const parseGigabytes = (text: string): number | undefined =>
  /^\d+(?:\.\d+)?$/v.test(text) ? Number(text) * GIGABYTE : undefined;

const NAMES = [
  "--until",
  "--log-dir",
  "--direction",
  "--wait-file",
  "--stop-file",
  "--previous-report",
  "--max-failures",
  "--max-idle",
  "--min-free-gb",
  "--round-timeout",
  "--poll",
] as const;

type Name = (typeof NAMES)[number];

const isName = (text: string): text is Name => (NAMES as readonly string[]).includes(text);

/** `--名前 値` の組を読む。知らない名前、値の無い名前、2 回目の指定は例外にする。 */
const readPairs = (args: readonly string[]): Readonly<Partial<Record<Name, string>>> => {
  const values: Partial<Record<Name, string>> = {};
  let pending: Name | undefined;
  for (const arg of args) {
    if (pending !== undefined) {
      values[pending] = arg;
      pending = undefined;
    } else if (!isName(arg)) {
      throw new TypeError(`知らない引数: ${arg}`);
    } else if (arg in values) {
      throw new TypeError(`${arg} を 2 回指定した`);
    } else {
      pending = arg;
    }
  }
  if (pending !== undefined) {
    throw new TypeError(`${pending} に値が無い`);
  }
  return values;
};

const nonEmpty = (value: string | undefined): string | undefined =>
  value === "" ? undefined : value;

/** 指定が無ければ既定の値を読む。読めなければ例外にする。 */
const numberOption = (
  values: Readonly<Partial<Record<Name, string>>>,
  name: Name,
  fallback: string,
  parse: (text: string) => number | undefined,
): number => {
  const text = values[name] ?? fallback;
  const value = parse(text);
  if (value === undefined) {
    throw new TypeError(`${name} の値が読めない: ${text}`);
  }
  return value;
};

const readOptions = (values: Readonly<Partial<Record<Name, string>>>, now: number): Options => {
  const untilText = values["--until"];
  const logDir = nonEmpty(values["--log-dir"]);
  if (untilText === undefined || logDir === undefined) {
    throw new TypeError("--until と --log-dir は必ず指定する");
  }
  const until = parseTime(untilText);
  if (until === undefined) {
    throw new TypeError(`--until は時差まで書いた ISO 8601 の時刻にする: ${untilText}`);
  }
  if (until <= now) {
    throw new TypeError(`--until が過去の時刻: ${untilText}`);
  }
  return {
    until,
    logDir,
    direction: nonEmpty(values["--direction"]),
    waitFile: nonEmpty(values["--wait-file"]),
    stopFile: nonEmpty(values["--stop-file"]),
    previousReport: nonEmpty(values["--previous-report"]),
    maxFailures: numberOption(values, "--max-failures", "3", parsePositiveInteger),
    maxIdle: numberOption(values, "--max-idle", "3", parsePositiveInteger),
    minFreeBytes: numberOption(values, "--min-free-gb", "20", parseGigabytes),
    roundTimeout: numberOption(values, "--round-timeout", "4h", parseDuration),
    poll: numberOption(values, "--poll", "30s", parseDuration),
  };
};

/** 引数を読む。`now` は終了時刻が過去でないことを確かめるのに使う。 */
export const parseOptions = (args: readonly string[], now: number): ParseResult => {
  try {
    return { ok: true, options: readOptions(readPairs(args), now) };
  } catch (error) {
    // 投げるのはこのファイルの TypeError だけで、文言の前に型の名前が付く。
    return { ok: false, error: String(error) };
  }
};
