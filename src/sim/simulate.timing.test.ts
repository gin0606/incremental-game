import { expect, test } from "vitest";

import type { Num } from "../core/num.ts";
import { add, atLeast, num, sub, toNumber } from "../core/num.ts";
import type { Bot, CheckIn, PurchaseRule } from "./bot.ts";
import type { Model } from "./model.ts";
import { pick, seeded } from "./random.ts";
import type { Entry, Settings } from "./simulate.ts";
import { simulate } from "./simulate.ts";

interface Boost {
  readonly coins: Num;
  readonly elapsed: number;
  readonly owned: boolean;
}

/** 生産が毎秒 1 で、10 秒で購入なしに毎秒 11 に上がるゲーム。x は値段 32 で一度だけ買える。 */
const boostGame: Model<Boost> = {
  initial: { coins: num(0), elapsed: 0, owned: false },
  advance: (state, seconds) => {
    const end = state.elapsed + seconds;
    const slow = Math.max(0, Math.min(end, 10) - state.elapsed);
    const produced = slow + 11 * (seconds - slow);
    return { ...state, coins: add(state.coins, num(produced)), elapsed: end };
  },
  offers: (state) => (state.owned ? [] : [{ id: "x", cost: num(32), rateGain: num(1) }]),
  buy: (state, id) =>
    id === "x" && !state.owned && atLeast(state.coins, num(32), 0)
      ? { ...state, coins: sub(state.coins, num(32)), owned: true }
      : undefined,
  resource: (state) => state.coins,
  rate: (state) => num(state.elapsed < 10 ? 1 : 11),
  unlocked: () => ["x"],
};

interface Late {
  readonly coins: Num;
  readonly elapsed: number;
  readonly owned: boolean;
}

const LATE_AT = 1e6;

/**
 * 時刻 1e6 秒に、生産（毎秒 1000）と値段 1e-8 の y が解放されるゲーム。y を買える額に達するまでの見積もりは 1e-11 秒で、
 * 時刻 1e6 に足しても時刻が変わらない。
 */
const lateGame: Model<Late> = {
  initial: { coins: num(0), elapsed: 0, owned: false },
  advance: (state, seconds) => {
    const end = state.elapsed + seconds;
    const producing = Math.max(0, end - Math.max(state.elapsed, LATE_AT));
    return { coins: add(state.coins, num(1000 * producing)), elapsed: end, owned: state.owned };
  },
  offers: (state) =>
    state.elapsed < LATE_AT || state.owned ? [] : [{ id: "y", cost: num(1e-8), rateGain: num(1) }],
  buy: (state, id) =>
    id === "y" && state.elapsed >= LATE_AT && !state.owned && atLeast(state.coins, num(1e-8), 0)
      ? { ...state, coins: sub(state.coins, num(1e-8)), owned: true }
      : undefined,
  resource: (state) => state.coins,
  rate: (state) => num(state.elapsed < LATE_AT ? 0 : 1000),
  unlocked: (state) => (state.elapsed < LATE_AT ? [] : ["y"]),
};

const bot = (checkIn: CheckIn, purchase: PurchaseRule = "cheapest"): Bot => ({
  purchase,
  checkIn,
  prestige: "never",
});

const timesOf = (timeline: readonly Entry[], kind: Entry["kind"]): readonly number[] =>
  timeline.filter((entry) => entry.kind === kind).map((entry) => entry.t);

const settings = (overrides: Partial<Settings>): Settings => ({
  duration: 60,
  step: 1,
  sampleEvery: 1000,
  seed: 1,
  ...overrides,
});

test.each([1, 60])(
  "生産量が購入なしに上がっても、買える額に達した時刻に買う（刻み幅 %d 秒）",
  (step) => {
    // 毎秒 1 のままなら t = 32 だが、t = 10 から毎秒 11 になり、t = 12 に 32 に達する。
    const [purchase, ...rest] = timesOf(
      simulate(boostGame, bot({ kind: "always" }), settings({ step })).timeline,
      "purchase",
    );

    expect(purchase).toBeCloseTo(12, 9);
    expect(rest).toStrictEqual([]);
  },
);

test("終わりの時刻より本当に手前の予定は、終わりの時刻とみなさない", () => {
  const { timeline } = simulate(
    boostGame,
    bot({ kind: "every", seconds: 1000 }),
    settings({ duration: 1000.0000001, step: 1000 }),
  );

  expect(timesOf(timeline, "checkIn")).toStrictEqual([0, 1000]);
  expect(timesOf(timeline, "purchase")).toStrictEqual([1000]);
  expect(timesOf(timeline, "sample")).toStrictEqual([0, 1000, 1000.0000001]);
});

test("買える額に達するまでの見積もりが時刻の精度より短くても、時刻を進めて買う", () => {
  const purchases = [1000, 100_000].map((step) =>
    timesOf(
      simulate(
        lateGame,
        bot({ kind: "always" }),
        settings({ duration: LATE_AT + 10, step, sampleEvery: LATE_AT * 2 }),
      ).timeline,
      "purchase",
    ),
  );

  const [[purchase] = []] = purchases;
  expect(purchase).toBeGreaterThan(LATE_AT);
  expect(purchase).toBeLessThan(LATE_AT + 1e-6);
  expect(purchases).toStrictEqual([[purchase], [purchase]]);
});

/** `from` より後、`to` より前の出来事の種類と時刻。 */
const eventsBetween = (
  timeline: readonly Entry[],
  from: number,
  to: number,
): readonly (readonly [Entry["kind"], number])[] =>
  timeline.filter(({ t }) => t > from && t < to).map(({ kind, t }) => [kind, t] as const);

test("丸め誤差だけ違う記録とチェックインは、同じ時刻に記録、チェックインの順で扱う", () => {
  // 4.1 × 3 は 12.299999999999999 になり、記録の 12.3 × 1 より手前になる。
  const { timeline } = simulate(
    boostGame,
    bot({ kind: "every", seconds: 4.1 }),
    settings({ duration: 20, sampleEvery: 12.3 }),
  );

  expect(eventsBetween(timeline, 12, 13)).toStrictEqual([
    ["sample", 12.3],
    ["checkIn", 12.3],
    ["purchase", 12.3],
  ]);
});

test("予定をそろえても、終わりの時刻を超えない", () => {
  // 終わりと 3 回目のチェックインは 4.1 × 3 = 12.299999999999999 で、記録の 12.3 がその丸め誤差の範囲に並ぶ。
  const duration = 4.1 * 3;
  const { timeline } = simulate(
    boostGame,
    bot({ kind: "every", seconds: 4.1 }),
    settings({ duration, step: 100, sampleEvery: 12.3 }),
  );

  expect(timeline.at(-1)?.t).toBe(duration);
  expect(timeline.filter(({ t }) => t > duration)).toStrictEqual([]);
});

/** boostGame の解放を、時刻 1 秒に要素 u が解放されるように変えたゲーム。1 秒までに x は買えない。 */
const unlockGame: Model<Boost> = {
  ...boostGame,
  unlocked: (state) => (state.elapsed < 1 ? [] : ["u"]),
};

test("終わりの時刻とそろえたチェックインは、その時刻に新しい要素が解放されて止まっても開かない", () => {
  // 2 回目のチェックインの 1 秒は、終わりの 1 + 2^-50 秒とそろえて扱う。u の解放で 1 秒に止まる。
  const { timeline } = simulate(
    unlockGame,
    bot({ kind: "every", seconds: 1 }),
    settings({ duration: 1 + 2 ** -50, step: 2 }),
  );

  expect(timeline.map(({ kind, t }) => [kind, t])).toStrictEqual([
    ["sample", 0],
    ["checkIn", 0],
    ["unlock", 1],
    ["sample", 1 + 2 ** -50],
  ]);
});

test.each([{ kind: "always" }, { kind: "every", seconds: 1000 }] as const)(
  "終わりの時刻とそろえた記録は、その時刻に新しい要素が解放されて止まっても早めない（$kind）",
  (checkIn) => {
    // 2 回目の記録の 1 秒は、終わりの 1 + 2^-50 秒とそろえて扱う。u の解放で 1 秒に止まる。
    const { timeline } = simulate(
      unlockGame,
      bot(checkIn),
      settings({ duration: 1 + 2 ** -50, step: 2, sampleEvery: 1 }),
    );

    expect(timesOf(timeline, "unlock")).toStrictEqual([1]);
    expect(timesOf(timeline, "sample")).toStrictEqual([0, 1 + 2 ** -50]);
  },
);

/** advance を呼んだ回数を資源にするゲーム。時刻を何回に分けて進めたかが分かる。 */
const countGame: Model<Boost> = {
  ...boostGame,
  advance: (state) => ({ ...state, coins: add(state.coins, num(1)) }),
  rate: () => num(0),
};

/** countGame を 4.1 秒ごとに開くボットで遊ばせ、時刻を何回に分けて進めたか。 */
const stops = (step: number): number | undefined =>
  simulate(
    countGame,
    bot({ kind: "every", seconds: 4.1 }),
    settings({ duration: 20, step, sampleEvery: 12.3 }),
  )
    .timeline.filter((entry) => entry.kind === "sample")
    .map((entry) => toNumber(entry.resource))
    .at(-1);

test("刻み幅の区切りが最も早い予定と同じ時刻なら、そこで止まらずにそろえた時刻まで進む", () => {
  // 4.1 × 2 + 4.1 は 3 回目のチェックインの 4.1 × 3 = 12.299999999999999 と同じで、記録の 12.3 とそろえる。
  expect(stops(4.1)).toBe(stops(100));
  expect(stops(100)).toBe(5);
});

test.each([0.02, 60])(
  "終わりの時刻と丸め誤差だけ違うチェックインは、刻み幅によらず開かない（刻み幅 %d 秒）",
  (step) => {
    // 2.4 × 12 は 28.799999999999997 で、終わりの 28.8 の丸め誤差の範囲に並ぶ。刻み幅 0.02 秒の区切りを積み重ねた
    // 時刻はその少し手前に来る。
    const { timeline } = simulate(
      boostGame,
      bot({ kind: "every", seconds: 2.4 }),
      settings({ duration: 28.8, step }),
    );

    expect(timesOf(timeline, "checkIn").at(-1)).toBe(26.4);
    expect(timeline.at(-1)?.t).toBe(28.8);
  },
);

test("予定が終わりの時刻とちょうど許容誤差だけ違えば、終わりの時刻とみなす", () => {
  // 1 と 1 + 2^-49 の差は、1 × 8 × Number.EPSILON に等しい。
  const { timeline } = simulate(
    boostGame,
    bot({ kind: "every", seconds: 1 }),
    settings({ duration: 1 + 2 ** -49 }),
  );

  expect(timesOf(timeline, "checkIn")).toStrictEqual([0]);
  expect(timeline.at(-1)?.t).toBe(1 + 2 ** -49);
});

interface Raced {
  readonly coins: Num;
  readonly a: number;
  readonly b: number;
}

const racedCost = (owned: number): Num => num(10 * 2 ** owned);

/**
 * 生成器 a と b がある（値段は 10 × 2^台数、どちらも 1 台ごとに毎秒 1 を生む）。a は advance の中で、買える額に
 * 達し次第ゲームが自動で買う。
 */
const racedGame: Model<Raced> = {
  initial: { coins: num(0), a: 0, b: 0 },
  advance: function advance(state, seconds): Raced {
    const rate = 1 + state.a + state.b;
    const wait = toNumber(sub(racedCost(state.a), state.coins)) / rate;
    return wait > seconds
      ? { ...state, coins: add(state.coins, num(rate * seconds)) }
      : advance({ ...state, coins: num(0), a: state.a + 1 }, seconds - wait);
  },
  offers: (state) => [
    { id: "a", cost: racedCost(state.a), rateGain: num(1) },
    { id: "b", cost: racedCost(state.b), rateGain: num(1) },
  ],
  buy: (state, id) => {
    const after = id === "a" ? { ...state, a: state.a + 1 } : { ...state, b: state.b + 1 };
    const cost = racedCost(id === "a" ? state.a : state.b);
    return atLeast(state.coins, cost, 0) ? { ...after, coins: sub(state.coins, cost) } : undefined;
  },
  resource: (state) => state.coins,
  rate: (state) => num(1 + state.a + state.b),
  unlocked: () => ["a", "b"],
};

test("random は、選んだ候補をゲームが先に自動で買ったら選び直す", () => {
  // シード 7 の最初の選択は a。a を選んだまま待ち続けると、自動購入が先に a を買い続け、ボットは何も買えない。
  expect(pick(seeded(7), racedGame.offers(racedGame.initial)).item.id).toBe("a");
  const { timeline } = simulate(racedGame, bot({ kind: "always" }, "random"), {
    ...settings({ duration: 3600, step: 60 }),
    seed: 7,
  });

  expect(timesOf(timeline, "purchase").length).toBeGreaterThan(0);
});
