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
const FACTORY_PRODUCTION = num(10);
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
const FACTORY_LINK_BASE_COST = num(3.6e7);
const FACTORY_LINK_COST_GROWTH = num(8);
/** 工場の連携 1 つが、持っている工場 1 台につき、工場 1 台の生産に足す割合。 */
export const FACTORY_LINK_RATE: Num = num(0.01);
const TOOL_SUPPLY_BASE_COST = num(2.2e6);
const TOOL_SUPPLY_COST_GROWTH = num(10);
/** 工具の支給 1 つが、持っている工場 1 台につき、採集機 1 台の生産に足す割合。 */
export const TOOL_SUPPLY_RATE: Num = num(0.0025);

export const FACTORY_UNLOCK_EARNED: Num = num(100);
export const UPGRADE_UNLOCK_EARNED: Num = num(1.2e7);
export const COLLECTOR_UPGRADE_UNLOCK_EARNED: Num = num(7.5e7);
export const MINT_UNLOCK_EARNED: Num = num(2e8);
export const REFINERY_UNLOCK_EARNED: Num = num(4.5e8);
export const EXCHANGE_UNLOCK_EARNED: Num = num(7.5e8);
export const FACTORY_LINK_UNLOCK_EARNED: Num = num(1.05e9);
// 工具の支給を買う規則と自動購入がそれを買う規則がそろうまでは、届かない値にして解放しない。
export const TOOL_SUPPLY_UNLOCK_EARNED: Num = num(1e300);

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

export function factoryLinkCost(state: GameState): Num {
  return mul(FACTORY_LINK_BASE_COST, pow(FACTORY_LINK_COST_GROWTH, state.factoryLinks));
}

export function toolSupplyCost(state: GameState): Num {
  return mul(TOOL_SUPPLY_BASE_COST, pow(TOOL_SUPPLY_COST_GROWTH, state.toolSupplies));
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

export function isFactoryLinkUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, FACTORY_LINK_UNLOCK_EARNED);
}

export function isToolSupplyUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, TOOL_SUPPLY_UNLOCK_EARNED);
}

/** {@link mintUnlockEarned} の改良の版。解放の条件が 6e6 だった版の保存のため。 */
export const upgradeUnlockEarned = (state: GameState): Num =>
  state.upgrades > 0 ? ZERO : UPGRADE_UNLOCK_EARNED;

export function isUpgradeUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, upgradeUnlockEarned(state));
}

/**
 * 採集機 1 台の、改良の倍率を掛ける前の毎秒の生産量。採集機の改修の倍率と、工具の支給の倍率を含む。工具の支給の倍率は、
 * 工具の支給 1 つごとに、持っている工場 1 台につき {@link TOOL_SUPPLY_RATE} を 1 に足したもの。
 */
export function collectorProduction(state: GameState): Num {
  return mul(
    mul(COLLECTOR_PRODUCTION, pow(COLLECTOR_UPGRADE_MULTIPLIER, state.collectorUpgrades)),
    add(num(1), mul(TOOL_SUPPLY_RATE, mul(num(state.toolSupplies), num(state.factories)))),
  );
}

/** 改良の倍率を掛ける前の、採集機全体の毎秒の生産量。 */
export function collectorsProduction(state: GameState): Num {
  return mul(collectorProduction(state), num(state.collectors));
}

/**
 * 工場 1 台の、改良の倍率を掛ける前の毎秒の生産量。工場の連携 1 つごとに、持っている工場 1 台につき
 * {@link FACTORY_LINK_RATE} の割合が足される。
 */
export function factoryProduction(state: GameState): Num {
  return mul(
    FACTORY_PRODUCTION,
    add(num(1), mul(FACTORY_LINK_RATE, mul(num(state.factoryLinks), num(state.factories)))),
  );
}

/** 改良の倍率を掛ける前の、工場全体の毎秒の生産量。 */
export function factoriesProduction(state: GameState): Num {
  return mul(factoryProduction(state), num(state.factories));
}

/** 改良の倍率を掛ける前の、施設の毎秒の生産量の和。 */
export function baseProduction(state: GameState): Num {
  return add(
    add(collectorsProduction(state), factoriesProduction(state)),
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
