import { expect, test } from "vitest";

import { num } from "../core/num.ts";
import type { Memory } from "./bot.ts";
import { botName, choose, isGenerator, purchaseRules } from "./bot.ts";
import type { Offer } from "./model.ts";
import { pick, seeded } from "./random.ts";

const offer = (id: string, cost: number, rateGain: number): Offer => ({
  id,
  cost: num(cost),
  rateGain: num(rateGain),
});

const memory: Memory = { rng: seeded(1), pending: undefined };

/** 安いが伸びの小さい a と、高いが値段あたりの伸びが大きい b。 */
const cheapSlow = offer("a", 10, 1);
const dearFast = offer("b", 100, 12);
const upgrade = offer("up", 1, 0);

const target = (
  rule: (typeof purchaseRules)[number],
  offers: readonly Offer[],
  rate: number,
): string | undefined => choose(rule, offers, num(rate), memory).target?.id;

test("購入規則の一覧", () => {
  expect(purchaseRules).toStrictEqual(["efficiency", "roi", "cheapest", "newest", "random"]);
});

test("生産量の増分が正の候補だけを生成器とみなす", () => {
  expect(isGenerator(cheapSlow)).toBe(true);
  expect(isGenerator(upgrade)).toBe(false);
  expect(isGenerator(offer("down", 1, -1))).toBe(false);
});

test("ボットの名前は購入規則とチェックインの予定をつなぐ", () => {
  expect(botName({ purchase: "roi", checkIn: { kind: "always" }, prestige: "never" })).toBe(
    "roi@always",
  );
  expect(
    botName({ purchase: "random", checkIn: { kind: "every", seconds: 600 }, prestige: "never" }),
  ).toBe("random@600s");
});

test.each([
  // a: 10/1 + 10/1 = 20、b: 100/12 + 100/1 ≈ 108
  { rate: 1, expected: "a" },
  // a: 10/1 + 10/1000 ≈ 10.01、b: 100/12 + 100/1000 ≈ 8.43
  { rate: 1000, expected: "b" },
  // 生産量が 0 なら値段 / 増分で比べる（a: 10、b: 8.33）
  { rate: 0, expected: "b" },
] as const)(
  "efficiency は値段 / 増分 + 値段 / 生産量が最小のものを選ぶ（生産量 $rate）",
  ({ rate, expected }) => {
    expect(target("efficiency", [upgrade, cheapSlow, dearFast], rate)).toBe(expected);
  },
);

test("roi は増分 / 値段が最大のものを選ぶ", () => {
  expect(target("roi", [upgrade, cheapSlow, dearFast], 1)).toBe("b");
  expect(target("roi", [offer("c", 10, 2), dearFast], 1)).toBe("c");
});

test("cheapest は生成器のうち最も安いものを選ぶ", () => {
  expect(target("cheapest", [dearFast, upgrade, cheapSlow], 1)).toBe("a");
});

test("newest は最後に解放された生成器を選ぶ", () => {
  expect(target("newest", [dearFast, cheapSlow, offer("c", 1000, 1), upgrade], 1)).toBe("c");
});

test.each(["efficiency", "roi", "cheapest"] as const)(
  "%s は同じ値の候補なら先のものを選ぶ",
  (rule) => {
    expect(target(rule, [offer("first", 10, 1), offer("second", 10, 1)], 1)).toBe("first");
  },
);

test.each(purchaseRules)("%s は生成器が無ければ何も選ばない", (rule) => {
  const choice = choose(rule, [upgrade], num(1), memory);

  expect(choice).toStrictEqual({ target: undefined, memory });
});

test("random は乱数で選び、選んだものを覚える", () => {
  const offers = [cheapSlow, dearFast, upgrade];
  const expected = pick(memory.rng, [cheapSlow, dearFast]);

  expect(choose("random", offers, num(1), memory)).toStrictEqual({
    target: expected.item,
    memory: { rng: expected.rng, pending: expected.item },
  });
});

test("random は覚えている候補が同じ値段で残っていれば選び直さない", () => {
  const remembered: Memory = { rng: seeded(1), pending: dearFast };

  expect(choose("random", [cheapSlow, dearFast], num(1), remembered)).toStrictEqual({
    target: dearFast,
    memory: remembered,
  });
});

test.each([
  { name: "が無くなっていれば", pending: offer("gone", 100, 12) },
  // 自動購入などボットの外で買われると、同じ候補の値段が上がる。
  { name: "の値段が変わっていれば", pending: offer("b", 90, 12) },
] as const)("random は覚えている候補$name選び直す", ({ pending }) => {
  const remembered: Memory = { rng: seeded(1), pending };
  const expected = pick(remembered.rng, [cheapSlow, dearFast]);

  expect(choose("random", [cheapSlow, dearFast], num(1), remembered)).toStrictEqual({
    target: expected.item,
    memory: { rng: expected.rng, pending: expected.item },
  });
});

test("random は生成器が無くなれば、覚えている候補を忘れる", () => {
  const remembered: Memory = { rng: seeded(1), pending: dearFast };

  expect(choose("random", [upgrade], num(1), remembered)).toStrictEqual({
    target: undefined,
    memory: { rng: remembered.rng, pending: undefined },
  });
});

test.each(["efficiency", "roi", "cheapest", "newest"] as const)(
  "%s は乱数も覚えていることも変えない",
  (rule) => {
    expect(choose(rule, [cheapSlow, dearFast], num(1), memory).memory).toBe(memory);
  },
);
