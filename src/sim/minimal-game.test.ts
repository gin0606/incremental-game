import * as fc from "fast-check";
import { expect, test } from "vitest";

import { gameState } from "../core/game.arbitrary.ts";
import type { GameState } from "../core/game.ts";
import {
  AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_COST,
  EXCHANGE_UNLOCK_EARNED,
  FACTORY_UNLOCK_EARNED,
  MINT_UNLOCK_EARNED,
  REFINERY_UNLOCK_EARNED,
  UPGRADE_UNLOCK_EARNED,
  advance,
  collectorCost,
  exchangeCost,
  factoryCost,
  initialState,
  mintCost,
  perform,
  production,
  refineryCost,
  upgradeCost,
} from "../core/game.ts";
import type { Num } from "../core/num.ts";
import { add, num, sub } from "../core/num.ts";
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

test("工場・改良・造幣所・精錬所・交易所は解放されるまで候補に無く、自動購入は買った後は候補に無い", () => {
  expect(ids(initialState)).toStrictEqual(["collector", "autoBuyer", "cautiousAutoBuyer"]);
  expect(ids(state({ totalEarned: FACTORY_UNLOCK_EARNED }))).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
  ]);
  expect(ids(state({ totalEarned: UPGRADE_UNLOCK_EARNED }))).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
  ]);
  expect(ids(state({ totalEarned: MINT_UNLOCK_EARNED }))).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
    "mint",
  ]);
  expect(ids(state({ totalEarned: REFINERY_UNLOCK_EARNED }))).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
    "mint",
    "refinery",
  ]);
  expect(ids(state({ totalEarned: EXCHANGE_UNLOCK_EARNED }))).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
    "mint",
    "refinery",
    "exchange",
  ]);
  expect(ids(state({ totalEarned: MINT_UNLOCK_EARNED, autoBuyer: true }))).toStrictEqual([
    "collector",
    "factory",
    "upgrade",
    "mint",
  ]);
});

test("控えめな自動購入は、買った後と、自動購入を買った後は候補に無い", () => {
  expect(ids(state({ cautiousAutoBuyer: true }))).toStrictEqual(["collector", "autoBuyer"]);
  expect(ids(state({ autoBuyer: true }))).toStrictEqual(["collector"]);
});

test("解放済みの要素は、工場・改良・造幣所・精錬所・交易所の解放で増え、自動購入と控えめな自動購入を買っても減らない", () => {
  expect(minimalGame.unlocked(initialState)).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
  ]);
  expect(
    minimalGame.unlocked(state({ totalEarned: FACTORY_UNLOCK_EARNED, autoBuyer: true })),
  ).toStrictEqual(["collector", "autoBuyer", "cautiousAutoBuyer", "factory"]);
  expect(
    minimalGame.unlocked(state({ totalEarned: UPGRADE_UNLOCK_EARNED, cautiousAutoBuyer: true })),
  ).toStrictEqual(["collector", "autoBuyer", "cautiousAutoBuyer", "factory", "upgrade"]);
  expect(
    minimalGame.unlocked(state({ totalEarned: MINT_UNLOCK_EARNED, autoBuyer: true })),
  ).toStrictEqual(["collector", "autoBuyer", "cautiousAutoBuyer", "factory", "upgrade", "mint"]);
  expect(
    minimalGame.unlocked(state({ totalEarned: REFINERY_UNLOCK_EARNED, autoBuyer: true })),
  ).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
    "mint",
    "refinery",
  ]);
  expect(
    minimalGame.unlocked(state({ totalEarned: EXCHANGE_UNLOCK_EARNED, autoBuyer: true })),
  ).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
    "mint",
    "refinery",
    "exchange",
  ]);
});

test("候補の値段と生産量の増分は core の値段と生産量から決まる", () => {
  const game = state({
    collectors: 2,
    factories: 1,
    mints: 2,
    refineries: 3,
    exchanges: 5,
    upgrades: 1,
    totalEarned: EXCHANGE_UNLOCK_EARNED,
  });
  const gainOf = (added: Partial<GameState>): Num =>
    sub(production({ ...game, ...added }), production(game));
  const offers = minimalGame.offers(game);

  expect(offers.map(({ id }) => id)).toStrictEqual([
    "collector",
    "autoBuyer",
    "cautiousAutoBuyer",
    "factory",
    "upgrade",
    "mint",
    "refinery",
    "exchange",
  ]);
  const [collector, autoBuyer, cautiousAutoBuyer, factory, upgrade, mint, refinery, exchange] =
    offers;
  expect(collector?.cost).toBeApprox(collectorCost(game));
  expect(collector?.rateGain).toBeApprox(gainOf({ collectors: 3 }));
  expect(autoBuyer?.cost).toBeApprox(AUTO_BUYER_COST);
  expect(autoBuyer?.rateGain).toBeApprox(num(0));
  expect(cautiousAutoBuyer?.cost).toBeApprox(CAUTIOUS_AUTO_BUYER_COST);
  expect(cautiousAutoBuyer?.rateGain).toBeApprox(num(0));
  expect(factory?.cost).toBeApprox(factoryCost(game));
  expect(factory?.rateGain).toBeApprox(gainOf({ factories: 2 }));
  expect(upgrade?.cost).toBeApprox(upgradeCost(game));
  expect(upgrade?.rateGain).toBeApprox(gainOf({ upgrades: 2 }));
  expect(mint?.cost).toBeApprox(mintCost(game));
  expect(mint?.rateGain).toBeApprox(gainOf({ mints: 3 }));
  expect(refinery?.cost).toBeApprox(refineryCost(game));
  expect(refinery?.rateGain).toBeApprox(gainOf({ refineries: 4 }));
  expect(exchange?.cost).toBeApprox(exchangeCost(game));
  expect(exchange?.rateGain).toBeApprox(gainOf({ exchanges: 6 }));
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
