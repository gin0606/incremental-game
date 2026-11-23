import * as fc from "fast-check";
import { expect, test } from "vitest";

import { gameState } from "../core/game.arbitrary.ts";
import type { GameState } from "../core/game.ts";
import { initialState } from "../core/game.ts";
import type { Num } from "../core/num.ts";
import { add, mul, num, pow } from "../core/num.ts";
import type { SaveData } from "./save.ts";
import { SAVE_VERSION, deserialize, serialize } from "./save.ts";

/** number の範囲を超える大きさの数も含む状態。 */
const bigAmount = fc
  .tuple(
    fc.double({ min: 1, max: 10, noNaN: true }),
    fc.double({ min: 0, max: 1e300, noNaN: true }),
  )
  .map(([mantissa, exponent]: readonly [number, number]) =>
    mul(num(mantissa), pow(num(10), exponent)),
  );
const state = fc.oneof(
  gameState,
  fc
    .tuple(gameState, bigAmount, bigAmount)
    .map(([base, coins, spent]: readonly [GameState, Num, Num]) => ({
      ...base,
      coins,
      totalEarned: add(coins, spent),
    })),
);
const saveData: fc.Arbitrary<SaveData> = fc
  // 保存時刻は Date.now() の値（Date が表せる範囲の整数ミリ秒）。
  .tuple(state, fc.integer({ min: -8.64e15, max: 8.64e15 }))
  .map(([generated, savedAt]: readonly [GameState, number]) => ({ state: generated, savedAt }));

const validFile = {
  version: SAVE_VERSION,
  savedAt: 1000,
  state: {
    coins: { sign: 1, layer: 0, mag: 5 },
    totalEarned: { sign: 1, layer: 0, mag: 10 },
    collectors: 2,
    factories: 1,
    mints: 3,
    refineries: 6,
    exchanges: 7,
    upgrades: 4,
    collectorUpgrades: 8,
    factoryLinks: 9,
    toolSupplies: 10,
    autoBuyer: true,
    cautiousAutoBuyer: true,
  },
};

const withState = (overrides: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({ ...validFile, state: { ...validFile.state, ...overrides } });

test("保存して読み込むと元の状態と保存時刻に戻る", () => {
  fc.assert(
    fc.property(saveData, (data) => {
      expect(deserialize(serialize(data))).toStrictEqual({ ok: true, data });
    }),
  );
});

/** {@link validFile} を読み込んだ状態。 */
const loaded: GameState = {
  coins: num(5),
  totalEarned: num(10),
  collectors: 2,
  factories: 1,
  mints: 3,
  refineries: 6,
  exchanges: 7,
  upgrades: 4,
  collectorUpgrades: 8,
  factoryLinks: 9,
  toolSupplies: 10,
  autoBuyer: true,
  cautiousAutoBuyer: true,
};

test("正しい形式の保存データを読み込める", () => {
  expect(deserialize(JSON.stringify(validFile))).toStrictEqual({
    ok: true,
    data: { savedAt: 1000, state: loaded },
  });
});

test.each([8.64e15, -8.64e15])("Date の範囲の端の保存時刻 %s を読み込める", (savedAt) => {
  const data = { state: initialState, savedAt };

  expect(deserialize(serialize(data))).toStrictEqual({ ok: true, data });
});

test("0 のコインを読み込める", () => {
  const data = { state: initialState, savedAt: 0 };

  expect(deserialize(serialize(data))).toStrictEqual({ ok: true, data });
});

test.each([
  {
    name: "版が無い",
    text: JSON.stringify({ ...validFile, version: undefined }),
    error: "未知の版: undefined",
  },
  { name: "未来の版", text: JSON.stringify({ ...validFile, version: 10 }), error: "未知の版: 10" },
  { name: "版 0", text: JSON.stringify({ ...validFile, version: 0 }), error: "未知の版: 0" },
  {
    name: "版が文字列",
    text: JSON.stringify({ ...validFile, version: "1" }),
    error: '未知の版: "1"',
  },
  {
    name: "版が文字列に変換できないオブジェクト",
    text: '{"version":{"toString":null}}',
    error: "未知の版: object",
  },
  { name: "版が null", text: '{"version":null}', error: "未知の版: null" },
  { name: "版が真偽値", text: '{"version":true}', error: "未知の版: true" },
] as const)("未知の版は読み込みに失敗する: $name", ({ text, error }) => {
  expect(deserialize(text)).toStrictEqual({ ok: false, error });
});

test.each([
  { name: "JSON でない", text: "{", error: "JSON として読めない" },
  { name: "空文字列", text: "", error: "JSON として読めない" },
  { name: "null", text: "null", error: "保存データがオブジェクトでない" },
  { name: "配列", text: "[]", error: "保存データがオブジェクトでない" },
  {
    name: "savedAt が無い",
    text: JSON.stringify({ ...validFile, savedAt: undefined }),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    // JSON.parse は桁あふれした数を Infinity にする。
    name: "savedAt が無限大",
    text: JSON.stringify(validFile).replace('"savedAt":1000', '"savedAt":1e999'),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    name: "savedAt が負の無限大",
    text: JSON.stringify(validFile).replace('"savedAt":1000', '"savedAt":-1e999'),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    name: "savedAt が Date の範囲より先",
    text: JSON.stringify({ ...validFile, savedAt: 8.64e15 + 1 }),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    name: "savedAt が Date の範囲より前",
    text: JSON.stringify({ ...validFile, savedAt: -8.64e15 - 1 }),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    name: "savedAt が整数でない",
    text: JSON.stringify({ ...validFile, savedAt: 1000.5 }),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    name: "savedAt が文字列",
    text: JSON.stringify({ ...validFile, savedAt: "1000" }),
    error: "savedAt が Date の範囲の整数ミリ秒でない",
  },
  {
    name: "state が無い",
    text: JSON.stringify({ ...validFile, state: undefined }),
    error: "state がオブジェクトでない",
  },
  {
    name: "coins が数の表現でない",
    text: withState({ coins: 5 }),
    error: "coins が 0 以上の数でない",
  },
  {
    name: "coins の mag が文字列",
    text: withState({ coins: { sign: 1, layer: 0, mag: "5" } }),
    error: "coins が 0 以上の数でない",
  },
  {
    name: "coins の sign が無い",
    text: withState({ coins: { layer: 0, mag: 5 } }),
    error: "coins が 0 以上の数でない",
  },
  {
    name: "coins の layer が無い",
    text: withState({ coins: { sign: 1, mag: 5 } }),
    error: "coins が 0 以上の数でない",
  },
  {
    name: "coins が負",
    text: withState({ coins: { sign: -1, layer: 0, mag: 5 } }),
    error: "coins が 0 以上の数でない",
  },
  {
    name: "coins が正規化されていない",
    text: withState({ coins: { sign: 1, layer: 1, mag: 1 } }),
    error: "coins が 0 以上の数でない",
  },
  {
    name: "totalEarned が無い",
    text: withState({ totalEarned: undefined }),
    error: "totalEarned が coins 以上の数でない",
  },
  {
    name: "totalEarned が coins より小さい",
    text: withState({ totalEarned: { sign: 1, layer: 0, mag: 4 } }),
    error: "totalEarned が coins 以上の数でない",
  },
  {
    name: "collectors が負",
    text: withState({ collectors: -1 }),
    error: "collectors が 0 以上の整数でない",
  },
  {
    name: "collectors が整数でない",
    text: withState({ collectors: 1.5 }),
    error: "collectors が 0 以上の整数でない",
  },
  {
    name: "factories が文字列",
    text: withState({ factories: "1" }),
    error: "factories が 0 以上の整数でない",
  },
  {
    name: "factories が負",
    text: withState({ factories: -1 }),
    error: "factories が 0 以上の整数でない",
  },
  { name: "autoBuyer が数", text: withState({ autoBuyer: 1 }), error: "autoBuyer が真偽値でない" },
  {
    name: "cautiousAutoBuyer が無い",
    text: withState({ cautiousAutoBuyer: undefined }),
    error: "cautiousAutoBuyer が真偽値でない",
  },
  {
    name: "cautiousAutoBuyer が数",
    text: withState({ cautiousAutoBuyer: 0 }),
    error: "cautiousAutoBuyer が真偽値でない",
  },
] as const)("壊れたデータは読み込みに失敗する: $name", ({ text, error }) => {
  expect(deserialize(text)).toStrictEqual({ ok: false, error });
});

// 版 1 より後に足した数の項目は、どれも同じ規則で読む。
const addedCountProblems = [
  { problem: "無い", value: undefined },
  { problem: "負", value: -1 },
  { problem: "整数でない", value: 0.5 },
] as const;

interface AddedCountCase {
  readonly key: string;
  readonly problem: string;
  readonly value: number | undefined;
}

test.each(
  [
    "mints",
    "refineries",
    "exchanges",
    "upgrades",
    "collectorUpgrades",
    "factoryLinks",
    "toolSupplies",
  ].flatMap((key) =>
    addedCountProblems.map(({ problem, value }): AddedCountCase => ({ key, problem, value })),
  ),
)("壊れたデータは読み込みに失敗する: $key が$problem", ({ key, value }: AddedCountCase) => {
  expect(deserialize(withState({ [key]: value }))).toStrictEqual({
    ok: false,
    error: `${key} が 0 以上の整数でない`,
  });
});
