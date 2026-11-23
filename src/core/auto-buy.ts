import type { Num } from "./num.ts";
import { ZERO, add, atLeast, div, mul, num, sub, toNumber, toleranceFloor } from "./num.ts";

import {
  COLLECTOR_UPGRADE_MULTIPLIER,
  EXCHANGE_PRODUCTION,
  EXCHANGE_UNLOCK_EARNED,
  FACTORY_UNLOCK_EARNED,
  MINT_PRODUCTION,
  REFINERY_PRODUCTION,
  REFINERY_UNLOCK_EARNED,
  UPGRADE_MULTIPLIER,
  baseProduction,
  collectorCost,
  collectorProduction,
  collectorUpgradeCost,
  collectorUpgradeUnlockEarned,
  exchangeCost,
  factoriesProduction,
  factoryCost,
  mintCost,
  mintUnlockEarned,
  production,
  refineryCost,
  upgradeCost,
  upgradeUnlockEarned,
} from "./economy.ts";
import { pay, priceOf } from "./purchase.ts";
import type { Action, GameState } from "./state.ts";

// 自動購入と控えめな自動購入が買うものと、買う時刻の規則。時間の経過（game.ts の advance）が使う。

/** 控えめな自動購入が、払った後も手元に残すコインの量を、今の毎秒の生産の何秒分かで表したもの。 */
export const CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS = 600;

/**
 * 自動購入と控えめな自動購入が買うものと、その値段と解放の条件。値段は解放の前でも返す。造幣所・精錬所・交易所・改良・
 * 採集機の改修の値段は解放に要る累計の生産量（economy.ts の `*_UNLOCK_EARNED`）より安く、解放の前にコインが値段に
 * 届きうる。そのため、買う時刻は、コインが値段（控えめな自動購入では、残すコインとの和）に届く時刻と、累計の生産量が
 * 解放の条件に届く時刻の遅いほうにする（{@link nextAutoBuy}）。累計の生産量もコインと同じ速さで増えるため、どちらの
 * 時刻も進め方によらない。
 */
const automated: readonly {
  readonly action: Action;
  readonly cost: (state: GameState) => Num;
  /**
   * 1 つ買ったときの、改良の倍率を掛ける前の生産量の増分。どの増分にも同じ倍率が掛かるため、値段あたりの増分の大小は
   * 倍率を掛けても変わらない。
   */
  readonly gain: (state: GameState) => Num;
  /** 解放に要る累計の生産量。 */
  readonly unlock: (state: GameState) => Num;
}[] = [
  {
    action: { type: "buyCollector" },
    cost: collectorCost,
    gain: collectorProduction,
    unlock: () => ZERO,
  },
  {
    action: { type: "buyFactory" },
    cost: factoryCost,
    // 工場の連携を持てば、1 台足すと、足した工場の生産のほかに、持っている工場それぞれの生産も増える。
    gain: (state) =>
      sub(
        factoriesProduction({ ...state, factories: state.factories + 1 }),
        factoriesProduction(state),
      ),
    unlock: () => FACTORY_UNLOCK_EARNED,
  },
  {
    action: { type: "buyMint" },
    cost: mintCost,
    gain: () => MINT_PRODUCTION,
    unlock: mintUnlockEarned,
  },
  {
    action: { type: "buyRefinery" },
    cost: refineryCost,
    gain: () => REFINERY_PRODUCTION,
    unlock: () => REFINERY_UNLOCK_EARNED,
  },
  {
    action: { type: "buyExchange" },
    cost: exchangeCost,
    gain: () => EXCHANGE_PRODUCTION,
    unlock: () => EXCHANGE_UNLOCK_EARNED,
  },
  {
    action: { type: "buyUpgrade" },
    cost: upgradeCost,
    gain: (state) => mul(baseProduction(state), sub(UPGRADE_MULTIPLIER, num(1))),
    unlock: upgradeUnlockEarned,
  },
  {
    action: { type: "buyCollectorUpgrade" },
    cost: collectorUpgradeCost,
    gain: (state) =>
      mul(
        mul(collectorProduction(state), num(state.collectors)),
        sub(COLLECTOR_UPGRADE_MULTIPLIER, num(1)),
      ),
    unlock: collectorUpgradeUnlockEarned,
  },
];

type Automated = (typeof automated)[number];

/**
 * 自動で買うときに、払った後も手元に残すコイン。自動購入を持てば 0、控えめな自動購入だけを持てば今の毎秒の生産の
 * {@link CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS} 秒分。どちらも持たなければ `undefined`（自動では買わない）。
 */
function autoBuyReserve(state: GameState): Num | undefined {
  if (state.autoBuyer) {
    return ZERO;
  }
  return state.cautiousAutoBuyer
    ? mul(production(state), num(CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS))
    : undefined;
}

/**
 * 自動購入が次に買った後の状態。コインが値段と {@link autoBuyReserve} の和に達したもののうち、値段あたりの生産量の
 * 増分が最も大きいものを買う。同じ値（許容誤差の範囲）なら先のもの。買えるものが無ければ `undefined`。
 */
function autoBuyOnce(state: GameState): GameState | undefined {
  // 残すコインは買うたびに増える生産に合わせて、買う前の状態から求め直す。
  const reserve = autoBuyReserve(state);
  if (reserve === undefined) {
    return undefined;
  }
  // 手元のコインが多いと何千回も買うため、買った後の生産量を求めず、増分を値段で割るだけで比べる。
  let best: { readonly action: Action; readonly price: Num; readonly value: Num } | undefined;
  for (const { action, gain } of automated) {
    const price = priceOf(state, action);
    if (price !== undefined && atLeast(state.coins, add(price, reserve))) {
      const value = div(gain(state), price);
      if (best === undefined || !atLeast(best.value, value)) {
        best = { action, price, value };
      }
    }
  }
  return best === undefined ? undefined : pay(state, best.action, best.price);
}

/** 自動購入か控えめな自動購入を持っていれば、その働きで買えるだけ買う。 */
export function autoBuy(state: GameState): GameState {
  let current = state;
  for (let next = autoBuyOnce(current); next !== undefined; next = autoBuyOnce(current)) {
    current = next;
  }
  return current;
}

/**
 * 次に自動購入が起きるまでの秒数と、そのとき買うもの。起きなければ `undefined`。コインが値段と
 * {@link autoBuyReserve} の和に、purchase.ts の `perform` と同じく許容誤差の範囲で届いた時刻を返す（残すコインは生産の速さで
 * 決まり、次の購入まで変わらない）。和そのものに届く時刻にすると、刻んで進めたときだけ区切りの時点で早めに買えて
 * しまう。解放の前のものは、累計の生産量が解放の条件に許容誤差の範囲で届く時刻まで待つ。
 */
export function nextAutoBuy(
  state: GameState,
): { readonly seconds: number; readonly buy: Automated } | undefined {
  const rate = production(state);
  const reserve = autoBuyReserve(state);
  if (reserve === undefined || toNumber(rate) === 0) {
    return undefined;
  }
  let next: { readonly seconds: number; readonly buy: Automated } | undefined;
  for (const buy of automated) {
    const seconds = Math.max(
      toNumber(div(sub(toleranceFloor(add(buy.cost(state), reserve)), state.coins), rate)),
      toNumber(div(sub(toleranceFloor(buy.unlock(state)), state.totalEarned), rate)),
    );
    if (next === undefined || seconds < next.seconds) {
      next = { seconds, buy };
    }
  }
  return next;
}
