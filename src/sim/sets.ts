import type { Bot, CheckIn, PurchaseRule } from "./bot.ts";
import { purchaseRules } from "./bot.ts";

/** 1 回の実行で遊ばせるボットと、その乱数のシード。 */
export interface Trial {
  readonly bot: Bot;
  readonly seed: number;
}

/** `every` の予定でゲームを開く間隔（秒）: 1 分、10 分、1 時間、4 時間、8 時間。 */
export const checkInIntervals: readonly number[] = [60, 600, 3600, 14_400, 28_800];

const checkIns: readonly CheckIn[] = [
  { kind: "always" },
  ...checkInIntervals.map((seconds): CheckIn => ({ kind: "every", seconds })),
];

const trial = (purchase: PurchaseRule, checkIn: CheckIn, seed = 1): Trial => ({
  bot: { purchase, checkIn, prestige: "never" },
  seed,
});

/**
 * commit ごと（pre-commit）に回す速い組。最も良いとされる efficiency の規則をすべてのチェックインの予定で、
 * ほかの購入規則を常に開いている予定で遊ばせる。放置の許容間隔（常に開いているボットとの比較）と、選択の重み
 * （efficiency とほかの規則の比較）を測れる組で、測り方（src/sim/pace-settings.json）が使わない規則も遊ばせる。
 *
 * 所要時間の目安は、速い組が数秒、全組が数分以内。最小ゲームの 3 日分（刻み幅 1 分）を CLI で回すと、Node.js の起動を
 * 含めて速い組（10 回）が約 1.0 秒、全組（42 回）が約 2.6 秒だった（2026-11 時点、Apple M6）。expensive の規則を足した
 * 速い組（11 回）と全組（48 回）は、同じ機械で比べた CPU 時間がどちらも約 1 割多かった（2026-11-21）。ペースの指標の
 * テスト（src/sim/pace.slow.test.ts）は、組のほかに放置の指標のための実行（局面ごと・間隔ごと）と、刻み幅の守りのための
 * 2 つ目の刻み幅での実行を足すため長くなり、最小ゲームで速い組（11 回）が約 5 秒、全組（48 回）が約 9 秒（CPU 時間、
 * 2026-11-21）だった。ゲームを広げて目安を超えたら、組の分け方か刻み幅を見直す。
 */
export const fastSet: readonly Trial[] = [
  ...checkIns.map((checkIn) => trial("efficiency", checkIn)),
  ...purchaseRules
    .filter((purchase) => purchase !== "efficiency")
    .map((purchase) => trial(purchase, { kind: "always" })),
];

/** `random` の規則を遊ばせるシード。 */
export const randomSeeds: readonly number[] = [1, 2, 3];

/**
 * 取り込み前に回す全組。すべての購入規則とチェックインの予定の組み合わせで、`random` は {@link randomSeeds} の
 * それぞれで遊ばせる。
 */
export const fullSet: readonly Trial[] = purchaseRules.flatMap((purchase) =>
  checkIns.flatMap((checkIn) =>
    purchase === "random"
      ? randomSeeds.map((seed) => trial(purchase, checkIn, seed))
      : [trial(purchase, checkIn)],
  ),
);
