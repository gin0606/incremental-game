import type { Action, GameState } from "../core/game.ts";
import {
  AUTO_BUYER_COST,
  advance,
  collectorCost,
  factoryCost,
  initialState,
  isFactoryUnlocked,
  perform,
  production,
} from "../core/game.ts";
import type { Num } from "../core/num.ts";
import { ZERO, sub } from "../core/num.ts";
import type { Model, Offer } from "./model.ts";

/** 候補の名前と、その候補を買う行動・値段・解放されているか。並びは解放される順。 */
interface Item {
  readonly id: string;
  readonly action: Action;
  readonly cost: (state: GameState) => Num;
  /** 買ったときに増える毎秒の生産量。 */
  readonly rateGain: (state: GameState) => Num;
  /** 候補に並ぶか（解放済みで、買い終えていない）。 */
  readonly offered: (state: GameState) => boolean;
  /** 解放済みか。買い終えた後も解放済みとして数える。 */
  readonly unlocked: (state: GameState) => boolean;
}

const always = (): boolean => true;

const gain = (before: GameState, after: GameState): Num =>
  sub(production(after), production(before));

const items: readonly Item[] = [
  {
    id: "collector",
    action: { type: "buyCollector" },
    cost: collectorCost,
    rateGain: (state) => gain(state, { ...state, collectors: state.collectors + 1 }),
    offered: always,
    unlocked: always,
  },
  {
    id: "autoBuyer",
    action: { type: "buyAutoBuyer" },
    cost: () => AUTO_BUYER_COST,
    rateGain: () => ZERO,
    offered: (state) => !state.autoBuyer,
    unlocked: always,
  },
  {
    id: "factory",
    action: { type: "buyFactory" },
    cost: factoryCost,
    rateGain: (state) => gain(state, { ...state, factories: state.factories + 1 }),
    offered: isFactoryUnlocked,
    unlocked: isFactoryUnlocked,
  },
];

const offers = (state: GameState): readonly Offer[] =>
  items
    .filter((item) => item.offered(state))
    .map((item) => ({
      id: item.id,
      cost: item.cost(state),
      rateGain: item.rateGain(state),
    }));

const buy = (state: GameState, id: string): GameState | undefined => {
  const item = items.find((candidate) => candidate.id === id);
  return item === undefined ? undefined : perform(state, item.action);
};

/** 判定の仕組みを確かめるための最小ゲーム（src/core/game.ts）。資源はコイン。 */
export const minimalGame: Model<GameState> = {
  initial: initialState,
  advance,
  offers,
  buy,
  resource: (state) => state.coins,
  rate: production,
  unlocked: (state) => items.filter((item) => item.unlocked(state)).map((item) => item.id),
};
