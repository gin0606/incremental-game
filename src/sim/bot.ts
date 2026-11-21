import type { Num } from "../core/num.ts";
import { ZERO, add, approxEqual, atLeast, div, sub } from "../core/num.ts";
import type { Offer } from "./model.ts";
import type { Rng } from "./random.ts";
import { pick } from "./random.ts";

/**
 * 次に買う生成器（生産量を増やす候補）の選び方。選んだ候補は、買える額に達するまで待って買い、その間はほかの
 * 生成器を買わない。
 *
 * - `efficiency`: efficiency score（値段 / 生産量の増分 + 値段 / 今の生産量）が最小のもの。Demaine ほか
 *   "Cookie Clicker"（arXiv:1808.07540）の Definition 2.1 と §2.4.2 の貪欲法で、最適に近いとされる。
 *   今の生産量が 0 なら、値段 / 生産量の増分で比べる。
 * - `roi`: 生産量の増分 / 値段が最大のもの（同論文 §2.4.2 の natural greedy）。
 * - `cheapest`: 最も安いもの。
 * - `expensive`: 最も高いもの。
 * - `newest`: 候補にある生成器のうち、最後に解放されたものだけを買う。
 * - `random`: 等しい確率で選ぶ。選んだものを買うか、候補から消えるか、値段が変わる（自動購入などボットの外で
 *   買われた）まで選び直さない（待つ間に何度選び直したかで結果が変わらないように）。
 *
 * どれも、同じ値の候補が並んだら先に解放されたものを選ぶ。
 */
export type PurchaseRule = "efficiency" | "roi" | "cheapest" | "expensive" | "newest" | "random";

export const purchaseRules: readonly PurchaseRule[] = [
  "efficiency",
  "roi",
  "cheapest",
  "expensive",
  "newest",
  "random",
];

/** いつゲームを開くか。`always` は常に開いている。`every` は時刻 0 から `seconds` 秒ごとに開く。 */
export type CheckIn =
  | { readonly kind: "always" }
  | { readonly kind: "every"; readonly seconds: number };

/** プレステージの規則。プレステージの仕組みがまだ無いため、しない規則だけを置く。 */
export type PrestigeRule = "never";

/**
 * ボット。ゲームを開いている時刻に、生産量で効果を測れない購入（自動購入など、生産量の増分が 0 の候補）を
 * 買える額に達していれば先に買い、次に購入規則で選んだ生成器を買えるだけ買う。
 */
export interface Bot {
  readonly purchase: PurchaseRule;
  readonly checkIn: CheckIn;
  readonly prestige: PrestigeRule;
}

/** ボットの名前。`efficiency@always`、`roi@600s` のように、購入規則とチェックインの予定を `@` でつなぐ。 */
export function botName(bot: Bot): string {
  const checkIn = bot.checkIn.kind === "always" ? "always" : `${bot.checkIn.seconds}s`;
  return `${bot.purchase}@${checkIn}`;
}

/** ボットが覚えていること。 */
export interface Memory {
  readonly rng: Rng;
  /** `random` の規則で選んだまま、まだ買っていない候補と、選んだときの値段。 */
  readonly pending: Offer | undefined;
}

export const isGenerator = (offer: Offer): boolean => !atLeast(ZERO, offer.rateGain);

/** `score` が最小の候補。同じ値（許容誤差の範囲）なら先のもの。 */
const minBy = (offers: readonly Offer[], score: (offer: Offer) => Num): Offer | undefined => {
  let best: { readonly offer: Offer; readonly score: Num } | undefined;
  for (const offer of offers) {
    const value = score(offer);
    if (best === undefined || !atLeast(value, best.score)) {
      best = { offer, score: value };
    }
  }
  return best?.offer;
};

/** `score` が最大の候補。同じ値（許容誤差の範囲）なら先のもの。 */
const maxBy = (offers: readonly Offer[], score: (offer: Offer) => Num): Offer | undefined =>
  minBy(offers, (offer) => sub(ZERO, score(offer)));

const efficiency = (offer: Offer, rate: Num): Num => {
  const perGain = div(offer.cost, offer.rateGain);
  return atLeast(ZERO, rate) ? perGain : add(perGain, div(offer.cost, rate));
};

/** 選んだ候補と、選んだ後に覚えていること。 */
export interface Choice {
  readonly target: Offer | undefined;
  readonly memory: Memory;
}

type Chooser = (generators: readonly Offer[], rate: Num, memory: Memory) => Choice;

const choosers: Readonly<Record<PurchaseRule, Chooser>> = {
  efficiency: (generators, rate, memory) => ({
    target: minBy(generators, (offer) => efficiency(offer, rate)),
    memory,
  }),
  roi: (generators, _rate, memory) => ({
    target: minBy(generators, (offer) => div(offer.cost, offer.rateGain)),
    memory,
  }),
  cheapest: (generators, _rate, memory) => ({
    target: minBy(generators, (offer) => offer.cost),
    memory,
  }),
  expensive: (generators, _rate, memory) => ({
    target: maxBy(generators, (offer) => offer.cost),
    memory,
  }),
  newest: (generators, _rate, memory) => ({ target: generators.at(-1), memory }),
  random: (generators, _rate, memory) => {
    const { pending } = memory;
    if (generators.length === 0) {
      return { target: undefined, memory: { ...memory, pending: undefined } };
    }
    const kept = generators.find(
      (offer) => offer.id === pending?.id && approxEqual(offer.cost, pending.cost),
    );
    if (kept !== undefined) {
      return { target: kept, memory };
    }
    const { item, rng } = pick(memory.rng, generators);
    return { target: item, memory: { rng, pending: item } };
  },
};

/**
 * 次に買う生成器を `rule` で選ぶ。生成器が無ければ `undefined`。
 *
 * @param rate 今の毎秒の生産量。
 */
export function choose(
  rule: PurchaseRule,
  offers: readonly Offer[],
  rate: Num,
  memory: Memory,
): Choice {
  return choosers[rule](
    offers.filter((offer) => isGenerator(offer)),
    rate,
    memory,
  );
}
