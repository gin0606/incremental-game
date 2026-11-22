import type { Num } from "./num.ts";
import {
  ZERO,
  add,
  atLeast,
  div,
  max,
  mul,
  num,
  pow,
  sub,
  toNumber,
  toleranceFloor,
} from "./num.ts";

import type { Action, GameState } from "./state.ts";

// 判定の仕組み（シミュレーター、指標のテスト）を確かめるための仮の最小ゲームの規則。状態と行動の型は state.ts にある。
//
// - 資源はコインの 1 つ。採集機・工場・造幣所がコインを毎秒生む。
// - 改良は、1 つごとにすべての施設の生産を UPGRADE_MULTIPLIER 倍にする。値段は施設と同じく数に対して指数的に伸びる。
// - 工場は、累計で稼いだコインが FACTORY_UNLOCK_EARNED に、改良は UPGRADE_UNLOCK_EARNED に、造幣所は
//   MINT_UNLOCK_EARNED に達すると解放される。造幣所は、持っていれば解放されている（mintUnlockEarned）。
// - 自動購入を買うと、採集機・工場・造幣所・改良を買える額に達するたびに自動で買う（放置できる間隔を伸ばす要素）。
//   買える額に達したもののうち、値段あたりの生産量の増分が大きいものから買う。
//
// 時間の経過は advance だけで進める。オフラインの経過も同じ関数で一度に計算する。

export type { Action, GameState } from "./state.ts";
export { initialState } from "./state.ts";

const COLLECTOR_BASE_COST = num(10);
const COLLECTOR_COST_GROWTH = num(1.15);
const COLLECTOR_PRODUCTION = num(1);
const FACTORY_BASE_COST = num(150);
const FACTORY_COST_GROWTH = num(1.2);
const FACTORY_PRODUCTION = num(10);
const MINT_BASE_COST = num(1e7);
const MINT_COST_GROWTH = num(1.1);
const MINT_PRODUCTION = num(30);
const UPGRADE_BASE_COST = num(4e5);
const UPGRADE_COST_GROWTH = num(1.6);
export const UPGRADE_MULTIPLIER: Num = num(1.25);

export const FACTORY_UNLOCK_EARNED: Num = num(100);
export const UPGRADE_UNLOCK_EARNED: Num = num(6e6);
export const MINT_UNLOCK_EARNED: Num = num(1.5e8);
export const AUTO_BUYER_COST: Num = num(3e5);

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

export function isUpgradeUnlocked(state: GameState): boolean {
  return atLeast(state.totalEarned, UPGRADE_UNLOCK_EARNED);
}

/** 改良の倍率を掛ける前の、施設の毎秒の生産量の和。 */
function baseProduction(state: GameState): Num {
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
  buyUpgrade: {
    price: (state) => (isUpgradeUnlocked(state) ? upgradeCost(state) : undefined),
    receive: (state) => ({ ...state, upgrades: state.upgrades + 1 }),
  },
  buyAutoBuyer: {
    price: (state) => (state.autoBuyer ? undefined : AUTO_BUYER_COST),
    receive: (state) => ({ ...state, autoBuyer: true }),
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
function pay(state: GameState, action: Action, amount: Num): GameState {
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

function produce(state: GameState, seconds: number): GameState {
  const produced = mul(production(state), num(seconds));
  return {
    ...state,
    coins: add(state.coins, produced),
    totalEarned: add(state.totalEarned, produced),
  };
}

/**
 * 自動購入が買うものと、その値段と解放の条件。値段は解放の前でも返す。造幣所と改良の値段は解放に要る累計の生産量
 * （{@link MINT_UNLOCK_EARNED}・{@link UPGRADE_UNLOCK_EARNED}）より安く、解放の前にコインが値段に届きうる。そのため、
 * 買う時刻は、コインが値段に届く時刻と、累計の生産量が解放の条件に届く時刻の遅いほうにする（{@link nextAutoBuy}）。
 * 累計の生産量もコインと同じ速さで増えるため、どちらの時刻も進め方によらない。
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
    gain: () => COLLECTOR_PRODUCTION,
    unlock: () => ZERO,
  },
  {
    action: { type: "buyFactory" },
    cost: factoryCost,
    gain: () => FACTORY_PRODUCTION,
    unlock: () => FACTORY_UNLOCK_EARNED,
  },
  {
    action: { type: "buyMint" },
    cost: mintCost,
    gain: () => MINT_PRODUCTION,
    unlock: mintUnlockEarned,
  },
  {
    action: { type: "buyUpgrade" },
    cost: upgradeCost,
    gain: (state) => mul(baseProduction(state), sub(UPGRADE_MULTIPLIER, num(1))),
    unlock: () => UPGRADE_UNLOCK_EARNED,
  },
];

/**
 * 自動購入が次に買った後の状態。買える額に達したもののうち、値段あたりの生産量の増分が最も大きいものを買う。
 * 同じ値（許容誤差の範囲）なら先のもの。買えるものが無ければ `undefined`。
 */
function autoBuyOnce(state: GameState): GameState | undefined {
  // 手元のコインが多いと何千回も買うため、買った後の生産量を求めず、増分を値段で割るだけで比べる。
  let best: { readonly action: Action; readonly price: Num; readonly value: Num } | undefined;
  for (const { action, gain } of automated) {
    const price = priceOf(state, action);
    if (price !== undefined && atLeast(state.coins, price)) {
      const value = div(gain(state), price);
      if (best === undefined || !atLeast(best.value, value)) {
        best = { action, price, value };
      }
    }
  }
  return best === undefined ? undefined : pay(state, best.action, best.price);
}

/** 自動購入を持っていれば、買えるだけ買う。 */
function autoBuy(state: GameState): GameState {
  if (!state.autoBuyer) {
    return state;
  }
  let current = state;
  for (let next = autoBuyOnce(current); next !== undefined; next = autoBuyOnce(current)) {
    current = next;
  }
  return current;
}

/**
 * 次に自動購入が起きるまでの秒数と、そのとき買うもの。起きなければ `undefined`。{@link perform} と同じく、コインが
 * 値段に許容誤差の範囲で届いた時刻を返す。値段そのものに届く時刻にすると、刻んで進めたときだけ区切りの時点で早めに
 * 買えてしまう。解放の前のものは、累計の生産量が解放の条件に許容誤差の範囲で届く時刻まで待つ。
 */
function nextAutoBuy(
  state: GameState,
): { readonly seconds: number; readonly buy: (typeof automated)[number] } | undefined {
  const rate = production(state);
  if (!state.autoBuyer || toNumber(rate) === 0) {
    return undefined;
  }
  let next: { readonly seconds: number; readonly buy: (typeof automated)[number] } | undefined;
  for (const buy of automated) {
    const seconds = Math.max(
      toNumber(div(sub(toleranceFloor(buy.cost(state)), state.coins), rate)),
      toNumber(div(sub(toleranceFloor(buy.unlock(state)), state.totalEarned), rate)),
    );
    if (next === undefined || seconds < next.seconds) {
      next = { seconds, buy };
    }
  }
  return next;
}

/**
 * `seconds` 秒が経った後の状態を返す。自動購入が起きる時刻ごとに区切って計算するため、
 * 一度に進めても細かく刻んで進めても、浮動小数点の誤差を除いて同じ結果になる。経過時間に上限はない。
 * ただし自動購入の時刻が区切りの端と丸め誤差の範囲で重なると、その購入が区切りの終わりに起きるか、次に進めた
 * 直後に起きるかは進め方で変わりうる。
 *
 * @throws {RangeError} `seconds` が負、NaN、または無限大のとき。
 */
export function advance(state: GameState, seconds: number): GameState {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`経過時間は 0 以上の有限の秒数で渡す: ${seconds}`);
  }
  // 次の自動購入までの時間は、手元のコインで買える分を買い終えた状態から測る。
  let current = autoBuy(state);
  let remaining = seconds;
  for (;;) {
    const next = nextAutoBuy(current);
    if (next === undefined || next.seconds > remaining) {
      return autoBuy(produce(current, remaining));
    }
    // 届いた時刻のコインは丸め誤差で額をわずかに下回りうるため、比べずに買う。届く時刻が区切りの終わりと
    // ちょうど重なるときも、この時刻に買う。ほかのものは届く前に買い終えているので、値段あたりの増分で選び直さない。
    const reached = produce(current, next.seconds);
    const { action, cost } = next.buy;
    current = autoBuy(pay(reached, action, cost(reached)));
    remaining -= next.seconds;
  }
}
