import type { Num } from "../core/num.ts";

/**
 * シミュレーターから見たゲーム。ボットと時間の進め方（simulate.ts）はこの形だけを使い、ゲームの規則を知らない。
 * ゲームを変えたときは、この形に合わせる実装（minimal-game.ts など）を直す。
 *
 * 資源は、値段と生産量を測る主な資源の 1 つとして扱う。
 */
export interface Model<S> {
  readonly initial: S;
  /** `seconds` 秒が経った後の状態。オフラインの経過と同じ計算で、分けて進めても一度に進めても同じ結果になる。 */
  readonly advance: (state: S, seconds: number) => S;
  /** 今の状態で買える候補（解放済みで、買い終えていないもの）。額が足りないものも含む。解放された順に並べる。 */
  readonly offers: (state: S) => readonly Offer[];
  /**
   * `id` の候補を買った後の状態。額が足りない、候補に無いなどで買えなければ `undefined`。買った候補は、値段が上がるか
   * 候補から消える。ボットは、選んだ候補がボットの外（advance の中の自動購入など）で買われたことを値段の変化で知り、
   * 買えるだけ買うため同じ状態のまま何度でも買えると止まらない。
   */
  readonly buy: (state: S, id: string) => S | undefined;
  /** 手元の資源の量。 */
  readonly resource: (state: S) => Num;
  /** 毎秒の資源の生産量。 */
  readonly rate: (state: S) => Num;
  /**
   * 解放済みの要素の名前。解放された順に並べる。一度解放された要素は、時間が経っても購入しても解放されたままにする
   * （シミュレーターは、進めた区間の中で解放された時刻を二分探索で求める）。
   */
  readonly unlocked: (state: S) => readonly string[];
}

export interface Offer {
  readonly id: string;
  readonly cost: Num;
  /**
   * 買ったときに増える毎秒の生産量。0 以上。0 の候補（自動購入など）は、効果を生産量で測れない購入としてボットが
   * 別に扱う（bot.ts）。生産量を減らす候補はボットが買える額になり次第買ってしまうため、置かない。
   */
  readonly rateGain: Num;
}
