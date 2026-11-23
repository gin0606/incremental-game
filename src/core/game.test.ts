import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { gameState } from "./game.arbitrary.ts";
import type { Action, GameState } from "./game.ts";
import {
  AUTO_BUYER_COST,
  FACTORY_UNLOCK_EARNED,
  MINT_UNLOCK_EARNED,
  UPGRADE_UNLOCK_EARNED,
  advance,
  collectorCost,
  factoryCost,
  initialState,
  isFactoryUnlocked,
  mintCost,
  perform,
  priceOf,
  production,
  upgradeCost,
  withPurchase,
} from "./game.ts";
import { add, atLeast, mul, num } from "./num.ts";

// 1 件の時間切れを広げる。自動購入が採集機・工場・造幣所・精錬所・交易所・改良・採集機の改修・工場の連携を買うため、一度に進める結果と刻んで進める結果を比べる性質テストは
// 手元で約 2 秒かかり（2026-11 に測定）、ほかの処理で機械が混み合うと Vitest の既定の 5 秒を超えた。時間切れは遅く
// なった実装を検出するためのものではない。
vi.setConfig({ testTimeout: 120_000 });

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 実行できるはずの行動を実行する。実行できなければテストを失敗させる。 */
const performed = (before: GameState, action: Action): GameState => {
  const after = perform(before, action);
  if (after === undefined) {
    throw new Error(`${action.type} を実行できなかった`);
  }
  return after;
};

/** 数を除いた部分（台数など）。 */
const counts = (game: GameState): object => {
  const { coins: _coins, totalEarned: _earned, cautiousAutoBuyer: _cautious, ...rest } = game;
  return rest;
};

test("初期状態はコイン 0、採集機 1 台で始まる", () => {
  expect(initialState).toStrictEqual({
    coins: num(0),
    totalEarned: num(0),
    collectors: 1,
    factories: 0,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    factoryLinks: 0,
    autoBuyer: false,
    cautiousAutoBuyer: false,
  });
});

test.each([
  { collectors: 3, factories: 2, mints: 0, refineries: 0, upgrades: 0, expected: 23 },
  { collectors: 3, factories: 2, mints: 4, refineries: 0, upgrades: 0, expected: 143 },
  { collectors: 3, factories: 2, mints: 4, refineries: 5, upgrades: 0, expected: 643 },
  { collectors: 0, factories: 0, mints: 0, refineries: 2, upgrades: 0, expected: 200 },
  { collectors: 0, factories: 0, mints: 0, refineries: 0, upgrades: 0, expected: 0 },
  { collectors: 3, factories: 2, mints: 4, refineries: 0, upgrades: 1, expected: 143 * 1.25 },
  { collectors: 3, factories: 2, mints: 4, refineries: 5, upgrades: 3, expected: 643 * 1.25 ** 3 },
  { collectors: 0, factories: 0, mints: 0, refineries: 0, upgrades: 3, expected: 0 },
] as const)(
  "生産量は採集機 1 台につき毎秒 1、工場 1 つにつき毎秒 10、造幣所 1 つにつき毎秒 30、精錬所 1 つにつき毎秒 100 の和で、改良 1 つごとに 1.25 倍（採集機 $collectors、工場 $factories、造幣所 $mints、精錬所 $refineries、改良 $upgrades）",
  ({ collectors, factories, mints, refineries, upgrades, expected }) => {
    expect(production(state({ collectors, factories, mints, refineries, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { collectors: 0, expected: 10 },
  { collectors: 1, expected: 11.5 },
  { collectors: 10, expected: 10 * 1.15 ** 10 },
] as const)("採集機の値段は 10 × 1.15^台数（$collectors 台）", ({ collectors, expected }) => {
  expect(collectorCost(state({ collectors }))).toBeApprox(num(expected));
});

test.each([
  { factories: 0, expected: 150 },
  { factories: 1, expected: 180 },
  { factories: 5, expected: 150 * 1.2 ** 5 },
] as const)("工場の値段は 150 × 1.2^数（$factories）", ({ factories, expected }) => {
  expect(factoryCost(state({ factories }))).toBeApprox(num(expected));
});

test.each([
  { mints: 0, expected: 1e7 },
  { mints: 1, expected: 1.1e7 },
  { mints: 8, expected: 1e7 * 1.1 ** 8 },
] as const)("造幣所の値段は 1e7 × 1.1^数（$mints）", ({ mints, expected }) => {
  expect(mintCost(state({ mints }))).toBeApprox(num(expected));
});

test("priceOf は買えるものの値段を、解放されていないものと買い終えたものには undefined を返す", () => {
  const locked = state({ collectors: 2, factories: 1 });
  const unlocked = state({ collectors: 2, factories: 1, totalEarned: FACTORY_UNLOCK_EARNED });

  expect(priceOf(locked, { type: "buyCollector" })).toBeApprox(collectorCost(locked));
  expect(priceOf(locked, { type: "buyFactory" })).toBeUndefined();
  expect(priceOf(unlocked, { type: "buyFactory" })).toBeApprox(factoryCost(unlocked));
  expect(priceOf(unlocked, { type: "buyMint" })).toBeUndefined();
  const mintUnlocked = state({ mints: 3, totalEarned: MINT_UNLOCK_EARNED });
  expect(priceOf(mintUnlocked, { type: "buyMint" })).toBeApprox(mintCost(mintUnlocked));
  expect(priceOf(unlocked, { type: "buyUpgrade" })).toBeUndefined();
  const upgradeUnlocked = state({ upgrades: 2, totalEarned: UPGRADE_UNLOCK_EARNED });
  expect(priceOf(upgradeUnlocked, { type: "buyUpgrade" })).toBeApprox(upgradeCost(upgradeUnlocked));
  expect(priceOf(locked, { type: "buyAutoBuyer" })).toBeApprox(AUTO_BUYER_COST);
  expect(priceOf(state({ autoBuyer: true }), { type: "buyAutoBuyer" })).toBeUndefined();
});

test("withPurchase は値段を払わずに買ったものを足す", () => {
  const before = state({ coins: num(5), collectors: 2, factories: 1 });

  expect(withPurchase(before, { type: "buyCollector" })).toStrictEqual({
    ...before,
    collectors: 3,
  });
  expect(withPurchase(before, { type: "buyFactory" })).toStrictEqual({ ...before, factories: 2 });
  expect(withPurchase(before, { type: "buyMint" })).toStrictEqual({ ...before, mints: 1 });
  expect(withPurchase(before, { type: "buyUpgrade" })).toStrictEqual({ ...before, upgrades: 1 });
  expect(withPurchase(before, { type: "buyAutoBuyer" })).toStrictEqual({
    ...before,
    autoBuyer: true,
  });
});

test("採集機を買うと台数が増え、値段の分だけコインが減る", () => {
  const after = performed(state({ coins: num(25), collectors: 1 }), { type: "buyCollector" });

  expect(counts(after)).toStrictEqual({
    collectors: 2,
    factories: 0,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    factoryLinks: 0,
    autoBuyer: false,
  });
  expect(after.coins).toBeApprox(num(25 - 11.5));
});

test("買える額に達していなければ買えない", () => {
  expect(
    perform(state({ coins: num(9.99), collectors: 0 }), { type: "buyCollector" }),
  ).toBeUndefined();
});

test("誤差で値段をわずかに下回るだけなら買え、コインは 0 になる", () => {
  const coins = mul(num(1 - 1e-12), collectorCost(state({ collectors: 10 })));
  const after = performed(state({ coins, collectors: 10 }), { type: "buyCollector" });

  expect(after.collectors).toBe(11);
  expect(after.coins).toStrictEqual(num(0));
});

test("工場は累計の生産量が 100 に達するまで解放されず、買えない", () => {
  const locked = state({ coins: num(1000), totalEarned: num(99.9) });

  expect(isFactoryUnlocked(locked)).toBe(false);
  expect(perform(locked, { type: "buyFactory" })).toBeUndefined();
});

test("工場は累計の生産量が 100 に達すると解放され、買える", () => {
  const unlocked = state({ coins: num(160), totalEarned: FACTORY_UNLOCK_EARNED });

  expect(isFactoryUnlocked(unlocked)).toBe(true);
  const after = performed(unlocked, { type: "buyFactory" });

  expect(counts(after)).toStrictEqual({
    collectors: 1,
    factories: 1,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    factoryLinks: 0,
    autoBuyer: false,
  });
  expect(after.coins).toBeApprox(num(10));
});

test("自動購入は一度だけ買える", () => {
  const after = performed(state({ coins: add(AUTO_BUYER_COST, AUTO_BUYER_COST) }), {
    type: "buyAutoBuyer",
  });

  expect(counts(after)).toStrictEqual({
    collectors: 1,
    factories: 0,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    factoryLinks: 0,
    autoBuyer: true,
  });
  expect(after.coins).toBeApprox(AUTO_BUYER_COST);
  expect(perform(after, { type: "buyAutoBuyer" })).toBeUndefined();
});

test("自動購入が無ければ、時間の経過でコインと累計の生産量が生産量 × 秒数だけ増える", () => {
  const after = advance(
    state({ coins: num(5), totalEarned: num(7), collectors: 2, factories: 1 }),
    3,
  );

  expect(after.coins).toBeApprox(num(5 + 36));
  expect(after.totalEarned).toBeApprox(num(7 + 36));
  expect(counts(after)).toStrictEqual({
    collectors: 2,
    factories: 1,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    factoryLinks: 0,
    autoBuyer: false,
  });
});

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("経過時間 %s は RangeError", (seconds) => {
  expect(() => advance(initialState, seconds)).toThrow(
    new RangeError(`経過時間は 0 以上の有限の秒数で渡す: ${seconds}`),
  );
});

test("オフラインで一度に進めた結果は、同じ時間を細かく刻んで進めた結果と一致する", () => {
  // double だけでは指数がほぼ一様になり、刻みの多くが極端に短くなる。区間の途中で購入が起きるよう、秒単位の
  // 刻みも混ぜ、2 つ以上に区切る。
  const steps = fc.array(
    fc.oneof(fc.double({ min: 0, max: 1e5, noNaN: true }), fc.integer({ min: 0, max: 3600 })),
    { minLength: 2, maxLength: 20 },
  );
  fc.assert(
    fc.property(gameState, steps, (start, pieces: readonly number[]) => {
      const online = pieces.reduce((current, seconds) => advance(current, seconds), start);
      const offline = advance(
        start,
        pieces.reduce((sum, seconds) => sum + seconds, 0),
      );

      expect(counts(offline)).toStrictEqual(counts(online));
      expect(offline.totalEarned).toBeApprox(online.totalEarned, 1e-6);
      // 手元のコインは購入の直後に 0 近くまで減り、相対誤差では比べられない。誤差の大きさの目安になる
      // 累計の生産量を足して比べる。
      expect(add(offline.coins, online.totalEarned)).toBeApprox(
        add(online.coins, online.totalEarned),
        1e-6,
      );
    }),
  );
});

test("進めた間の生産量は、進める前の生産の速さ以上、進めた後の生産の速さ以下", () => {
  // 生産の速さは購入でしか変わらず、購入で下がらない。一度に進めても刻んで進めても同じだけ誤る誤り（存在しない
  // 時間の分を生産するなど）は、オンラインとオフラインの一致では見つからないため、生産量の範囲で確かめる。
  fc.assert(
    fc.property(
      gameState,
      fc.oneof(fc.double({ min: 0, max: 1e5, noNaN: true }), fc.integer({ min: 0, max: 3600 })),
      (start, seconds) => {
        const after = advance(start, seconds);
        // 差を取ると桁落ちするため、累計どうしで比べる。
        const lower = add(start.totalEarned, mul(production(start), num(seconds)));
        const upper = add(start.totalEarned, mul(production(after), num(seconds)));

        expect(atLeast(after.totalEarned, lower, 1e-9)).toBe(true);
        expect(atLeast(upper, after.totalEarned, 1e-9)).toBe(true);
      },
    ),
  );
});
