import type { Num } from "./num.ts";
import { ZERO, add, atLeast, mul, num, pow } from "./num.ts";
import type { GameState } from "./state.ts";

// 最小ゲームの値段・解放の条件・生産の規則。購入と時間の経過の規則は game.ts にあり、game.ts はここの公開する規則を
// そのまま公開する。

const COLLECTOR_BASE_COST = num(10);
const COLLECTOR_COST_GROWTH = num(1.15);
export const COLLECTOR_PRODUCTION: Num = num(1);
const FACTORY_BASE_COST = num(150);
const FACTORY_COST_GROWTH = num(1.2);
export const FACTORY_PRODUCTION: Num = num(10);
const MINT_BASE_COST = num(1e7);
const MINT_COST_GROWTH = num(1.1);
export const MINT_PRODUCTION: Num = num(30);
const UPGRADE_BASE_COST = num(8e5);
const UPGRADE_COST_GROWTH = num(1.55);
export const UPGRADE_MULTIPLIER: Num = num(1.25);

export const FACTORY_UNLOCK_EARNED: Num = num(100);
export const UPGRADE_UNLOCK_EARNED: Num = num(1.2e7);
export const MINT_UNLOCK_EARNED: Num = num(1.5e8);

export function collectorCost(state: GameState): Num {
  return mul(COLLECTOR_BASE_COST, pow(COLLECTOR_COST_GROWTH, state.collectors));
}

export function factoryCost(state: GameState): Num {
  return mul(FACTORY_BASE_COST, pow(FACTORY_COST_GROWTH, state.factories));
}

export function mintCost(state: GameState): Num {
  return mul(MINT_BASE_COST, pow(MINT_COST_GROWTH, state.mints));
}

export function upgradeCost(state: GameState): Num {
  return mul(UPGRADE_BASE_COST, pow(UPGRADE_COST_GROWTH, state.upgrades));
}

export function isFactoryUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, FACTORY_UNLOCK_EARNED);
}

/**
 * 造幣所を買えるようになるのに要る累計の生産量。造幣所を持っていれば 0。解放の条件が 5e7 だった版の保存は、今の条件に
 * 届かずに造幣所を持っていることがあり、持っている施設を買えなくしないため。
 */
export function mintUnlockEarned(state: GameState): Num {
  return state.mints > 0 ? ZERO : MINT_UNLOCK_EARNED;
}

export function isMintUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, mintUnlockEarned(state));
}

/** {@link mintUnlockEarned} の改良の版。解放の条件が 6e6 だった版の保存のため。 */
export const upgradeUnlockEarned = (state: GameState): Num =>
  state.upgrades > 0 ? ZERO : UPGRADE_UNLOCK_EARNED;

export function isUpgradeUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, upgradeUnlockEarned(state));
}

/** 改良の倍率を掛ける前の、施設の毎秒の生産量の和。 */
export function baseProduction(state: GameState): Num {
  return add(
    add(
      mul(COLLECTOR_PRODUCTION, num(state.collectors)),
      mul(FACTORY_PRODUCTION, num(state.factories)),
    ),
    mul(MINT_PRODUCTION, num(state.mints)),
  );
}

/** 毎秒のコインの生産量。 */
export function production(state: GameState): Num {
  return mul(baseProduction(state), pow(UPGRADE_MULTIPLIER, state.upgrades));
}
