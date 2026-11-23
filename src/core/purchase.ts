import type { Num } from "./num.ts";
import { ZERO, atLeast, max, num, sub } from "./num.ts";

import {
  collectorCost,
  collectorUpgradeCost,
  exchangeCost,
  factoryCost,
  isCollectorUpgradeUnlocked,
  isExchangeUnlocked,
  isFactoryUnlocked,
  isMintUnlocked,
  isRefineryUnlocked,
  isUpgradeUnlocked,
  mintCost,
  refineryCost,
  upgradeCost,
} from "./economy.ts";
import type { Action, GameState } from "./state.ts";

// 行動ごとの値段と、買ったときに足すもの、支払いの規則。値段の式と解放の条件は economy.ts にある。game.ts から公開する。

export const AUTO_BUYER_COST: Num = num(3e5);
export const CAUTIOUS_AUTO_BUYER_COST: Num = num(3e4);

interface Purchase {
  /** 今の状態で買えるときの値段。解放されていない、買い終えたなどで買えなければ `undefined`。 */
  readonly price: (state: GameState) => Num | undefined;
  /** 支払いの前の状態に、買ったものを足す。 */
  readonly receive: (state: GameState) => GameState;
}

const purchases: Readonly<Record<Action["type"], Purchase>> = {
  buyCollector: {
    price: collectorCost,
    receive: (state) => ({ ...state, collectors: state.collectors + 1 }),
  },
  buyFactory: {
    price: (state) => (isFactoryUnlocked(state) ? factoryCost(state) : undefined),
    receive: (state) => ({ ...state, factories: state.factories + 1 }),
  },
  buyMint: {
    price: (state) => (isMintUnlocked(state) ? mintCost(state) : undefined),
    receive: (state) => ({ ...state, mints: state.mints + 1 }),
  },
  buyRefinery: {
    price: (state) => (isRefineryUnlocked(state) ? refineryCost(state) : undefined),
    receive: (state) => ({ ...state, refineries: state.refineries + 1 }),
  },
  buyExchange: {
    price: (state) => (isExchangeUnlocked(state) ? exchangeCost(state) : undefined),
    receive: (state) => ({ ...state, exchanges: state.exchanges + 1 }),
  },
  buyUpgrade: {
    price: (state) => (isUpgradeUnlocked(state) ? upgradeCost(state) : undefined),
    receive: (state) => ({ ...state, upgrades: state.upgrades + 1 }),
  },
  buyCollectorUpgrade: {
    price: (state) => (isCollectorUpgradeUnlocked(state) ? collectorUpgradeCost(state) : undefined),
    receive: (state) => ({ ...state, collectorUpgrades: state.collectorUpgrades + 1 }),
  },
  buyAutoBuyer: {
    price: (state) => (state.autoBuyer ? undefined : AUTO_BUYER_COST),
    receive: (state) => ({ ...state, autoBuyer: true }),
  },
  // 自動購入を持てば働きが自動購入に含まれるため、買い終えたものとして扱う。
  buyCautiousAutoBuyer: {
    price: (state) =>
      state.autoBuyer || state.cautiousAutoBuyer ? undefined : CAUTIOUS_AUTO_BUYER_COST,
    receive: (state) => ({ ...state, cautiousAutoBuyer: true }),
  },
};

/**
 * `action` で買うときの値段。解放されていない、買い終えたなどで買えなければ `undefined`。額が足りるかは問わない。
 */
export function priceOf(state: GameState, action: Action): Num | undefined {
  return purchases[action.type].price(state);
}

/** `action` で買うものを、値段を払わずに足した状態。買ったときに生産量がどう変わるかを見積もるのに使う。 */
export function withPurchase(state: GameState, action: Action): GameState {
  return purchases[action.type].receive(state);
}

/** 値段を払って買う。誤差で値段をわずかに下回った分は 0 に切り上げる。額が足りるかは呼び出し側が確かめる。 */
export function pay(state: GameState, action: Action, amount: Num): GameState {
  return { ...withPurchase(state, action), coins: max(ZERO, sub(state.coins, amount)) };
}

/**
 * `action` を実行した後の状態を返す。解放されていない、買える額に達していないなどで実行できなければ
 * `undefined` を返す。額は許容誤差付きで比べる（{@link atLeast}）。
 */
export function perform(state: GameState, action: Action): GameState | undefined {
  const amount = priceOf(state, action);
  if (amount === undefined || !atLeast(state.coins, amount)) {
    return undefined;
  }
  return pay(state, action, amount);
}
