import type { Action, GameState } from "../core/game.ts";
import {
  AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS,
  COLLECTOR_UPGRADE_MULTIPLIER,
  COLLECTOR_UPGRADE_UNLOCK_EARNED,
  EXCHANGE_UNLOCK_EARNED,
  FACTORY_LINK_RATE,
  FACTORY_LINK_UNLOCK_EARNED,
  FACTORY_UNLOCK_EARNED,
  MINT_UNLOCK_EARNED,
  REFINERY_UNLOCK_EARNED,
  UPGRADE_MULTIPLIER,
  UPGRADE_UNLOCK_EARNED,
  collectorCost,
  collectorUpgradeCost,
  collectorUpgradeUnlockEarned,
  exchangeCost,
  factoryCost,
  factoryLinkCost,
  isCollectorUpgradeUnlocked,
  isExchangeUnlocked,
  isFactoryLinkUnlocked,
  isFactoryUnlocked,
  isMintUnlocked,
  isRefineryUnlocked,
  isUpgradeUnlocked,
  mintCost,
  mintUnlockEarned,
  perform,
  priceOf,
  production,
  refineryCost,
  upgradeCost,
  upgradeUnlockEarned,
  withPurchase,
} from "../core/game.ts";
import type { Num, Rounding } from "../core/num.ts";
import { ZERO, add, atLeast, div, format, max, num, sub, toNumber } from "../core/num.ts";

export interface ShopItem {
  readonly action: Action;
  readonly label: string;
  /** 買うと得られるもの。自動購入と控えめな自動購入は働き、ほかの品物は増える毎秒の生産。 */
  readonly effect: string;
  /** 解放されていて、まだ買える（一度きりの品物を買い終えていない）。 */
  readonly visible: boolean;
  readonly affordable: boolean;
}

/** 画面に出す文字列と、ボタンの状態。 */
export interface View {
  readonly coins: string;
  readonly totalEarned: string;
  readonly production: string;
  readonly collectors: string;
  readonly factories: string;
  readonly mints: string;
  readonly refineries: string;
  readonly exchanges: string;
  readonly upgrades: string;
  readonly collectorUpgrades: string;
  readonly factoryLinks: string;
  readonly autoBuyer: string;
  /**
   * 次に何かを買えるまでの待ち時間。今買えるときと、生産が無くて届かないときは、その旨。時計が戻って生産が
   * 止まっている間は、そのことと、再開までの時間と、それを含めた待ち時間。
   */
  readonly nextPurchase: string;
  /** 次に解放される要素と、その条件と、条件までの残り。解放を待つ要素が無ければ、その旨。 */
  readonly nextUnlock: string;
  readonly shop: readonly ShopItem[];
}

const SECONDS_PER_DAY = 86_400;

/** これ以上の日数は、時間を付けずに日数だけを数の表記（{@link format}）で示す。 */
const LARGE_DAYS = 1e9;

const roundings: Readonly<Record<Rounding, (value: number) => number>> = {
  down: Math.trunc,
  up: Math.ceil,
};

/**
 * 時間の長さの表示。端数は `rounding` の方向へ丸める（待ち時間は切り上げて、表示した時間が経てば届くように
 * し、経った時間は切り捨てて、経っていない時間を経ったように見せない）。1 分未満は秒、1 時間未満は分と秒、
 * 1 日未満は時間と分、それ以上は日と時間で示す。
 */
export function formatDuration(seconds: Num, rounding: Rounding): string {
  const round = roundings[rounding];
  // format と同じく、丸める前に有効数字 12 桁に丸め、6.000…04 や 5.999…96 のような誤差で 1 秒ずらさない。
  const wholeSeconds = round(Number(toNumber(seconds).toPrecision(12)));
  if (wholeSeconds < 60) {
    return `${wholeSeconds} 秒`;
  }
  if (wholeSeconds < 3600) {
    return `${Math.floor(wholeSeconds / 60)} 分 ${wholeSeconds % 60} 秒`;
  }
  const minutes = round(wholeSeconds / 60);
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)} 時間 ${minutes % 60} 分`;
  }
  const hours = round(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days < LARGE_DAYS) {
    return `${days} 日 ${hours % 24} 時間`;
  }
  // number で表せない長さ（Infinity）もここへ来るため、日数は Num のまま求める。
  return `${format(div(seconds, num(SECONDS_PER_DAY)), rounding)} 日`;
}

/** 買うと増える毎秒の生産の表示。切り捨てて、増えない分を増えるように見せない。 */
const productionGain = (state: GameState, action: Action): string =>
  `買うと毎秒の生産が ${format(sub(production(withPurchase(state, action)), production(state)))} 増える`;

/**
 * 品物ごとの、買うと得られるものの表示。自動購入と控えめな自動購入の働きは、`src/core/auto-buy.ts` の自動購入の規則
 * （何を、いつ買うか）を言葉にしたもので、規則を変えるときは合わせて直す。
 */
const effects: Readonly<Record<Action["type"], (state: GameState) => string>> = {
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

/** 品物と、その値段。値段は、品物が見えていないとき（解放の前や買い終えた後）も求まる。 */
interface Offer {
  readonly item: ShopItem;
  readonly price: Num;
  /** これまでに生産したコインがこの量に達すると買えるようになる。買い終えて、もう買えなければ `undefined`。 */
  readonly unlock: Num | undefined;
}

const offer = (
  state: GameState,
  action: Action,
  name: string,
  price: Num,
  unlock: Num | undefined,
): Offer => ({
  item: {
    action,
    label: `${name}を買う（${format(price, "up")} コイン）`,
    effect: effects[action.type](state),
    visible: priceOf(state, action) !== undefined,
    affordable: perform(state, action) !== undefined,
  },
  price,
  unlock,
});

/**
 * 次に何かを買えるまでの表示。待ち時間は、品物ごとに手元のコインが値段に、これまでに生産したコインが解放の条件に、
 * どちらも今の毎秒の生産量で届くまでの秒数のうち最も短いもの。解放の前の品物も、待つ間に解放されて先に買えることが
 * あるため数える。生産量は何かを買うまで変わらず、自動購入が最初に買うのもその品物なので、待つ間の自動購入による
 * 支出は見積もりを変えない。生産が止まっている間（`pausedSeconds` が正）は、その秒数を足す。
 */
function nextPurchase(state: GameState, offers: readonly Offer[], pausedSeconds: number): string {
  // 買えるのは見えている品物だけ（解放の前や買い終えた後は買えない）。
  if (offers.some(({ item }) => item.affordable)) {
    return "今買える";
  }
  const rate = production(state);
  if (toNumber(rate) === 0) {
    return "生産が無いため届かない";
  }
  // これまでに生産したコインも手元のコインと同じ速さで増えるので、どちらの不足も同じ生産量で割る。採集機は
  // いつも買えるので、不足の一覧は空にならない。
  const shortest = offers
    .flatMap(({ price, unlock }) =>
      unlock === undefined ? [] : [max(sub(price, state.coins), sub(unlock, state.totalEarned))],
    )
    .reduce((lowest, shortfall) => (atLeast(shortfall, lowest) ? lowest : shortfall));
  const wait = div(shortest, rate);
  if (pausedSeconds > 0) {
    const paused = num(pausedSeconds);
    return `時計が戻ったため生産が止まっている（再開まで約 ${formatDuration(paused, "up")}）。止まっている間を含めて約 ${formatDuration(add(paused, wait), "up")}`;
  }
  return `今の生産のままで約 ${formatDuration(wait, "up")}`;
}

/** 後から解放される要素。解放される順に並べる。 */
const unlocks: readonly {
  readonly name: string;
  readonly earned: Num;
  readonly unlocked: (state: GameState) => boolean;
}[] = [
  { name: "工場", earned: FACTORY_UNLOCK_EARNED, unlocked: isFactoryUnlocked },
  { name: "改良", earned: UPGRADE_UNLOCK_EARNED, unlocked: isUpgradeUnlocked },
  {
    name: "採集機の改修",
    earned: COLLECTOR_UPGRADE_UNLOCK_EARNED,
    unlocked: isCollectorUpgradeUnlocked,
  },
  { name: "造幣所", earned: MINT_UNLOCK_EARNED, unlocked: isMintUnlocked },
  { name: "精錬所", earned: REFINERY_UNLOCK_EARNED, unlocked: isRefineryUnlocked },
  { name: "交易所", earned: EXCHANGE_UNLOCK_EARNED, unlocked: isExchangeUnlocked },
  { name: "工場の連携", earned: FACTORY_LINK_UNLOCK_EARNED, unlocked: isFactoryLinkUnlocked },
];

/**
 * 次の解放の表示。まだ解放されていない要素のうち最初のものを示す。条件の値と残りは切り上げ、表示した量を生産すれば
 * 解放されるようにする。すべて解放した後も行を消さずにその旨を示し、後に続く店の行の位置を変えない
 * （docs/design/next-unlock.md）。
 */
function nextUnlock(state: GameState): string {
  const next = unlocks.find(({ unlocked }) => !unlocked(state));
  if (next === undefined) {
    return "なし（すべて解放済み）";
  }
  const remaining = sub(next.earned, state.totalEarned);
  return `${next.name}: これまでに生産したコインが ${format(next.earned, "up")} に達すると解放（あと ${format(remaining, "up")}）`;
}

/** 自動購入の欄の表示。自動購入を持てば、控えめな自動購入も持っていても自動購入の働きだけを示す。 */
const autoBuyerStatus = (state: GameState): string => {
  if (state.autoBuyer) {
    return "稼働中";
  }
  return state.cautiousAutoBuyer ? "控えめに稼働中" : "なし";
};

/**
 * 店に並べる品物。品物を見え始める順（最初から見える採集機と 2 つの自動購入、続いて解放される順）に並べ、解放された
 * 品物の行を後ろに足して、既に並んでいる行を動かさない（docs/design/shop-focus.md）。
 */
const shopOffers = (state: GameState): readonly Offer[] => [
  offer(state, { type: "buyCollector" }, "採集機", collectorCost(state), ZERO),
  offer(
    state,
    { type: "buyAutoBuyer" },
    "自動購入",
    AUTO_BUYER_COST,
    state.autoBuyer ? undefined : ZERO,
  ),
  offer(
    state,
    { type: "buyCautiousAutoBuyer" },
    "控えめな自動購入",
    CAUTIOUS_AUTO_BUYER_COST,
    state.autoBuyer || state.cautiousAutoBuyer ? undefined : ZERO,
  ),
  offer(state, { type: "buyFactory" }, "工場", factoryCost(state), FACTORY_UNLOCK_EARNED),
  offer(state, { type: "buyUpgrade" }, "改良", upgradeCost(state), upgradeUnlockEarned(state)),
  offer(
    state,
    { type: "buyCollectorUpgrade" },
    "採集機の改修",
    collectorUpgradeCost(state),
    collectorUpgradeUnlockEarned(state),
  ),
  offer(state, { type: "buyMint" }, "造幣所", mintCost(state), mintUnlockEarned(state)),
  offer(state, { type: "buyRefinery" }, "精錬所", refineryCost(state), REFINERY_UNLOCK_EARNED),
  offer(state, { type: "buyExchange" }, "交易所", exchangeCost(state), EXCHANGE_UNLOCK_EARNED),
  offer(
    state,
    { type: "buyFactoryLink" },
    "工場の連携",
    factoryLinkCost(state),
    FACTORY_LINK_UNLOCK_EARNED,
  ),
];

/** 状態 `state` の表示。`pausedSeconds` は、時計が戻って止めている生産を再開するまでの秒数。 */
export function view(state: GameState, pausedSeconds = 0): View {
  const offers = shopOffers(state);
  return {
    coins: format(state.coins),
    totalEarned: format(state.totalEarned),
    production: format(production(state)),
    collectors: state.collectors.toString(),
    factories: state.factories.toString(),
    mints: state.mints.toString(),
    refineries: state.refineries.toString(),
    exchanges: state.exchanges.toString(),
    upgrades: state.upgrades.toString(),
    collectorUpgrades: state.collectorUpgrades.toString(),
    factoryLinks: state.factoryLinks.toString(),
    autoBuyer: autoBuyerStatus(state),
    nextPurchase: nextPurchase(state, offers, pausedSeconds),
    nextUnlock: nextUnlock(state),
    shop: offers.map(({ item }) => item),
  };
}
