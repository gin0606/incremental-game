import * as fc from "fast-check";
import { expect, test } from "vitest";

import { gameState } from "./game.arbitrary.ts";
import type { Action, GameState } from "./game.ts";
import {
  AUTO_BUYER_COST,
  FACTORY_UNLOCK_EARNED,
  advance,
  collectorCost,
  factoryCost,
  initialState,
  isFactoryUnlocked,
  perform,
  production,
} from "./game.ts";
import { add, atLeast, mul, num, toleranceFloor } from "./num.ts";

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
const counts = ({ collectors, factories, autoBuyer }: GameState): object => ({
  collectors,
  factories,
  autoBuyer,
});

test("初期状態はコイン 0、採集機 1 台で始まる", () => {
  expect(initialState).toStrictEqual({
    coins: num(0),
    totalEarned: num(0),
    collectors: 1,
    factories: 0,
    autoBuyer: false,
  });
});

test.each([
  { collectors: 3, factories: 2, expected: 23 },
  { collectors: 0, factories: 0, expected: 0 },
] as const)(
  "生産量は採集機 1 台につき毎秒 1、工場 1 つにつき毎秒 10（採集機 $collectors、工場 $factories）",
  ({ collectors, factories, expected }) => {
    expect(production(state({ collectors, factories }))).toBeApprox(num(expected));
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

test("採集機を買うと台数が増え、値段の分だけコインが減る", () => {
  const after = performed(state({ coins: num(25), collectors: 1 }), { type: "buyCollector" });

  expect(counts(after)).toStrictEqual({ collectors: 2, factories: 0, autoBuyer: false });
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

  expect(counts(after)).toStrictEqual({ collectors: 1, factories: 1, autoBuyer: false });
  expect(after.coins).toBeApprox(num(10));
});

test("自動購入は一度だけ買える", () => {
  const after = performed(state({ coins: add(AUTO_BUYER_COST, AUTO_BUYER_COST) }), {
    type: "buyAutoBuyer",
  });

  expect(counts(after)).toStrictEqual({ collectors: 1, factories: 0, autoBuyer: true });
  expect(after.coins).toBeApprox(num(300));
  expect(perform(after, { type: "buyAutoBuyer" })).toBeUndefined();
});

test("自動購入が無ければ、時間の経過でコインと累計の生産量が生産量 × 秒数だけ増える", () => {
  const after = advance(
    state({ coins: num(5), totalEarned: num(7), collectors: 2, factories: 1 }),
    3,
  );

  expect(after.coins).toBeApprox(num(5 + 36));
  expect(after.totalEarned).toBeApprox(num(7 + 36));
  expect(counts(after)).toStrictEqual({ collectors: 2, factories: 1, autoBuyer: false });
});

test("自動購入があれば、採集機の値段に達するたびに採集機を買う", () => {
  const start = state({ collectors: 1, autoBuyer: true });

  // 11.5 秒で 1 台目を買い、残り 0.5 秒は 2 台で生産する。値段に許容誤差（1e-9）の範囲で届いた時点で買うため、
  // 買う時刻は値段ちょうどに届く時刻よりわずかに早い。その分だけ比べる誤差を広げる。
  const first = advance(start, 12);
  expect(first.collectors).toBe(2);
  expect(first.coins).toBeApprox(num(1), 1e-6);
  expect(first.totalEarned).toBeApprox(num(12.5), 1e-6);

  // 2 台目の値段 13.225 に、さらに (13.225 - 1) / 2 秒で達する。
  const second = advance(first, (13.225 - 1) / 2 + 0.25);
  expect(second.collectors).toBe(3);
  expect(second.coins).toBeApprox(num(0.75), 1e-6);
});

test("自動購入があれば、工場の生産も合わせて採集機の値段に達する時刻に買う", () => {
  // 採集機 1 台と工場 1 つで毎秒 11。11.5 / 11 秒で 2 台目を買い、そこからは毎秒 12。
  const after = advance(state({ collectors: 1, factories: 1, autoBuyer: true }), 2);

  expect(after.collectors).toBe(2);
  expect(after.coins).toBeApprox(num((2 - 11.5 / 11) * 12), 1e-6);
});

test("値段に届く直前で区切っても、一度に進めたときと同じ時刻に買う", () => {
  // 区切りの時点のコインが値段の許容誤差の範囲に入っていても、買う時刻はずれない。
  const start = state({ collectors: 1, autoBuyer: true });
  const online = advance(advance(start, 11.5 - 1e-8), 6.6125 - 5e-9);
  const offline = advance(start, 11.5 - 1e-8 + (6.6125 - 5e-9));

  expect(counts(online)).toStrictEqual(counts(offline));
  expect(online.coins).toBeApprox(offline.coins, 1e-6);
});

test("自動購入の時刻が区切りの終わりとちょうど重なれば、その時刻に買う", () => {
  // 採集機 4 台で、コインが次の値段の許容誤差の境目にある。境目ちょうどでは丸め誤差で比べると届かない。
  const base = state({ collectors: 4, autoBuyer: true });
  const atFloor = { ...base, coins: toleranceFloor(collectorCost(base)) };

  expect(advance(atFloor, 0).collectors).toBe(5);
  expect(counts(advance(atFloor, 0))).toStrictEqual(counts(advance(atFloor, 1e-12)));
});

test("一度に進めて区切りの終わりが自動購入の時刻と重なっても、途中で区切ったときと同じく買う", () => {
  // 3.9087514315578256 秒は、採集機 9 台・0 コインから 10 台目の値段の許容誤差の境目に届く時刻。
  const start = state({ collectors: 9, autoBuyer: true });
  const once = advance(start, 3.9087514315578256);
  const split = advance(advance(start, 0.3), 3.9087514315578256 - 0.3);

  expect(once.collectors).toBe(10);
  expect(counts(once)).toStrictEqual(counts(split));
});

test("自動購入があれば、進め始める前に手元のコインで買えるだけ買ってから生産する", () => {
  // 100 コインで 2〜6 台目（11.5 + 13.225 + 15.21 + 17.49 + 20.11 = 77.54）を買い、6 台で 0.1 秒生産する。
  // 7 台目の値段 23.13 には届かない。
  const after = advance(state({ coins: num(100), totalEarned: num(100), autoBuyer: true }), 0.1);

  expect(after.collectors).toBe(6);
  expect(after.totalEarned).toBeApprox(num(100.6));
});

test("自動購入があっても、生産が無ければ何も買わない", () => {
  const start = state({ collectors: 0, autoBuyer: true });

  expect(advance(start, 1e6)).toStrictEqual(start);
});

test("経過時間 0 でも、自動購入があれば手元のコインで買えるだけ買う", () => {
  const after = advance(state({ coins: num(10 + 11.5 + 1), collectors: 0, autoBuyer: true }), 0);

  expect(after.collectors).toBe(2);
  expect(after.coins).toBeApprox(num(1));
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
