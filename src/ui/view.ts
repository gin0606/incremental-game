import type { Action, GameState } from "../core/game.ts";
import {
  AUTO_BUYER_COST,
  collectorCost,
  factoryCost,
  isFactoryUnlocked,
  perform,
  production,
} from "../core/game.ts";
import { format } from "../core/num.ts";

export interface ShopItem {
  readonly action: Action;
  readonly label: string;
  /** 解放されていて、まだ買える（一度きりの品物を買い終えていない）。 */
  readonly visible: boolean;
  readonly affordable: boolean;
}

/** 画面に出す文字列と、ボタンの状態。 */
export interface View {
  readonly coins: string;
  readonly production: string;
  readonly collectors: string;
  readonly factories: string;
  readonly autoBuyer: string;
  readonly shop: readonly ShopItem[];
}

const item = (state: GameState, action: Action, label: string, visible: boolean): ShopItem => ({
  action,
  label,
  visible,
  affordable: perform(state, action) !== undefined,
});

export function view(state: GameState): View {
  return {
    coins: format(state.coins),
    production: format(production(state)),
    collectors: state.collectors.toString(),
    factories: state.factories.toString(),
    autoBuyer: state.autoBuyer ? "稼働中" : "なし",
    shop: [
      item(
        state,
        { type: "buyCollector" },
        `採集機を買う（${format(collectorCost(state), "up")} コイン）`,
        true,
      ),
      item(
        state,
        { type: "buyFactory" },
        `工場を買う（${format(factoryCost(state), "up")} コイン）`,
        isFactoryUnlocked(state),
      ),
      item(
        state,
        { type: "buyAutoBuyer" },
        `自動購入を買う（${format(AUTO_BUYER_COST, "up")} コイン）`,
        !state.autoBuyer,
      ),
    ],
  };
}
