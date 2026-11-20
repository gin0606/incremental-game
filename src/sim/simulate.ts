import type { Num } from "../core/num.ts";
import { ZERO, atLeast, div, sub, toNumber } from "../core/num.ts";
import type { Bot, Memory } from "./bot.ts";
import { choose, isGenerator } from "./bot.ts";
import type { Model, Offer } from "./model.ts";
import { seeded } from "./random.ts";
import { MIN_WAIT, gathered, settingsProblem } from "./schedule.ts";

export interface Settings {
  /** 遊ぶ時間（秒）。 */
  readonly duration: number;
  /**
   * 刻み幅（秒）。一度に進める時間の上限。常に開いているボットは、狙う候補を買える時刻を今の生産量から見積もって
   * 進む。進めた区間の中で新要素が解放されたとき、または常に開いているボットが待つ候補を買えるようになったときは、
   * 区間を二分探索してその時刻に起きる。生産量が購入でだけ変わるゲームでは、結果は刻み幅によらない。advance の中で
   * 生産量や資源が購入なしに変わる（時間で変わる生産量、自動購入が資源を使うなど）と、選び直す時刻や買う機会が刻み幅に
   * 左右されうる。
   */
  readonly step: number;
  /** 資源量と生産量を記録する間隔（秒）。時刻 0 から記録し、終わりの時刻も記録する。 */
  readonly sampleEvery: number;
  /** ボットの乱数のシード。下位 32 ビットだけを使う。 */
  readonly seed: number;
}

/** その時刻の資源量と生産量。出来事の記録では、出来事の後の値。 */
export interface Point {
  readonly t: number;
  readonly resource: Num;
  readonly rate: Num;
}

/**
 * 時系列の 1 件。同じ時刻では、解放、記録、チェックイン、購入の順に並ぶ。購入で解放された要素は、その購入の直後に
 * 並ぶ。
 *
 * - `unlock`: 要素が解放された。時刻 0 には最初から解放されている要素を並べる。
 * - `sample`: `sampleEvery` ごとの記録。
 * - `checkIn`: `every` の予定のボットがゲームを開いた。常に開いているボットでは記録しない。
 * - `purchase`: ボットが買った。ゲームの中で自動で起きた購入は含まない。
 */
export type Entry =
  | (Point & { readonly kind: "unlock"; readonly id: string })
  | (Point & { readonly kind: "sample" })
  | (Point & { readonly kind: "checkIn" })
  | (Point & { readonly kind: "purchase"; readonly id: string });

export interface Run<S> {
  readonly bot: Bot;
  readonly settings: Settings;
  readonly timeline: readonly Entry[];
  /** 終わりの時刻の状態。 */
  readonly final: S;
}

/** 1 回の実行の途中の状態。{@link simulate} の中だけで使う。 */
class Simulation<S> {
  readonly #model: Model<S>;
  readonly #bot: Bot;
  readonly #settings: Settings;
  readonly #timeline: Entry[] = [];
  readonly #seen = new Set<string>();
  #state: S;
  #memory: Memory;
  #t = 0;
  /** 記録した回数。次の記録は `#samples × sampleEvery` 秒。 */
  #samples = 0;
  /** `every` の予定でゲームを開いた回数。次は `#checkIns × seconds` 秒。 */
  #checkIns = 0;
  /** 常に開いているボットが買える額に達するのを待つ候補。 */
  #awaited: readonly Offer[] = [];

  constructor(model: Model<S>, bot: Bot, settings: Settings) {
    this.#model = model;
    this.#bot = bot;
    this.#settings = settings;
    this.#state = model.initial;
    this.#memory = { rng: seeded(settings.seed), pending: undefined };
  }

  run(): Run<S> {
    const { duration, step, sampleEvery } = this.#settings;
    for (;;) {
      this.#recordUnlocks();
      // 記録・チェックイン・終わりの予定は、そろえた時刻に達してから扱う。新しい要素の解放などで、そろえた時刻より
      // 手前の、予定そのものの時刻に止まっても、予定を早めない。
      const planned = [duration, this.#samples * sampleEvery];
      const { checkIn } = this.#bot;
      const at = gathered(
        checkIn.kind === "every" ? [...planned, this.#checkIns * checkIn.seconds] : planned,
        duration,
      );
      const due = (time: number): boolean => time <= at && at <= this.#t;
      this.#recordSample(due);
      if (this.#t >= duration) {
        return {
          bot: this.#bot,
          settings: this.#settings,
          timeline: this.#timeline,
          final: this.#state,
        };
      }
      const scheduled = [duration, this.#samples * sampleEvery, this.#turn(due)];
      // 刻み幅の区切りは予定に含めず、最も早い予定より手前ならそこで止まるだけにする。区切りから測ると、そろえる
      // 予定の組が刻み幅で変わる。
      const next = this.#t + step;
      this.#advanceTo(next < Math.min(...scheduled) ? next : gathered(scheduled, duration));
    }
  }

  /**
   * 時刻 `wake` まで進める。途中で新しい要素が解放されるか、待つ候補を買えるようになるなら、その時刻までだけ進める。
   */
  #advanceTo(wake: number): void {
    const before = this.#state;
    const seconds = wake - this.#t;
    const after = this.#model.advance(before, seconds);
    if (!this.#wakesBot(after)) {
      this.#state = after;
      this.#t = wake;
      return;
    }
    // 解放された要素は解放されたままなので（Model.unlocked）、解放された時刻を二分探索で求める。待つ候補を買えるように
    // なる時刻も同じく求める。資源が途中で減る（ゲームの中の自動購入など）と買えるかどうかが区間の中で何度も切り替わり
    // うる。そのときはどの切り替わりを見つけるかが刻み幅に左右され、区間の終わりに買えなければ途中の機会を見逃す。
    // 探す範囲は時刻で持ち、見つけた時刻をそのまま使う（区間の終わりなら `wake` ちょうどになる）。
    const start = this.#t;
    let low = start;
    let high = { t: wake, state: after };
    for (let mid = (low + wake) / 2; low < mid && mid < high.t; mid = (low + high.t) / 2) {
      const state = this.#model.advance(before, mid - start);
      if (this.#wakesBot(state)) {
        high = { t: mid, state };
      } else {
        low = mid;
      }
    }
    this.#state = high.state;
    this.#t = high.t;
  }

  /** `state` で、新しい要素が解放されているか、待つ候補のどれかを買えるか。 */
  #wakesBot(state: S): boolean {
    return (
      this.#model.unlocked(state).some((id) => !this.#seen.has(id)) ||
      this.#awaited.some((offer) => this.#model.buy(state, offer.id) !== undefined)
    );
  }

  #point(): Point {
    return {
      t: this.#t,
      resource: this.#model.resource(this.#state),
      rate: this.#model.rate(this.#state),
    };
  }

  #recordUnlocks(): void {
    for (const id of this.#model.unlocked(this.#state)) {
      if (!this.#seen.has(id)) {
        this.#seen.add(id);
        this.#timeline.push({ kind: "unlock", id, ...this.#point() });
      }
    }
  }

  /** 記録の時刻なら、資源量と生産量を記録する。 */
  #recordSample(due: (time: number) => boolean): void {
    const { duration, sampleEvery } = this.#settings;
    if (due(this.#samples * sampleEvery) || this.#t >= duration) {
      this.#timeline.push({ kind: "sample", ...this.#point() });
      this.#samples += 1;
    }
  }

  /** 行動し、次に起きる時刻を返す。`every` の予定のボットは、チェックインの時刻が `due` のときだけ行動する。 */
  #turn(due: (time: number) => boolean): number {
    const { checkIn } = this.#bot;
    if (checkIn.kind === "always") {
      this.#awaited = this.#act();
      return this.#t + this.#waitFor(this.#awaited);
    }
    const next = this.#checkIns * checkIn.seconds;
    if (!due(next)) {
      return next;
    }
    this.#timeline.push({ kind: "checkIn", ...this.#point() });
    this.#act();
    this.#checkIns += 1;
    return this.#checkIns * checkIn.seconds;
  }

  /** 買えるだけ買い、買える額に達するのを待つ候補（生産量で効果を測れない候補と、選んだ生成器）を返す。 */
  #act(): readonly Offer[] {
    for (;;) {
      const offers = this.#model.offers(this.#state);
      if (!offers.some((offer) => !isGenerator(offer) && this.#purchase(offer.id))) {
        const choice = choose(
          this.#bot.purchase,
          offers,
          this.#model.rate(this.#state),
          this.#memory,
        );
        this.#memory = choice.memory;
        const { target } = choice;
        if (target === undefined || !this.#purchase(target.id)) {
          const others = offers.filter((offer) => !isGenerator(offer));
          return target === undefined ? others : [...others, target];
        }
        this.#memory = { ...this.#memory, pending: undefined };
      }
    }
  }

  #purchase(id: string): boolean {
    const next = this.#model.buy(this.#state, id);
    if (next === undefined) {
      return false;
    }
    this.#state = next;
    this.#timeline.push({ kind: "purchase", id, ...this.#point() });
    this.#recordUnlocks();
    return true;
  }

  /** `awaited` のどれかを買える額に達するまでの見積もりの秒数。 */
  #waitFor(awaited: readonly Offer[]): number {
    const rate = this.#model.rate(this.#state);
    if (atLeast(ZERO, rate)) {
      return Number.POSITIVE_INFINITY;
    }
    const resource = this.#model.resource(this.#state);
    // 見積もりが 0 以下の候補は、買える額に達しているのにモデルが買わせなかったもので、待っても買えるとは限らない。
    // ほかに待つ候補が無ければ（Math.min が Infinity）、刻み幅だけ進んで見直す。
    const seconds = awaited
      .map((offer) => toNumber(div(sub(offer.cost, resource), rate)))
      .filter((wait) => wait > 0);
    return Math.max(Math.min(...seconds), MIN_WAIT);
  }
}

/**
 * `bot` に `model` のゲームを `settings.duration` 秒遊ばせる。乱数は `settings.seed` だけから作り、同じ入力からは
 * 同じ結果を返す。ボットが行動するのは時刻 0 以上 `duration` 未満。
 *
 * @throws {RangeError} {@link settingsProblem} が理由を返す設定のとき。
 */
export function simulate<S>(model: Model<S>, bot: Bot, settings: Settings): Run<S> {
  const problem = settingsProblem(bot, settings);
  if (problem !== undefined) {
    throw new RangeError(problem);
  }
  return new Simulation(model, bot, settings).run();
}
