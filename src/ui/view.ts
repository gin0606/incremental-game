import type { Action, GameState } from "../core/game.ts";
import {
  AUTO_BUYER_COST,
  FACTORY_UNLOCK_EARNED,
  collectorCost,
  factoryCost,
  isFactoryUnlocked,
  perform,
  production,
  withPurchase,
} from "../core/game.ts";
import type { Num, Rounding } from "../core/num.ts";
import { add, atLeast, div, format, num, sub, toNumber } from "../core/num.ts";

export interface ShopItem {
  readonly action: Action;
  readonly label: string;
  /** 買うと得られるもの。採集機と工場は増える毎秒の生産、自動購入は働き。 */
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
  readonly autoBuyer: string;
  /**
   * 次に何かを買えるまでの待ち時間。今買えるときと、生産が無くて届かないときは、その旨。時計が戻って生産が
   * 止まっている間は、そのことと、再開までの時間と、それを含めた待ち時間。
   */
  readonly nextPurchase: string;
  /** 次に解放される要素と、その条件と、条件までの残り。解放を待つ要素が無ければ `undefined`。 */
  readonly nextUnlock: string | undefined;
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
 * 品物ごとの、買うと得られるものの表示。自動購入の働きは、`src/core/game.ts` の自動購入の規則（何を、いつ買うか）を
 * 言葉にしたもので、規則を変えるときは合わせて直す。
 */
const effects: Readonly<Record<Action["type"], (state: GameState) => string>> = {
  buyCollector: (state) => productionGain(state, { type: "buyCollector" }),
  buyFactory: (state) => productionGain(state, { type: "buyFactory" }),
  buyMint: (state) => productionGain(state, { type: "buyMint" }),
  buyAutoBuyer: () => "採集機と工場を、買える額に達するたびに自動で買う",
};

/** 品物と、その値段。値段は、品物が見えていないとき（解放の前や買い終えた後）も求まる。 */
interface Offer {
  readonly item: ShopItem;
  readonly price: Num;
}

const offer = (
  state: GameState,
  action: Action,
  name: string,
  price: Num,
  visible: boolean,
): Offer => ({
  item: {
    action,
    label: `${name}を買う（${format(price, "up")} コイン）`,
    effect: effects[action.type](state),
    visible,
    affordable: perform(state, action) !== undefined,
  },
  price,
});

/**
 * 次に何かを買えるまでの表示。待ち時間は、見えている品物のうち最も安いものの値段に、手元のコインが今の毎秒の
 * 生産量で届くまでの秒数。生産量は何かを買うまで変わらず、自動購入が最初に買うのもその品物なので、待つ間の
 * 自動購入による支出は見積もりを変えない。生産が止まっている間（`pausedSeconds` が正）は、その秒数を足す。
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
  // 採集機はいつも見えているので、見えている品物は空にならない。
  const cheapest = offers
    .filter(({ item }) => item.visible)
    .map(({ price }) => price)
    .reduce((lowest, price) => (atLeast(price, lowest) ? lowest : price));
  const wait = div(sub(cheapest, state.coins), rate);
  if (pausedSeconds > 0) {
    const paused = num(pausedSeconds);
    return `時計が戻ったため生産が止まっている（再開まで約 ${formatDuration(paused, "up")}）。止まっている間を含めて約 ${formatDuration(add(paused, wait), "up")}`;
  }
  return `今の生産のままで約 ${formatDuration(wait, "up")}`;
}

/**
 * 次の解放の表示。条件の値と残りは切り上げ、表示した量を生産すれば解放されるようにする。
 */
function nextUnlock(state: GameState): string | undefined {
  if (isFactoryUnlocked(state)) {
    return undefined;
  }
  const remaining = sub(FACTORY_UNLOCK_EARNED, state.totalEarned);
  return `工場: これまでに生産したコインが ${format(FACTORY_UNLOCK_EARNED, "up")} に達すると解放（あと ${format(remaining, "up")}）`;
}

/** 状態 `state` の表示。`pausedSeconds` は、時計が戻って止めている生産を再開するまでの秒数。 */
export function view(state: GameState, pausedSeconds = 0): View {
  const offers = [
    offer(state, { type: "buyCollector" }, "採集機", collectorCost(state), true),
    offer(state, { type: "buyFactory" }, "工場", factoryCost(state), isFactoryUnlocked(state)),
    offer(state, { type: "buyAutoBuyer" }, "自動購入", AUTO_BUYER_COST, !state.autoBuyer),
  ];
  return {
    coins: format(state.coins),
    totalEarned: format(state.totalEarned),
    production: format(production(state)),
    collectors: state.collectors.toString(),
    factories: state.factories.toString(),
    autoBuyer: state.autoBuyer ? "稼働中" : "なし",
    nextPurchase: nextPurchase(state, offers, pausedSeconds),
    nextUnlock: nextUnlock(state),
    shop: offers.map(({ item }) => item),
  };
}
