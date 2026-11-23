import * as fc from "fast-check";
import { expect, test } from "vitest";

import { gameState } from "../core/game.arbitrary.ts";
import type { GameState } from "../core/game.ts";
import {
  AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_COST,
  COLLECTOR_UPGRADE_UNLOCK_EARNED,
  EXCHANGE_UNLOCK_EARNED,
  FACTORY_LINK_UNLOCK_EARNED,
  FACTORY_UNLOCK_EARNED,
  MINT_UNLOCK_EARNED,
  REFINERY_UNLOCK_EARNED,
  UPGRADE_UNLOCK_EARNED,
  advance,
  collectorCost,
  collectorUpgradeCost,
  exchangeCost,
  factoryCost,
  factoryLinkCost,
  initialState,
  mintCost,
  perform,
  production,
  refineryCost,
  upgradeCost,
} from "../core/game.ts";
import type { Num } from "../core/num.ts";
import { add, atLeast, num, sub } from "../core/num.ts";
import { minimalGame } from "./minimal-game.ts";

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

/** 買えなかったとき（`undefined`）は負の生産量にして、比較を失敗させる。 */
const productionOf = (game: GameState | undefined): Num =>
  game === undefined ? num(-1) : production(game);

const ids = (game: GameState): readonly string[] =>
  minimalGame.offers(game).map((offer) => offer.id);

test("初期状態・時間の経過・資源・生産量は core のものを使う", () => {
  expect(minimalGame.initial).toBe(initialState);
  expect(minimalGame.advance).toBe(advance);
  expect(minimalGame.rate).toBe(production);
  expect(minimalGame.resource(state({ coins: num(42) }))).toBeApprox(num(42));
});

/**
 * 後から解放される要素と、その解放の条件（これまでに生産したコイン）。並びは候補の並び。解放の条件の値と大小に
 * よらず、条件に届いた要素だけが候補と解放済みの要素に並ぶことを確かめる。
 */
const unlocks: readonly (readonly [string, Num])[] = [
  ["factory", FACTORY_UNLOCK_EARNED],
  ["upgrade", UPGRADE_UNLOCK_EARNED],
  ["collectorUpgrade", COLLECTOR_UPGRADE_UNLOCK_EARNED],
  ["mint", MINT_UNLOCK_EARNED],
  ["refinery", REFINERY_UNLOCK_EARNED],
  ["exchange", EXCHANGE_UNLOCK_EARNED],
  ["factoryLink", FACTORY_LINK_UNLOCK_EARNED],
];

/** これまでに生産したコインが `earned` のときに解放されている、後から解放される要素。 */
const unlockedAt = (earned: Num): readonly string[] =>
  unlocks.filter(([, condition]) => atLeast(earned, condition)).map(([id]) => id);

test("工場・改良・採集機の改修・造幣所・精錬所・交易所・工場の連携は解放されるまで候補に無く、自動購入は買った後は候補に無い", () => {
  expect(ids(initialState)).toStrictEqual(["collector", "autoBuyer", "cautiousAutoBuyer"]);
  for (const [id, earned] of unlocks) {
    const reached = unlockedAt(earned);
    expect(reached).toContain(id);
    expect(ids(state({ totalEarned: earned }))).toStrictEqual([
      "collector",
      "autoBuyer",
      "cautiousAutoBuyer",
      ...reached,
    ]);
    expect(ids(state({ totalEarned: earned, autoBuyer: true }))).toStrictEqual([
      "collector",
      ...reached,
    ]);
  }
});

test("控えめな自動購入は、買った後と、自動購入を買った後は候補に無い", () => {
  expect(ids(state({ cautiousAutoBuyer: true }))).toStrictEqual(["collector", "autoBuyer"]);
  expect(ids(state({ autoBuyer: true }))).toStrictEqual(["collector"]);
});

test("解放済みの要素は、工場・改良・採集機の改修・造幣所・精錬所・交易所・工場の連携の解放で増え、自動購入と控えめな自動購入を買っても減らない", () => {
  expect(minimalGame.unlocked(initialState)).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
  ]);
  for (const [, earned] of unlocks) {
    const expected = ["collector", "autoBuyer", "cautiousAutoBuyer", ...unlockedAt(earned)];
    expect(minimalGame.unlocked(state({ totalEarned: earned }))).toStrictEqual(expected);
    expect(minimalGame.unlocked(state({ totalEarned: earned, autoBuyer: true }))).toStrictEqual(
      expected,
    );
    expect(
      minimalGame.unlocked(state({ totalEarned: earned, cautiousAutoBuyer: true })),
    ).toStrictEqual(expected);
  }
});

test("候補の値段と生産量の増分は core の値段と生産量から決まる", () => {
  const game = state({
    collectors: 2,
    factories: 1,
    mints: 2,
    refineries: 3,
    exchanges: 5,
    upgrades: 1,
    collectorUpgrades: 2,
    factoryLinks: 1,
    // どの解放の条件よりも多い。
    totalEarned: num(1e300),
  });
  const gainOf = (added: Partial<GameState>): Num =>
    sub(production({ ...game, ...added }), production(game));
  // 候補の名前と、core から求めた値段と、生産量の増分。並びは候補の並び。
  const expected: readonly (readonly [string, Num, Num])[] = [
    ["collector", collectorCost(game), gainOf({ collectors: 3 })],
    ["autoBuyer", AUTO_BUYER_COST, num(0)],
    ["cautiousAutoBuyer", CAUTIOUS_AUTO_BUYER_COST, num(0)],
    ["factory", factoryCost(game), gainOf({ factories: 2 })],
    ["upgrade", upgradeCost(game), gainOf({ upgrades: 2 })],
    ["collectorUpgrade", collectorUpgradeCost(game), gainOf({ collectorUpgrades: 3 })],
    ["mint", mintCost(game), gainOf({ mints: 3 })],
    ["refinery", refineryCost(game), gainOf({ refineries: 4 })],
    ["exchange", exchangeCost(game), gainOf({ exchanges: 6 })],
    ["factoryLink", factoryLinkCost(game), gainOf({ factoryLinks: 2 })],
  ];
  const offers = minimalGame.offers(game);

  expect(offers.map(({ id }) => id)).toStrictEqual(expected.map(([id]) => id));
  for (const [index, [, cost, gain]] of expected.entries()) {
    expect(offers[index]?.cost).toBeApprox(cost);
    expect(offers[index]?.rateGain).toBeApprox(gain);
  }
});

test("候補を買うと、core で同じ行動をした状態になる", () => {
  fc.assert(
    fc.property(gameState, (game) => {
      expect(minimalGame.buy(game, "collector")).toStrictEqual(
        perform(game, { type: "buyCollector" }),
      );
      expect(minimalGame.buy(game, "factory")).toStrictEqual(perform(game, { type: "buyFactory" }));
      expect(minimalGame.buy(game, "mint")).toStrictEqual(perform(game, { type: "buyMint" }));
      expect(minimalGame.buy(game, "refinery")).toStrictEqual(
        perform(game, { type: "buyRefinery" }),
      );
      expect(minimalGame.buy(game, "exchange")).toStrictEqual(
        perform(game, { type: "buyExchange" }),
      );
      expect(minimalGame.buy(game, "upgrade")).toStrictEqual(perform(game, { type: "buyUpgrade" }));
      expect(minimalGame.buy(game, "collectorUpgrade")).toStrictEqual(
        perform(game, { type: "buyCollectorUpgrade" }),
      );
      expect(minimalGame.buy(game, "factoryLink")).toStrictEqual(
        perform(game, { type: "buyFactoryLink" }),
      );
      expect(minimalGame.buy(game, "autoBuyer")).toStrictEqual(
        perform(game, { type: "buyAutoBuyer" }),
      );
      expect(minimalGame.buy(game, "cautiousAutoBuyer")).toStrictEqual(
        perform(game, { type: "buyCautiousAutoBuyer" }),
      );
    }),
  );
});

test("候補は値段ちょうどの額で買え、生産量は生産量の増分だけ増える", () => {
  fc.assert(
    fc.property(gameState, (game) => {
      for (const offer of minimalGame.offers(game)) {
        const bought = minimalGame.buy({ ...game, coins: offer.cost }, offer.id);
        expect(bought).toBeDefined();
        expect(bought?.coins).toBeApprox(num(0));
        expect(productionOf(bought)).toBeApprox(add(production(game), offer.rateGain));
      }
    }),
  );
});

test("知らない候補は買えない", () => {
  expect(minimalGame.buy(state({ coins: num(1e9) }), "unknown")).toBeUndefined();
});
