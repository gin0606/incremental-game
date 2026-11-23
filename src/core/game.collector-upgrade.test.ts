import { expect, test } from "vitest";

import type { GameState } from "./game.ts";
import {
  COLLECTOR_UPGRADE_UNLOCK_EARNED,
  advance,
  collectorProduction,
  collectorUpgradeCost,
  collectorUpgradeUnlockEarned,
  initialState,
  isCollectorUpgradeUnlocked,
  perform,
  priceOf,
  production,
  withPurchase,
} from "./game.ts";
import { mul, num, toNumber } from "./num.ts";

// 改良と造幣所の間に解放される採集機の改修の値段、生産への効き方、解放の条件と、自動購入がそれを買う規則。

const state = (overrides: Partial<GameState>): GameState => ({ ...initialState, ...overrides });

test.each([
  { collectorUpgrades: 0, expected: 5e6 },
  { collectorUpgrades: 1, expected: 4e7 },
  { collectorUpgrades: 3, expected: 5e6 * 8 ** 3 },
] as const)(
  "採集機の改修の値段は 5e6 × 8^数（$collectorUpgrades）",
  ({ collectorUpgrades, expected }) => {
    expect(collectorUpgradeCost(state({ collectorUpgrades }))).toBeApprox(num(expected));
  },
);

test.each([
  { collectors: 3, factories: 2, collectorUpgrades: 0, upgrades: 0, expected: 23 },
  { collectors: 3, factories: 2, collectorUpgrades: 1, upgrades: 0, expected: 26 },
  { collectors: 3, factories: 2, collectorUpgrades: 3, upgrades: 0, expected: 44 },
  { collectors: 3, factories: 2, collectorUpgrades: 3, upgrades: 2, expected: 44 * 1.25 ** 2 },
  { collectors: 0, factories: 2, collectorUpgrades: 3, upgrades: 0, expected: 20 },
] as const)(
  "採集機の改修は 1 つごとに採集機の生産だけを 2 倍にし、その上に改良の倍率が掛かる（採集機 $collectors、工場 $factories、改修 $collectorUpgrades、改良 $upgrades）",
  ({ collectors, factories, collectorUpgrades, upgrades, expected }) => {
    expect(production(state({ collectors, factories, collectorUpgrades, upgrades }))).toBeApprox(
      num(expected),
    );
  },
);

test.each([
  { collectorUpgrades: 0, expected: 1 },
  { collectorUpgrades: 4, expected: 16 },
] as const)(
  "採集機 1 台の、改良の倍率を掛ける前の毎秒の生産は 2^改修の数（$collectorUpgrades）",
  ({ collectorUpgrades, expected }) => {
    expect(collectorProduction(state({ collectorUpgrades, upgrades: 3 }))).toBeApprox(
      num(expected),
    );
  },
);

test("採集機の改修は累計の生産量が解放の条件に達するまで解放されず、達すると解放される", () => {
  expect(
    isCollectorUpgradeUnlocked(
      state({ coins: num(1e7), totalEarned: mul(COLLECTOR_UPGRADE_UNLOCK_EARNED, num(0.9999)) }),
    ),
  ).toBe(false);
  expect(
    isCollectorUpgradeUnlocked(
      state({ coins: num(1e7), totalEarned: COLLECTOR_UPGRADE_UNLOCK_EARNED }),
    ),
  ).toBe(true);
});

test("採集機の改修は解放の前は値段が無く買えず、解放の後は値段を払って買える", () => {
  const locked = state({
    coins: num(6e6),
    totalEarned: mul(COLLECTOR_UPGRADE_UNLOCK_EARNED, num(0.9999)),
  });
  const unlocked = { ...locked, totalEarned: COLLECTOR_UPGRADE_UNLOCK_EARNED };

  expect(priceOf(locked, { type: "buyCollectorUpgrade" })).toBeUndefined();
  expect(perform(locked, { type: "buyCollectorUpgrade" })).toBeUndefined();
  expect(priceOf(unlocked, { type: "buyCollectorUpgrade" })).toBeApprox(num(5e6));
  expect(withPurchase(unlocked, { type: "buyCollectorUpgrade" })).toStrictEqual({
    ...unlocked,
    collectorUpgrades: 1,
  });
  const after = perform(unlocked, { type: "buyCollectorUpgrade" });
  expect(after?.collectorUpgrades).toBe(1);
  expect(after?.coins).toBeApprox(num(1e6));
});

test("造幣所を持っていれば、採集機の改修は解放の条件に届いていなくても解放されていて、買える", () => {
  // 造幣所の解放の条件が 5e7 だった版の保存は、採集機の改修の条件 7.5e7 に届かずに造幣所を持っていることがある。
  const owned = state({ coins: num(6e6), totalEarned: num(6e7), mints: 1 });

  expect(collectorUpgradeUnlockEarned(owned)).toStrictEqual(num(0));
  expect(isCollectorUpgradeUnlocked(owned)).toBe(true);
  expect(perform(owned, { type: "buyCollectorUpgrade" })?.collectorUpgrades).toBe(1);
  // 造幣所を持っていなければ、同じ累計でも解放されていない。
  expect(collectorUpgradeUnlockEarned({ ...owned, mints: 0 })).toStrictEqual(
    COLLECTOR_UPGRADE_UNLOCK_EARNED,
  );
  expect(isCollectorUpgradeUnlocked({ ...owned, mints: 0 })).toBe(false);
});

// 採集機 200 台（次は約 1.4e13）、工場 100 台（約 1.2e10）、改良 8 つ（約 2.67e7）で、毎秒 1200 × 1.25^8。採集機の改修
// （5e6）のほかは、テストの間に値段か解放の条件に届かない。
const MULTIPLIER = 1.25 ** 8;
const RATE = 1200 * MULTIPLIER;
/** 採集機の改修を 1 つ買った後の毎秒の生産。採集機 200 台の生産が 2 倍になる。 */
const RATE_AFTER = 1400 * MULTIPLIER;
/** 採集機の改修の解放の条件より `short` だけ少ない累計の生産量から始める。 */
const trial = (short: number, automation: Partial<GameState>): GameState =>
  state({
    totalEarned: num(toNumber(COLLECTOR_UPGRADE_UNLOCK_EARNED) - short),
    collectors: 200,
    factories: 100,
    upgrades: 8,
    ...automation,
  });

test("自動購入は、採集機の改修の値段に届いても、累計の生産量が解放の条件に届くまで買わず、届いた時刻に買う", () => {
  // コインは 5e6 / 毎秒の生産 ≈ 699 秒で値段に届くが、累計の生産量は 1e7 / 毎秒の生産 ≈ 1398 秒で解放の条件に届く。
  const start = trial(1e7, { autoBuyer: true });
  const unlockedAt = 1e7 / RATE;

  expect(advance(start, 1390).collectorUpgrades).toBe(0);
  const after = advance(start, 1410);
  expect(after.collectorUpgrades).toBe(1);
  // 解放の時刻のコイン 1e7 から 5e6 を払い、2 つ目（4e7）には届かない。
  expect(after.coins).toBeApprox(num(5e6 + (1410 - unlockedAt) * RATE_AFTER), 1e-6);
});

test("採集機の改修の解放の前後で区切っても、一度に進めたときと同じ時刻に採集機の改修を買う", () => {
  const start = trial(1e7, { autoBuyer: true });
  const once = advance(start, 1500);
  const split = advance(advance(start, 1000), 500);

  expect(split.collectorUpgrades).toBe(1);
  expect(split.collectorUpgrades).toBe(once.collectorUpgrades);
  expect(split.coins).toBeApprox(once.coins, 1e-6);
});

test("控えめな自動購入は、払った後も 600 秒分のコインが残るときに採集機の改修を買う", () => {
  // 値段 5e6 と、毎秒の生産の 600 秒分の和に約 1299 秒で届く。
  const start = trial(0, { cautiousAutoBuyer: true });
  const reachedAt = (5e6 + 600 * RATE) / RATE;

  expect(advance(start, reachedAt - 5).collectorUpgrades).toBe(0);
  const after = advance(start, reachedAt + 5);
  expect(after.collectorUpgrades).toBe(1);
  expect(after.coins).toBeApprox(num(600 * RATE + 5 * RATE_AFTER), 1e-6);
});

test("自動購入は、採集機の改修とそれより安い工場を買える額でも、値段あたりの増分が大きければ採集機の改修を買う", () => {
  // 採集機の改修は 5e6 で増分 200（採集機 200 台の生産。値段あたり 4e-5）、工場 56 台目は 150 × 1.2^55 ≈ 3.3e6 で
  // 増分 10（約 3e-6）。6e6 コインで採集機の改修を買うと、残りの 1e6 では工場に届かない。
  const after = advance(trial(0, { coins: num(6e6), factories: 55, autoBuyer: true }), 0);

  expect([after.collectorUpgrades, after.factories]).toStrictEqual([1, 55]);
  expect(after.coins).toBeApprox(num(1e6));
});

test("自動購入は、採集機の改修を持てば、採集機を改修の倍率を掛けた増分で工場と比べる", () => {
  // 採集機 101 台目は 10 × 1.15^100 ≈ 1.17e7 で、改修 4 つで増分 16（値段あたり約 1.37e-6）。工場 63 台目は
  // 150 × 1.2^62 ≈ 1.22e7 で増分 10（約 8.2e-7）。改修の倍率を掛けずに増分 1 で比べると工場を買う。1.3e7 コインでは
  // どちらか 1 つしか買えない。改良（約 1.5e8）と採集機の改修（2e10）は買えない。
  const after = advance(
    state({
      coins: num(1.3e7),
      totalEarned: num(1.3e7),
      collectors: 100,
      factories: 62,
      upgrades: 12,
      collectorUpgrades: 4,
      autoBuyer: true,
    }),
    0,
  );

  expect([after.collectors, after.factories]).toStrictEqual([101, 62]);
});

test.each([
  { factories: 44, expected: [0, 50] },
  { factories: 45, expected: [1, 45] },
] as const)(
  "自動購入は、採集機の改修の増分を、改修 1 つで倍になる採集機全体の生産で見積もる（工場 $factories 台との比べ方）",
  ({ factories, expected }) => {
    // 採集機の改修は 5e6 で増分 100（採集機 100 台の生産。値段あたり 2e-5）。工場 45 台目は 150 × 1.2^44 ≈ 4.59e5 で
    // 増分 10（約 2.18e-5）、46 台目は約 5.51e5（約 1.82e-5）で、どちらも 2 割以内の差。5.2e6 コインでは、工場を先に
    // 買うと採集機の改修に届かず、工場を 50 台目まで買う。採集機（約 1.17e7）と改良（約 2.67e7）は買えない。
    const after = advance(
      state({
        coins: num(5.2e6),
        totalEarned: COLLECTOR_UPGRADE_UNLOCK_EARNED,
        collectors: 100,
        factories,
        upgrades: 8,
        autoBuyer: true,
      }),
      0,
    );

    expect([after.collectorUpgrades, after.factories]).toStrictEqual(expected);
  },
);

/**
 * 造幣所 1 台を持ち、累計 6e7 が採集機の改修の解放の条件に届かない、造幣所の条件が 5e7 だった版の保存。採集機の改修
 * （5e6）のほかは、テストの間に値段に届かない（造幣所は 1.1e7、改良は約 2.67e7）。
 */
const mintOwner = state({
  totalEarned: num(6e7),
  collectors: 200,
  factories: 100,
  mints: 1,
  upgrades: 8,
  autoBuyer: true,
});

test("造幣所を持っていれば、自動購入は採集機の改修の解放の条件を待たずに、値段に届いた時刻に採集機の改修を買う", () => {
  const reachedAt = 5e6 / toNumber(production(mintOwner));
  const rateAfter = toNumber(production({ ...mintOwner, collectorUpgrades: 1 }));

  expect(advance(mintOwner, reachedAt - 5).collectorUpgrades).toBe(0);
  const after = advance(mintOwner, reachedAt + 5);
  expect(after.collectorUpgrades).toBe(1);
  expect(after.coins).toBeApprox(num(5 * rateAfter), 1e-6);
});

test("造幣所を持っていて採集機の改修の解放の条件の前に買うときも、一度に進めても区切って進めても同じ時刻に買う", () => {
  const once = advance(mintOwner, 900);
  const split = advance(advance(mintOwner, 600), 300);

  expect(split.collectorUpgrades).toBe(1);
  expect(split.collectorUpgrades).toBe(once.collectorUpgrades);
  expect(split.coins).toBeApprox(once.coins, 1e-9);
});
