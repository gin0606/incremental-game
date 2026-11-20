import { expect, test } from "vitest";

import type { Num } from "../core/num.ts";
import { ZERO, add, atLeast, mul, num, pow, sub } from "../core/num.ts";
import type { Bot, CheckIn, PurchaseRule } from "./bot.ts";
import type { Model, Offer } from "./model.ts";
import { pick, seeded } from "./random.ts";
import type { Entry, Run, Settings } from "./simulate.ts";
import { simulate } from "./simulate.ts";

/**
 * 手で追える小さなゲーム。生成器 gen は 1 台ごとに毎秒 1 を生み、値段は 10 × 2^(台数 − 1)。up は値段 4 で
 * 生産量を変えない購入。big は累計の生産が `unlockAt` に達すると（`afterUp` なら、さらに up を買うと）解放され、
 * 値段 50 × 2^台数 で 1 台ごとに毎秒 10 を生む。
 */
interface Toy {
  readonly coins: Num;
  readonly earned: Num;
  readonly gens: number;
  readonly bigs: number;
  readonly upgraded: boolean;
}

const toyGame = ({
  gens = 1,
  unlockAt = 20,
  afterUp = false,
}: {
  readonly gens?: number;
  readonly unlockAt?: number;
  readonly afterUp?: boolean;
} = {}): Model<Toy> => {
  const genCost = (state: Toy): Num => mul(num(10), pow(num(2), state.gens - 1));
  const bigUnlocked = (state: Toy): boolean =>
    atLeast(state.earned, num(unlockAt), 0) && (state.upgraded || !afterUp);
  const offers = (state: Toy): readonly Offer[] => [
    { id: "gen", cost: genCost(state), rateGain: num(1) },
    ...(state.upgraded ? [] : [{ id: "up", cost: num(4), rateGain: ZERO }]),
    ...(bigUnlocked(state)
      ? [{ id: "big", cost: mul(num(50), pow(num(2), state.bigs)), rateGain: num(10) }]
      : []),
  ];
  const receive: Readonly<Record<string, (state: Toy) => Toy>> = {
    gen: (state) => ({ ...state, gens: state.gens + 1 }),
    up: (state) => ({ ...state, upgraded: true }),
    big: (state) => ({ ...state, bigs: state.bigs + 1 }),
  };
  return {
    initial: { coins: ZERO, earned: ZERO, gens, bigs: 0, upgraded: false },
    advance: (state, seconds) => {
      const produced = num((state.gens + 10 * state.bigs) * seconds);
      return { ...state, coins: add(state.coins, produced), earned: add(state.earned, produced) };
    },
    offers,
    buy: (state, id) => {
      const offer = offers(state).find((candidate) => candidate.id === id);
      const next = receive[id];
      return offer === undefined || next === undefined || !atLeast(state.coins, offer.cost, 0)
        ? undefined
        : { ...next(state), coins: sub(state.coins, offer.cost) };
    },
    resource: (state) => state.coins,
    rate: (state) => num(state.gens + 10 * state.bigs),
    unlocked: (state) => ["gen", "up", ...(bigUnlocked(state) ? ["big"] : [])],
  };
};

const bot = (purchase: PurchaseRule, checkIn?: CheckIn): Bot => ({
  purchase,
  checkIn: checkIn ?? { kind: "always" },
  prestige: "never",
});

const settings = (overrides: Partial<Settings>): Settings => ({
  duration: 30,
  step: 100,
  sampleEvery: 100,
  seed: 1,
  ...overrides,
});

/** 比べやすい形の時系列。 */
const plain = (timeline: readonly Entry[]): readonly unknown[] =>
  timeline.map(({ resource, rate, ...rest }) => ({
    ...rest,
    resource: Number(resource.mag.toPrecision(12)) * resource.sign,
    rate: Number(rate.mag.toPrecision(12)) * rate.sign,
  }));

test("常に開いているボットは、狙う候補と生産量で測れない候補を買える時刻に買う", () => {
  const run = simulate(toyGame(), bot("cheapest"), settings({}));

  expect(plain(run.timeline)).toStrictEqual([
    { kind: "unlock", id: "gen", t: 0, resource: 0, rate: 1 },
    { kind: "unlock", id: "up", t: 0, resource: 0, rate: 1 },
    { kind: "sample", t: 0, resource: 0, rate: 1 },
    { kind: "purchase", id: "up", t: 4, resource: 0, rate: 1 },
    { kind: "purchase", id: "gen", t: 14, resource: 0, rate: 2 },
    // 刻み幅 100 で t = 14 から 24 まで待つ間に、big が解放された t = 17 を見つける。
    { kind: "unlock", id: "big", t: 17, resource: 6, rate: 2 },
    { kind: "purchase", id: "gen", t: 24, resource: 0, rate: 3 },
    { kind: "sample", t: 30, resource: 18, rate: 3 },
  ]);
  expect(run.final).toStrictEqual({
    coins: num(18),
    earned: num(14 + 20 + 18),
    gens: 3,
    bigs: 0,
    upgraded: true,
  });
  expect(run.bot).toStrictEqual(bot("cheapest"));
  expect(run.settings).toStrictEqual(settings({}));
});

test("待つ間に要素が解放されたら、解放された時刻に狙う候補を選び直す", () => {
  const run = simulate(
    toyGame({ gens: 4 }),
    bot("newest"),
    settings({ duration: 14, sampleEvery: 10 }),
  );

  expect(plain(run.timeline)).toStrictEqual([
    { kind: "unlock", id: "gen", t: 0, resource: 0, rate: 4 },
    { kind: "unlock", id: "up", t: 0, resource: 0, rate: 4 },
    { kind: "sample", t: 0, resource: 0, rate: 4 },
    { kind: "purchase", id: "up", t: 1, resource: 0, rate: 4 },
    // gen（値段 80）を t = 21 まで待つ間に、big が解放される。
    { kind: "unlock", id: "big", t: 5, resource: 16, rate: 4 },
    { kind: "sample", t: 10, resource: 36, rate: 4 },
    { kind: "purchase", id: "big", t: 13.5, resource: 0, rate: 14 },
    { kind: "sample", t: 14, resource: 7, rate: 14 },
  ]);
});

/** `model` と、それを進めた秒数の一覧。 */
const recording = <S>(
  model: Model<S>,
): { readonly model: Model<S>; readonly advanced: readonly number[] } => {
  const advanced: number[] = [];
  const advance = (state: S, seconds: number): S => {
    advanced.push(seconds);
    return model.advance(state, seconds);
  };
  return { model: { ...model, advance }, advanced };
};

test("購入で解放された要素は、その購入の直後に記録する", () => {
  const { model, advanced } = recording(toyGame({ unlockAt: 0, afterUp: true }));
  const run = simulate(
    model,
    bot("cheapest", { kind: "every", seconds: 10 }),
    settings({ duration: 15 }),
  );

  expect(plain(run.timeline.slice(3))).toStrictEqual([
    { kind: "checkIn", t: 0, resource: 0, rate: 1 },
    { kind: "checkIn", t: 10, resource: 10, rate: 1 },
    { kind: "purchase", id: "up", t: 10, resource: 6, rate: 1 },
    { kind: "unlock", id: "big", t: 10, resource: 6, rate: 1 },
    { kind: "sample", t: 15, resource: 11, rate: 1 },
  ]);
  // 解放は購入の直後に見つけるので、t = 10 からの区間で解放の時刻を探さない。
  expect(advanced).toStrictEqual([10, 5]);
});

/** big を最初から解放し、何も買わせない toy。 */
const refusingToy = (): Model<Toy> => {
  const toy = toyGame({ unlockAt: 0 });
  // up を買えないので、upgraded は偽のままで、何も買わせない。
  return { ...toy, buy: (state, id) => (state.upgraded ? toy.buy(state, id) : undefined) };
};

test("買える額に達しても買わせないモデルでは、狙う候補と生産量で測れない候補だけを待ち、後は刻み幅で進む", () => {
  const { model, advanced } = recording(refusingToy());
  const run = simulate(model, bot("newest"), settings({ duration: 60, step: 7 }));

  // newest は big（値段 50）を狙い、up（値段 4）とともに買える額に達するまで待つ。gen（値段 10）は待たない。
  // 買える額に達しても買えないので、その後は刻み幅で進む。
  expect(advanced).toStrictEqual([4, 7, 7, 7, 7, 7, 7, 4, 7, 3]);
  expect(run.timeline.at(-1)?.t).toBe(60);
});

test("終わりの時刻と丸め誤差だけ違う予定は、終わりの時刻とみなす", () => {
  // 4.1 × 3 は 12.299999999999999 になる。
  const run = simulate(
    toyGame(),
    bot("cheapest", { kind: "every", seconds: 4.1 }),
    settings({ duration: 12.3, sampleEvery: 4.1 }),
  );

  const times = (kind: Entry["kind"]): readonly number[] =>
    run.timeline.filter((entry) => entry.kind === kind).map((entry) => entry.t);

  expect(times("checkIn")).toStrictEqual([0, 4.1, 8.2]);
  expect(times("sample")).toStrictEqual([0, 4.1, 8.2, 12.3]);
  expect(run.timeline.at(-1)?.t).toBe(12.3);
});

test("間隔を置いて開くボットは、刻み幅ごとに進んでも、開く時刻にだけ開いて買う", () => {
  const run = simulate(
    toyGame(),
    bot("efficiency", { kind: "every", seconds: 10 }),
    settings({ duration: 25, step: 3 }),
  );

  expect(plain(run.timeline)).toStrictEqual([
    { kind: "unlock", id: "gen", t: 0, resource: 0, rate: 1 },
    { kind: "unlock", id: "up", t: 0, resource: 0, rate: 1 },
    { kind: "sample", t: 0, resource: 0, rate: 1 },
    { kind: "checkIn", t: 0, resource: 0, rate: 1 },
    { kind: "checkIn", t: 10, resource: 10, rate: 1 },
    { kind: "purchase", id: "up", t: 10, resource: 6, rate: 1 },
    { kind: "unlock", id: "big", t: 20, resource: 16, rate: 1 },
    { kind: "checkIn", t: 20, resource: 16, rate: 1 },
    // efficiency: gen は 10/1 + 10/1 = 20、big は 50/10 + 50/1 = 55。
    { kind: "purchase", id: "gen", t: 20, resource: 6, rate: 2 },
    { kind: "sample", t: 25, resource: 16, rate: 2 },
  ]);
});

test("ゲームを開いたときは、買えるものを買えるだけ買う", () => {
  const run = simulate(
    toyGame({ unlockAt: 1000 }),
    bot("cheapest", { kind: "every", seconds: 100 }),
    settings({ duration: 101 }),
  );

  // t = 100 に 100 を持ち、up（4）と gen（10、20、40）を買って 26 残る。
  expect(generatorsBought(run.timeline)).toStrictEqual(["gen", "gen", "gen"]);
  expect(plain(run.timeline.filter((entry) => entry.kind === "purchase")).at(-1)).toStrictEqual({
    kind: "purchase",
    id: "gen",
    t: 100,
    resource: 26,
    rate: 4,
  });
});

test("記録の間隔ごとに記録する", () => {
  const run = simulate(
    toyGame({ gens: 0 }),
    bot("cheapest"),
    settings({ sampleEvery: 10, step: 7 }),
  );

  expect(plain(run.timeline.filter((entry) => entry.kind === "sample"))).toStrictEqual(
    [0, 10, 20, 30].map((t) => ({ kind: "sample", t, resource: 0, rate: 0 })),
  );
});

test("生産量が 0 のままなら何も買わずに終わりまで進む", () => {
  const run = simulate(toyGame({ gens: 0 }), bot("efficiency"), settings({ duration: 1000 }));

  expect(run.timeline.filter((entry) => entry.kind === "purchase")).toStrictEqual([]);
  expect(run.timeline.at(-1)?.t).toBe(1000);
});

test("遊ぶ時間が 0 なら、最初の解放と記録だけを残して行動しない", () => {
  const run = simulate(
    toyGame(),
    bot("cheapest", { kind: "every", seconds: 10 }),
    settings({ duration: 0 }),
  );

  expect(plain(run.timeline)).toStrictEqual([
    { kind: "unlock", id: "gen", t: 0, resource: 0, rate: 1 },
    { kind: "unlock", id: "up", t: 0, resource: 0, rate: 1 },
    { kind: "sample", t: 0, resource: 0, rate: 1 },
  ]);
});

/** 生産量で効果を測れない up を除いて、買った候補の名前。 */
const generatorsBought = (timeline: readonly Entry[]): readonly string[] =>
  timeline.flatMap((entry) => (entry.kind === "purchase" && entry.id !== "up" ? [entry.id] : []));

const randomRun = (seed: number): Run<Toy> =>
  simulate(toyGame({ unlockAt: 0 }), bot("random"), settings({ duration: 2000, seed }));

test("random は選んだ候補を買ってから次を選ぶ", () => {
  const bought = generatorsBought(randomRun(5).timeline);

  const expected: string[] = [];
  let rng = seeded(5);
  for (const _ of bought) {
    const picked = pick(rng, ["gen", "big"]);
    expected.push(picked.item);
    ({ rng } = picked);
  }
  expect(bought.length).toBeGreaterThan(3);
  expect(new Set(bought)).toStrictEqual(new Set(["gen", "big"]));
  expect(bought).toStrictEqual(expected);
});

test("同じ入力からは同じ結果になり、random はシードで買うものが変わる", () => {
  expect(randomRun(3)).toStrictEqual(randomRun(3));
  expect(generatorsBought(randomRun(3).timeline)).not.toStrictEqual(
    generatorsBought(randomRun(4).timeline),
  );
});
