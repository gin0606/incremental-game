import type { Action, GameState } from "../core/game.ts";
import {
  advance,
  initialState,
  isFactoryUnlocked,
  perform,
  priceOf,
  production,
  withPurchase,
} from "../core/game.ts";
import { sub } from "../core/num.ts";
import type { Model, Offer } from "./model.ts";

/** 候補の名前と、その候補を買う行動、解放されているか。並びは解放される順。 */
interface Item {
  readonly id: string;
  readonly action: Action;
  /** 解放済みか。買い終えた後も解放済みとして数える。 */
  readonly unlocked: (state: GameState) => boolean;
}

const always = (): boolean => true;

/**
 * core の行動の種類ごとの候補。core に行動を足すと、ここに足すまで型検査が通らない。シミュレーターはこの一覧を通して
 * しかゲームを見ないため、足し忘れた行動は、ペースの判定から黙って外れる。
 */
const byAction: {
  readonly [K in Action["type"]]: Item & { readonly action: { readonly type: K } };
} = {
  buyCollector: { id: "collector", action: { type: "buyCollector" }, unlocked: always },
  buyAutoBuyer: { id: "autoBuyer", action: { type: "buyAutoBuyer" }, unlocked: always },
  buyFactory: { id: "factory", action: { type: "buyFactory" }, unlocked: isFactoryUnlocked },
};

const items: readonly Item[] = Object.values(byAction);

/** 値段と生産量の増分は core の購入の規則（priceOf・withPurchase）から求め、ここで繰り返さない。 */
const offers = (state: GameState): readonly Offer[] =>
  items.flatMap((item) => {
    const cost = priceOf(state, item.action);
    if (cost === undefined) {
      return [];
    }
    const rateGain = sub(production(withPurchase(state, item.action)), production(state));
    return [{ id: item.id, cost, rateGain }];
  });

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
