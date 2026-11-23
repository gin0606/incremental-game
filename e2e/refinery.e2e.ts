import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

// 造幣所の後に解放される精錬所の、解放の表示と店の行。ほかの要素の解放は unlock.e2e.ts。

/**
 * 精錬所の解放の条件まであと 30 で、精錬所の値段 30000000 を持つ、採集機 10 台と工場 2 つ（毎秒 30）の保存データ
 * （保存形式の版 4。精錬所の数を持たない）を、開く時刻 `at(60_000)` に保存したもの。工場・改良・工具の支給・
 * 採集機の改修・造幣所は解放済み。
 */
const beforeRefineryUnlock = (autoBuyer: boolean): string =>
  JSON.stringify({
    version: 4,
    savedAt: at(60_000).getTime(),
    state: {
      coins: { sign: 1, layer: 0, mag: 30_000_000 },
      totalEarned: { sign: 1, layer: 0, mag: 449_999_970 },
      collectors: 10,
      factories: 2,
      mints: 0,
      upgrades: 0,
      autoBuyer,
      cautiousAutoBuyer: false,
    },
  });

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("精錬所が解放される前は店に並べず、解放されると次の交易所の条件を示して後ろに並べ、買うと精錬所の数と毎秒の生産が増える", async ({
  page,
}) => {
  await page.addInitScript(putSave, beforeRefineryUnlock(false));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("10");

  const label = page.locator('dt:text-is("次の解放")');
  const condition = page.locator('dt:text-is("次の解放") + dd');
  const mint = page.getByRole("button", { name: /^造幣所を買う/v });
  const refinery = page.getByRole("button", { name: /^精錬所を買う/v });
  await expect(condition).toHaveText(
    "精錬所: これまでに生産したコインが 450000000 に達すると解放（あと 30）",
  );
  await expect(page.locator("#refineries")).toHaveText("0");
  await expect(refinery).toBeHidden();
  // 精錬所の前に並ぶ最後の行（造幣所）の位置。
  const before = await mint.boundingBox();
  expect(before).not.toBeNull();

  // 毎秒 30 で残りの 30 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(label).toBeVisible();
  await expect(condition).toBeVisible();
  await expect(condition).toHaveText(
    "交易所: これまでに生産したコインが 750000000 に達すると解放（あと 300000000）",
  );
  await expect(refinery).toBeVisible();
  await expect(refinery).toHaveText("精錬所を買う（30000000 コイン）");
  await expect(refinery).toHaveAccessibleDescription("買うと毎秒の生産が 100 増える");
  await rendered(page);
  // 精錬所の行は、それまで並んでいた行の後ろに足され、造幣所のボタンは動かない。
  expect(await mint.boundingBox()).toStrictEqual(before);
  const added = await refinery.boundingBox();
  expect(added?.y ?? Number.NaN).toBeGreaterThan(before?.y ?? Number.NaN);

  await refinery.click();
  await expect(page.locator("#refineries")).toHaveText("1");
  await expect(page.locator("#mints")).toHaveText("0");
  await expect(page.locator("#production")).toHaveText("130");
});

test("自動購入を持っていれば、精錬所が解放された時刻に、値段に届いている精錬所を自動で買う", async ({
  page,
}) => {
  // 採集機 200 台・工場 100 台・造幣所 50・改良 20・採集機の改修 2 つ・工具の支給 2 つ（採集機 1 台が毎秒 4 × 1.5）で
  // 毎秒 3700 × 1.25^20（約 320923）。ほかの品物は、解放の前の交易所（40000000）と工場の連携（36000000）のほかはどれも
  // 2e8 より高く、手元の 30000000 では精錬所しか買えない。解放の条件まであと 100000 で、約 0.31 秒で届く。
  await page.addInitScript(
    putSave,
    JSON.stringify({
      version: 9,
      savedAt: at(60_000).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 30_000_000 },
        totalEarned: { sign: 1, layer: 0, mag: 449_900_000 },
        collectors: 200,
        factories: 100,
        mints: 50,
        refineries: 0,
        exchanges: 0,
        upgrades: 20,
        toolSupplies: 2,
        collectorUpgrades: 2,
        factoryLinks: 0,
        autoBuyer: true,
        cautiousAutoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#production")).toHaveText("320923");
  await expect(page.locator("#refineries")).toHaveText("0");

  // 2 つ目（32400000）には、この後 98 秒ほど届かない。
  await page.clock.runFor(1000);
  await expect(page.locator("#refineries")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("329597");
});
