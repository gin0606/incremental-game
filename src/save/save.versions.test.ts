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
    ...stateV4
  } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 4, state: stateV4 }))).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: { ...loaded, refineries: 0, exchanges: 0, collectorUpgrades: 0, factoryLinks: 0 },
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
      state: { ...loaded, refineries: 0, exchanges: 0, collectorUpgrades: 0, factoryLinks: 0 },
    },
  });
});

test("交易所の無い版 5 の保存データは、交易所 0 として読み込み、精錬所はそのまま読む", () => {
  const {
    exchanges: _exchanges,
    collectorUpgrades: _collectorUpgrades,
    factoryLinks: _factoryLinks,
    ...stateV5
  } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 5, state: stateV5 }))).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: { ...loaded, exchanges: 0, collectorUpgrades: 0, factoryLinks: 0 },
    },
  });
});

test("版 5 の保存データは、交易所の項目があっても読まない", () => {
  const text = JSON.stringify({
    ...validFile,
    version: 5,
    state: { ...validFile.state, exchanges: "壊れた値" },
  });

  expect(deserialize(text)).toStrictEqual({
    ok: true,
    data: {
      savedAt: 1000,
      state: { ...loaded, exchanges: 0, collectorUpgrades: 0, factoryLinks: 0 },
    },
  });
});

test("採集機の改修の無い版 6 の保存データは、採集機の改修 0 として読み込み、交易所はそのまま読む", () => {
  const {
    collectorUpgrades: _collectorUpgrades,
    factoryLinks: _factoryLinks,
    ...stateV6
  } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 6, state: stateV6 }))).toStrictEqual({
    ok: true,
    data: { savedAt: 1000, state: { ...loaded, collectorUpgrades: 0, factoryLinks: 0 } },
  });
});

test("版 6 の保存データは、採集機の改修の項目があっても読まない", () => {
  const text = JSON.stringify({
    ...validFile,
    version: 6,
    state: { ...validFile.state, collectorUpgrades: "壊れた値" },
  });

  expect(deserialize(text)).toStrictEqual({
    ok: true,
    data: { savedAt: 1000, state: { ...loaded, collectorUpgrades: 0, factoryLinks: 0 } },
  });
});

test("工場の連携の無い版 7 の保存データは、工場の連携 0 として読み込み、採集機の改修はそのまま読む", () => {
  const { factoryLinks: _factoryLinks, ...stateV7 } = validFile.state;

  expect(deserialize(JSON.stringify({ ...validFile, version: 7, state: stateV7 }))).toStrictEqual({
    ok: true,
    data: { savedAt: 1000, state: { ...loaded, factoryLinks: 0 } },
  });
});

test("版 7 の保存データは、工場の連携の項目があっても読まない", () => {
  const text = JSON.stringify({
    ...validFile,
    version: 7,
    state: { ...validFile.state, factoryLinks: "壊れた値" },
  });

  expect(deserialize(text)).toStrictEqual({
    ok: true,
    data: { savedAt: 1000, state: { ...loaded, factoryLinks: 0 } },
  });
});

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
