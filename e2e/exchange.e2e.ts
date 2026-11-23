import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

// 精錬所の後に解放される交易所の、解放の表示と店の行。ほかの要素の解放は unlock.e2e.ts・refinery.e2e.ts・
// factory-link.e2e.ts。

/**
 * 交易所の解放の条件まであと 30 で、交易所の値段 40000000 を持つ、採集機 10 台と工場 2 つ（毎秒 30）の保存データ
 * （保存形式の版 5。交易所の数を持たない）を、開く時刻 `at(60_000)` に保存したもの。工場・改良・採集機の改修・造幣所・
 * 精錬所は解放済みで、交易所の後の工場の連携は解放の前。
 */
const beforeExchangeUnlock = JSON.stringify({
  version: 5,
  savedAt: at(60_000).getTime(),
  state: {
    coins: { sign: 1, layer: 0, mag: 40_000_000 },
    totalEarned: { sign: 1, layer: 0, mag: 749_999_970 },
    collectors: 10,
    factories: 2,
    mints: 0,
    refineries: 0,
    upgrades: 0,
    autoBuyer: false,
    cautiousAutoBuyer: false,
  },
});

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("交易所が解放される前は店に並べず、解放されると次の工場の連携の条件を示して後ろに並べ、買うと交易所の数と毎秒の生産が増える", async ({
  page,
}) => {
  await page.addInitScript(putSave, beforeExchangeUnlock);
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("10");

  const condition = page.locator('dt:text-is("次の解放") + dd');
  const refinery = page.getByRole("button", { name: /^精錬所を買う/v });
  const exchange = page.getByRole("button", { name: /^交易所を買う/v });
  await expect(condition).toHaveText(
    "交易所: これまでに生産したコインが 750000000 に達すると解放（あと 30）",
  );
  await expect(page.locator("#exchanges")).toHaveText("0");
  await expect(exchange).toBeHidden();
  // 交易所の前に並ぶ最後の行（精錬所）の位置。
  const before = await refinery.boundingBox();
  expect(before).not.toBeNull();

  // 毎秒 30 で残りの 30 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(condition).toHaveText(
    "工場の連携: これまでに生産したコインが 1.05e9 に達すると解放（あと 300000000）",
  );
  await expect(exchange).toBeVisible();
  await expect(exchange).toHaveText("交易所を買う（40000000 コイン）");
  await expect(exchange).toHaveAccessibleDescription("買うと毎秒の生産が 300 増える");
  await rendered(page);
  // 交易所の行は、それまで並んでいた行の後ろに足され、精錬所のボタンは動かない。
  expect(await refinery.boundingBox()).toStrictEqual(before);
  const added = await exchange.boundingBox();
  expect(added?.y ?? Number.NaN).toBeGreaterThan(before?.y ?? Number.NaN);

  await exchange.click();
  await expect(page.locator("#exchanges")).toHaveText("1");
  await expect(page.locator("#refineries")).toHaveText("0");
  await expect(page.locator("#production")).toHaveText("330");
});

test("自動購入を持っていれば、交易所が解放された時刻に、値段に届いている交易所を自動で買う", async ({
  page,
}) => {
  // 採集機 200 台・工場 100 台・造幣所 50・精錬所 50・改良 20・採集機の改修 3 つで毎秒 9100 × 1.25^20（約 789299）。
  // ほかの品物は、解放の前の工場の連携（36000000、解放の条件 1.05e9）のほかはどれも 1e9 より高く、手元の 40000000
  // では交易所しか買えない。解放の条件まであと 100000 で、約 0.13 秒で届く。
  await page.addInitScript(
    putSave,
    JSON.stringify({
      version: 7,
      savedAt: at(60_000).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 40_000_000 },
        totalEarned: { sign: 1, layer: 0, mag: 749_900_000 },
        collectors: 200,
        factories: 100,
        mints: 50,
        refineries: 50,
        exchanges: 0,
        upgrades: 20,
        collectorUpgrades: 3,
        autoBuyer: true,
        cautiousAutoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#production")).toHaveText("789299");
  await expect(page.locator("#exchanges")).toHaveText("0");

  // 2 つ目（42400000）には、この後 52 秒ほど届かない。
  await page.clock.runFor(1000);
  await expect(page.locator("#exchanges")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("815320");
});
