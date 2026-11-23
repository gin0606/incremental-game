import type { Num } from "./num.ts";
import { ZERO } from "./num.ts";

// ゲームの状態と行動の型、始めの状態。値段・生産・解放の規則は economy.ts、購入の規則は purchase.ts と auto-buy.ts、
// 時間の経過の規則は game.ts にある。

export interface GameState {
  readonly coins: Num;
  /** これまでに生産したコインの累計。購入で減らない。 */
  readonly totalEarned: Num;
  readonly collectors: number;
  readonly factories: number;
  readonly mints: number;
  readonly refineries: number;
  readonly exchanges: number;
  /** 改良の数。 */
  readonly upgrades: number;
  /** 採集機の改修の数。 */
  readonly collectorUpgrades: number;
  /** 工場の連携の数。 */
  readonly factoryLinks: number;
  /** 工具の支給の数。 */
  readonly toolSupplies: number;
  readonly autoBuyer: boolean;
  /** 控えめな自動購入を持つか。自動購入（`autoBuyer`）を持てば、その働きに含まれる。 */
  readonly cautiousAutoBuyer: boolean;
}

export type Action =
  | { readonly type: "buyCollector" }
  | { readonly type: "buyFactory" }
  | { readonly type: "buyMint" }
  | { readonly type: "buyRefinery" }
  | { readonly type: "buyExchange" }
  | { readonly type: "buyUpgrade" }
  | { readonly type: "buyCollectorUpgrade" }
  | { readonly type: "buyFactoryLink" }
  | { readonly type: "buyToolSupply" }
  | { readonly type: "buyAutoBuyer" }
  | { readonly type: "buyCautiousAutoBuyer" };

export const initialState: GameState = {
  coins: ZERO,
  totalEarned: ZERO,
  collectors: 1,
  factories: 0,
  mints: 0,
  refineries: 0,
  exchanges: 0,
  upgrades: 0,
  collectorUpgrades: 0,
  factoryLinks: 0,
  toolSupplies: 0,
  autoBuyer: false,
  cautiousAutoBuyer: false,
};
