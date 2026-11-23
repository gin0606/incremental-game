import type { Num } from "./num.ts";
import { ZERO, add, atLeast, mul, num, pow } from "./num.ts";
import type { GameState } from "./state.ts";

// 最小ゲームの値段・解放の条件・生産の規則。購入の規則は purchase.ts と auto-buy.ts、時間の経過の規則は game.ts にあり、
// ここの規則のうち画面などが使うものは game.ts から公開する。

const COLLECTOR_BASE_COST = num(10);
const COLLECTOR_COST_GROWTH = num(1.15);
const COLLECTOR_PRODUCTION = num(1);
const FACTORY_BASE_COST = num(150);
const FACTORY_COST_GROWTH = num(1.2);
export const FACTORY_PRODUCTION: Num = num(10);
const MINT_BASE_COST = num(1e7);
const MINT_COST_GROWTH = num(1.1);
export const MINT_PRODUCTION: Num = num(30);
const REFINERY_BASE_COST = num(3e7);
const REFINERY_COST_GROWTH = num(1.08);
export const REFINERY_PRODUCTION: Num = num(100);
const EXCHANGE_BASE_COST = num(4e7);
const EXCHANGE_COST_GROWTH = num(1.06);
export const EXCHANGE_PRODUCTION: Num = num(300);
const UPGRADE_BASE_COST = num(8e5);
const UPGRADE_COST_GROWTH = num(1.55);
export const UPGRADE_MULTIPLIER: Num = num(1.25);
const COLLECTOR_UPGRADE_BASE_COST = num(5e6);
const COLLECTOR_UPGRADE_COST_GROWTH = num(8);
export const COLLECTOR_UPGRADE_MULTIPLIER: Num = num(2);

export const FACTORY_UNLOCK_EARNED: Num = num(100);
export const UPGRADE_UNLOCK_EARNED: Num = num(1.2e7);
export const COLLECTOR_UPGRADE_UNLOCK_EARNED: Num = num(7.5e7);
export const MINT_UNLOCK_EARNED: Num = num(1.3e8);
export const REFINERY_UNLOCK_EARNED: Num = num(4.5e8);
export const EXCHANGE_UNLOCK_EARNED: Num = num(7.5e8);

export function collectorCost(state: GameState): Num {
  return mul(COLLECTOR_BASE_COST, pow(COLLECTOR_COST_GROWTH, state.collectors));
}

export function factoryCost(state: GameState): Num {
  return mul(FACTORY_BASE_COST, pow(FACTORY_COST_GROWTH, state.factories));
}

export function mintCost(state: GameState): Num {
  return mul(MINT_BASE_COST, pow(MINT_COST_GROWTH, state.mints));
}

export function refineryCost(state: GameState): Num {
  return mul(REFINERY_BASE_COST, pow(REFINERY_COST_GROWTH, state.refineries));
}

export function exchangeCost(state: GameState): Num {
  return mul(EXCHANGE_BASE_COST, pow(EXCHANGE_COST_GROWTH, state.exchanges));
}

export function upgradeCost(state: GameState): Num {
  return mul(UPGRADE_BASE_COST, pow(UPGRADE_COST_GROWTH, state.upgrades));
}

export function collectorUpgradeCost(state: GameState): Num {
  return mul(
    COLLECTOR_UPGRADE_BASE_COST,
    pow(COLLECTOR_UPGRADE_COST_GROWTH, state.collectorUpgrades),
  );
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

/**
 * 採集機の改修を買えるようになるのに要る累計の生産量。造幣所を持っていれば 0。造幣所の解放の条件が 5e7 だった版の保存は、
 * 採集機の改修の条件に届かずに造幣所を持っていることがある。そのまま読むと、後から解放される採集機の改修の行が店で
 * 造幣所の行より前に足され、並んでいた行が動く（docs/design/shop-focus.md）。
 */
export function collectorUpgradeUnlockEarned(state: GameState): Num {
  return state.mints > 0 ? ZERO : COLLECTOR_UPGRADE_UNLOCK_EARNED;
}

export function isCollectorUpgradeUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, collectorUpgradeUnlockEarned(state));
}

export function isRefineryUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, REFINERY_UNLOCK_EARNED);
}

export function isExchangeUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, EXCHANGE_UNLOCK_EARNED);
}

/** {@link mintUnlockEarned} の改良の版。解放の条件が 6e6 だった版の保存のため。 */
export const upgradeUnlockEarned = (state: GameState): Num =>
  state.upgrades > 0 ? ZERO : UPGRADE_UNLOCK_EARNED;

export function isUpgradeUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, upgradeUnlockEarned(state));
}

/** 採集機 1 台の、改良の倍率を掛ける前の毎秒の生産量。採集機の改修の倍率を含む。 */
export function collectorProduction(state: GameState): Num {
  return mul(COLLECTOR_PRODUCTION, pow(COLLECTOR_UPGRADE_MULTIPLIER, state.collectorUpgrades));
}

/** 改良の倍率を掛ける前の、施設の毎秒の生産量の和。 */
export function baseProduction(state: GameState): Num {
  return add(
    add(
      mul(collectorProduction(state), num(state.collectors)),
      mul(FACTORY_PRODUCTION, num(state.factories)),
    ),
    add(
      add(mul(MINT_PRODUCTION, num(state.mints)), mul(REFINERY_PRODUCTION, num(state.refineries))),
      mul(EXCHANGE_PRODUCTION, num(state.exchanges)),
    ),
  );
}

/** 毎秒のコインの生産量。 */
export function production(state: GameState): Num {
  return mul(baseProduction(state), pow(UPGRADE_MULTIPLIER, state.upgrades));
}
