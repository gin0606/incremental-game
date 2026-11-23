import type { Action, GameState } from "../core/game.ts";
import {
  CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS,
  COLLECTOR_UPGRADE_MULTIPLIER,
  FACTORY_LINK_RATE,
  UPGRADE_MULTIPLIER,
  production,
  withPurchase,
} from "../core/game.ts";
import { format, sub, toNumber } from "../core/num.ts";

// 店の品物ごとの、買うと得られるものの表示（docs/design/shop-effects.md）。店の並びと値段の表示は view.ts にある。

/** 買うと増える毎秒の生産の表示。切り捨てて、増えない分を増えるように見せない。 */
const productionGain = (state: GameState, action: Action): string =>
  `買うと毎秒の生産が ${format(sub(production(withPurchase(state, action)), production(state)))} 増える`;

/**
 * 品物ごとの、買うと得られるものの表示。自動購入と控えめな自動購入の働きは、`src/core/auto-buy.ts` の自動購入の規則
 * （何を、いつ買うか）を言葉にしたもので、規則を変えるときは合わせて直す。
 */
export const effects: Readonly<Record<Action["type"], (state: GameState) => string>> = {
  buyCollector: (state) => productionGain(state, { type: "buyCollector" }),
  buyFactory: (state) => productionGain(state, { type: "buyFactory" }),
  buyMint: (state) => productionGain(state, { type: "buyMint" }),
  buyRefinery: (state) => productionGain(state, { type: "buyRefinery" }),
  buyExchange: (state) => productionGain(state, { type: "buyExchange" }),
  buyUpgrade: (state) =>
    `${productionGain(state, { type: "buyUpgrade" })}（すべての施設の生産が ${toNumber(UPGRADE_MULTIPLIER)} 倍になる）`,
  buyCollectorUpgrade: (state) =>
    `${productionGain(state, { type: "buyCollectorUpgrade" })}（採集機の生産が ${toNumber(COLLECTOR_UPGRADE_MULTIPLIER)} 倍になる）`,
  buyFactoryLink: (state) =>
    `${productionGain(state, { type: "buyFactoryLink" })}（工場の生産が、持っている工場 1 台につき、連携の無いときの ${toNumber(FACTORY_LINK_RATE) * 100}% ずつ増える）`,
  buyAutoBuyer: () =>
    "採集機・工場・造幣所・精錬所・交易所・改良・採集機の改修・工場の連携を、買える額に達するたびに自動で買う",
  buyCautiousAutoBuyer: () =>
    `採集機・工場・造幣所・精錬所・交易所・改良・採集機の改修・工場の連携を、払った後も今の生産の ${CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS / 60} 分ぶんのコインが残るときに自動で買う`,
};
