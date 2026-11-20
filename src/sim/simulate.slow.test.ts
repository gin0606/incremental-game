import { expect, test, vi } from "vitest";

import type { Num } from "../core/num.ts";
import { approxEqual } from "../core/num.ts";
import type { Bot } from "./bot.ts";
import { botName } from "./bot.ts";
import { minimalGame } from "./minimal-game.ts";
import { fastSet } from "./sets.ts";
import type { Entry, Settings } from "./simulate.ts";
import { simulate } from "./simulate.ts";

// 1 件の時間切れを広げる。最小ゲームを遊ばせるテストは 1 件 1 秒ほど（2026-11 に測って最長 1.2 秒）で終わるが、ほかの処理で機械が
// 混み合うと Vitest の既定の 5 秒を超え、結果と関係なく commit の検査が落ちた。時間切れは遅くなった実装を検出する
// ためのものではない（所要時間は src/sim/sets.ts の目安で見る）。
vi.setConfig({ testTimeout: 120_000 });

// 最小ゲームの 1 日分を速い組のボットで遊ばせ、シミュレーターの性質を確かめる。
const settings: Settings = { duration: 86_400, step: 60, sampleEvery: 3600, seed: 0 };

const cases: readonly { readonly name: string; readonly bot: Bot; readonly seed: number }[] =
  fastSet.map(({ bot, seed }) => ({ name: botName(bot), bot, seed }));

type Purchase = Extract<Entry, { readonly kind: "purchase" }>;
type Sample = Extract<Entry, { readonly kind: "sample" }>;
type Unlock = Extract<Entry, { readonly kind: "unlock" }>;

const ofKind = <K extends Entry["kind"]>(
  timeline: readonly Entry[],
  kind: K,
): readonly Extract<Entry, { readonly kind: K }>[] =>
  timeline.filter((entry): entry is Extract<Entry, { readonly kind: K }> => entry.kind === kind);

/** 同じ位置の 2 つの値がどれも `close` を満たすか。長さが違えば満たさない。 */
const pairwise = <T>(
  left: readonly T[],
  right: readonly T[],
  close: (a: T, b: T) => boolean,
): boolean =>
  left.length === right.length &&
  left.every((value, index) => {
    const other = right[index];
    return other !== undefined && close(value, other);
  });

const nearlySameNum = (a: Num, b: Num): boolean => approxEqual(a, b, 1e-6);

/** 同じ候補を、ほぼ同じ時刻（1 マイクロ秒以内）に買った。 */
const samePurchase = (a: Purchase, b: Purchase): boolean =>
  a.id === b.id && Math.abs(a.t - b.t) <= 1e-6;

/** 同じ時刻の記録で、資源量と生産量が相対誤差 1e-6 以内。 */
const sameSample = (a: Sample, b: Sample): boolean =>
  a.t === b.t && nearlySameNum(a.resource, b.resource) && nearlySameNum(a.rate, b.rate);

/** 同じ要素の解放を、ほぼ同じ時刻（1 マイクロ秒以内）に見つけた。 */
const sameUnlock = (a: Unlock, b: Unlock): boolean => a.id === b.id && Math.abs(a.t - b.t) <= 1e-6;

test.each(cases)("同じシードと入力からは完全に同じ結果になる（$name）", ({ bot, seed }) => {
  expect(simulate(minimalGame, bot, { ...settings, seed })).toStrictEqual(
    simulate(minimalGame, bot, { ...settings, seed }),
  );
});

test.each(cases)(
  "刻み幅を 10 倍にしても、購入・記録・解放は許容誤差内で一致する（$name）",
  ({ bot, seed }) => {
    const fine = simulate(minimalGame, bot, { ...settings, seed }).timeline;
    const coarse = simulate(minimalGame, bot, { ...settings, seed, step: 600 }).timeline;

    const purchases = ofKind(fine, "purchase");
    expect(purchases.length).toBeGreaterThan(0);
    expect(pairwise(purchases, ofKind(coarse, "purchase"), samePurchase)).toBe(true);
    expect(pairwise(ofKind(fine, "sample"), ofKind(coarse, "sample"), sameSample)).toBe(true);
    expect(pairwise(ofKind(fine, "unlock"), ofKind(coarse, "unlock"), sameUnlock)).toBe(true);
  },
);
