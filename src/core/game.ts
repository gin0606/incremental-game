import { add, mul, num } from "./num.ts";

import { autoBuy, nextAutoBuy } from "./auto-buy.ts";
import { production } from "./economy.ts";
import { pay } from "./purchase.ts";
import type { GameState } from "./state.ts";

// 判定の仕組み（シミュレーター、指標のテスト）を確かめるための仮の最小ゲームの規則。値段・解放の条件・生産は
// economy.ts、行動ごとの値段と支払いは purchase.ts、自動購入が買うものと時刻は auto-buy.ts、状態と行動の型は
// state.ts にある。ここは時間の経過を受け持ち、ほかのファイルの規則のうち画面などが使うものを公開する。
//
// - 資源はコインの 1 つ。採集機・工場・造幣所・精錬所がコインを毎秒生む。
// - 改良は、1 つごとにすべての施設の生産を UPGRADE_MULTIPLIER 倍にする。値段は施設と同じく数に対して指数的に伸びる。
// - 工場・改良・造幣所・精錬所は、累計で稼いだコインがそれぞれの解放の条件（economy.ts の `*_UNLOCK_EARNED`）に
//   達すると解放される。造幣所と改良は、持っていれば解放されている（mintUnlockEarned・upgradeUnlockEarned）。
// - 自動購入を買うと、採集機・工場・造幣所・精錬所・改良を買える額に達するたびに自動で買う（放置できる間隔を伸ばす要素）。
//   買える額に達したもののうち、値段あたりの生産量の増分が大きいものから買う。
// - 控えめな自動購入は、自動購入より安く、同じものを、払った後も今の生産の CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS 秒分の
//   コインが手元に残るときだけ買う。自動化を 2 段に分け、先に手に入る段は、値段に届けば買うプレイヤーの手元には
//   ふつうそれだけのコインが貯まらないので店を見ている間はほとんど働かず、離れている間に買う。それより長く貯めて
//   いるプレイヤー（自動購入のためなど）の貯金は、その間に買う分だけ増えにくくなる。
//   自動購入を持てば、控えめな自動購入の働きは自動購入の働きに含まれる。
//
// 時間の経過は advance だけで進める。オフラインの経過も同じ関数で一度に計算する。

export type { Action, GameState } from "./state.ts";
export { initialState } from "./state.ts";

export {
  FACTORY_UNLOCK_EARNED,
  MINT_UNLOCK_EARNED,
  REFINERY_UNLOCK_EARNED,
  EXCHANGE_UNLOCK_EARNED,
  UPGRADE_MULTIPLIER,
  UPGRADE_UNLOCK_EARNED,
  collectorCost,
  exchangeCost,
  factoryCost,
  isExchangeUnlocked,
  isFactoryUnlocked,
  isMintUnlocked,
  isRefineryUnlocked,
  isUpgradeUnlocked,
  mintCost,
  mintUnlockEarned,
  production,
  refineryCost,
  upgradeCost,
  upgradeUnlockEarned,
} from "./economy.ts";
export {
  AUTO_BUYER_COST,
  CAUTIOUS_AUTO_BUYER_COST,
  perform,
  priceOf,
  withPurchase,
} from "./purchase.ts";
export { CAUTIOUS_AUTO_BUYER_RESERVE_SECONDS } from "./auto-buy.ts";

function produce(state: GameState, seconds: number): GameState {
  const produced = mul(production(state), num(seconds));
  return {
    ...state,
    coins: add(state.coins, produced),
    totalEarned: add(state.totalEarned, produced),
  };
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
