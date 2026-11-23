import { expect, test } from "vitest";

import type { GameState } from "../core/game.ts";
import { num } from "../core/num.ts";
import { SAVE_VERSION, deserialize } from "./save.ts";

// 前の版の保存形式の読み込み。今の版の読み込みと、壊れたデータの扱いは save.test.ts。

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

/** {@link validFile} を今の版として読み込んだ状態。 */
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

test("造幣所と改良と控えめな自動購入と精錬所と交易所の無い版 1 の保存データは、造幣所 0・改良 0・控えめな自動購入なし・精錬所 0・交易所 0 として読み込める", () => {
  const {
    mints: _mints,
    upgrades: _upgrades,
    cautiousAutoBuyer: _cautious,
    refineries: _refineries,
    exchanges: _exchanges,
    collectorUpgrades: _collectorUpgrades,
    factoryLinks: _factoryLinks,
    toolSupplies: _toolSupplies,
    ...stateV1
  } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 1, state: stateV1 }))).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: {
        ...loaded,
        mints: 0,
        upgrades: 0,
        cautiousAutoBuyer: false,
        refineries: 0,
        exchanges: 0,
        collectorUpgrades: 0,
        factoryLinks: 0,
        toolSupplies: 0,
      },
    },
  });
});

test("改良と控えめな自動購入と精錬所と交易所の無い版 2 の保存データは、改良 0・控えめな自動購入なし・精錬所 0・交易所 0 として読み込める", () => {
  const {
    upgrades: _upgrades,
    cautiousAutoBuyer: _cautious,
    refineries: _refineries,
    exchanges: _exchanges,
    collectorUpgrades: _collectorUpgrades,
    factoryLinks: _factoryLinks,
    toolSupplies: _toolSupplies,
    ...stateV2
  } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 2, state: stateV2 }))).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: {
        ...loaded,
        upgrades: 0,
        cautiousAutoBuyer: false,
        refineries: 0,
        exchanges: 0,
        collectorUpgrades: 0,
        factoryLinks: 0,
        toolSupplies: 0,
      },
    },
  });
});

test.each([
  { name: "自動購入を持つ", autoBuyer: true },
  { name: "自動購入を持たない", autoBuyer: false },
] as const)(
  "控えめな自動購入と精錬所と交易所の無い版 3 の保存データは、控えめな自動購入なし・精錬所 0・交易所 0 として読み込み、自動購入はそのまま読む（$name）",
  ({ autoBuyer }) => {
    const {
      cautiousAutoBuyer: _cautious,
      refineries: _refineries,
      exchanges: _exchanges,
      collectorUpgrades: _collectorUpgrades,
      factoryLinks: _factoryLinks,
      toolSupplies: _toolSupplies,
      ...stateV3
    } = validFile.state;

    expect(
      deserialize(JSON.stringify({ ...validFile, version: 3, state: { ...stateV3, autoBuyer } })),
    ).toStrictEqual({
      ok: true,
      data: {
        savedAt: 1000,
        state: {
          ...loaded,
          autoBuyer,
          cautiousAutoBuyer: false,
          refineries: 0,
          exchanges: 0,
          collectorUpgrades: 0,
          factoryLinks: 0,
          toolSupplies: 0,
        },
      },
    });
  },
);

test("精錬所と交易所の無い版 4 の保存データは、精錬所 0・交易所 0 として読み込み、控えめな自動購入はそのまま読む", () => {
  const {
    refineries: _refineries,
    exchanges: _exchanges,
    collectorUpgrades: _collectorUpgrades,
    factoryLinks: _factoryLinks,
    toolSupplies: _toolSupplies,
    ...stateV4
  } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 4, state: stateV4 }))).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: {
        ...loaded,
        refineries: 0,
        exchanges: 0,
        collectorUpgrades: 0,
        factoryLinks: 0,
        toolSupplies: 0,
      },
    },
  });
});

test("版 4 の保存データは、精錬所の項目があっても読まない", () => {
  const text = JSON.stringify({
    ...validFile,
    version: 4,
    state: { ...validFile.state, refineries: "壊れた値" },
  });

  expect(deserialize(text)).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: {
        ...loaded,
        refineries: 0,
        exchanges: 0,
        collectorUpgrades: 0,
        factoryLinks: 0,
        toolSupplies: 0,
      },
    },
  });
});

/** 版 5 から 8 の保存と、それぞれの次の版で足した項目（`key`）、その版の保存に無い項目（`omitted`）。 */
const laterVersions = [
  {
    version: 5,
    name: "交易所",
    key: "exchanges",
    omitted: ["exchanges", "collectorUpgrades", "factoryLinks", "toolSupplies"],
  },
  {
    version: 6,
    name: "採集機の改修",
    key: "collectorUpgrades",
    omitted: ["collectorUpgrades", "factoryLinks", "toolSupplies"],
  },
  {
    version: 7,
    name: "工場の連携",
    key: "factoryLinks",
    omitted: ["factoryLinks", "toolSupplies"],
  },
  { version: 8, name: "工具の支給", key: "toolSupplies", omitted: ["toolSupplies"] },
] as const;

/** {@link validFile} の状態から `keys` の項目を除いたもの。 */
const stateWithout = (keys: readonly string[]): Readonly<Record<string, unknown>> => {
  const state: Record<string, unknown> = { ...validFile.state };
  for (const key of keys) {
    Reflect.deleteProperty(state, key);
  }
  return state;
};

/** `keys` の数の項目を 0 にした {@link loaded}。 */
const loadedWithout = (keys: readonly string[]): GameState => ({
  ...loaded,
  ...Object.fromEntries(keys.map((key) => [key, 0])),
});

test.each(laterVersions)(
  "$name の無い版 $version の保存データは、$name とそれより後に足した項目を 0 として読み込み、前の版で足した項目はそのまま読む",
  ({ version, omitted }) => {
    const text = JSON.stringify({ ...validFile, version, state: stateWithout(omitted) });

    expect(deserialize(text)).toStrictEqual({
      ok: true,
      data: { savedAt: 1000, state: loadedWithout(omitted) },
    });
  },
);

test.each(laterVersions)(
  "版 $version の保存データは、$name の項目があっても読まない",
  ({ version, key, omitted }) => {
    const text = JSON.stringify({
      ...validFile,
      version,
      state: { ...validFile.state, [key]: "壊れた値" },
    });

    expect(deserialize(text)).toStrictEqual({
      ok: true,
      data: { savedAt: 1000, state: loadedWithout(omitted) },
    });
  },
);

test("版 3 の保存データは、控えめな自動購入の項目があっても読まない", () => {
  const text = JSON.stringify({
    ...validFile,
    version: 3,
    state: { ...validFile.state, cautiousAutoBuyer: "壊れた値" },
  });

  expect(deserialize(text)).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: {
        ...loaded,
        cautiousAutoBuyer: false,
        refineries: 0,
        exchanges: 0,
        collectorUpgrades: 0,
        factoryLinks: 0,
        toolSupplies: 0,
      },
    },
  });
});

test("版 2 の保存データでも、造幣所の数が不正なら読み込みに失敗する", () => {
  const text = JSON.stringify({
    ...validFile,
    version: 2,
    state: { ...validFile.state, mints: -1 },
  });

  expect(deserialize(text)).toStrictEqual({ ok: false, error: "mints が 0 以上の整数でない" });
});
