import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

// 交易所の後に解放される工場の連携の、解放の表示と店の行。ほかの要素の解放は unlock.e2e.ts と exchange.e2e.ts。

/**
 * 工場の連携の解放の条件まであと 110 で、その値段 36000000 を持つ、採集機 10 台と工場 10 台（毎秒 110）の保存データ
 * （保存形式の版 7。工場の連携の数を持たない）を、開く時刻 `at(60_000)` に保存したもの。工場・改良・採集機の改修・
 * 造幣所・精錬所・交易所は解放済み。
 */
const beforeFactoryLinkUnlock = JSON.stringify({
  version: 7,
  savedAt: at(60_000).getTime(),
  state: {
    coins: { sign: 1, layer: 0, mag: 36_000_000 },
    totalEarned: { sign: 1, layer: 0, mag: 1_049_999_890 },
    collectors: 10,
    factories: 10,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    autoBuyer: false,
    cautiousAutoBuyer: false,
  },
});

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("工場の連携が解放される前は店に並べず、解放されると条件に替えてすべて解放したことを示して交易所の後ろに並べ、買うと工場の連携の数と毎秒の生産が増える", async ({
  page,
}) => {
  await page.addInitScript(putSave, beforeFactoryLinkUnlock);
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#factories")).toHaveText("10");

  const condition = page.locator('dt:text-is("次の解放") + dd');
  const exchange = page.getByRole("button", { name: /^交易所を買う/v });
  const factoryLink = page.getByRole("button", { name: /^工場の連携を買う/v });
  await expect(condition).toHaveText(
    "工場の連携: これまでに生産したコインが 1.05e9 に達すると解放（あと 110）",
  );
  await expect(page.locator("#factory-links")).toHaveText("0");
  await expect(factoryLink).toBeHidden();
  // 工場の連携の前に並ぶ最後の行（交易所）の位置。
  const before = await exchange.boundingBox();
  expect(before).not.toBeNull();

  // 毎秒 110 で残りの 110 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(condition).toHaveText("なし（すべて解放済み）");
  await expect(factoryLink).toBeVisible();
  await expect(factoryLink).toHaveText("工場の連携を買う（36000000 コイン）");
  // 工場 10 台がそれぞれ 10 × 0.01 × 10 = 1 ずつ増える。
  await expect(factoryLink).toHaveAccessibleDescription(
    "買うと毎秒の生産が 10 増える（工場の生産が、持っている工場 1 台につき、連携の無いときの 1% ずつ増える）",
  );
  await rendered(page);
  // 工場の連携の行は、それまで並んでいた行の後ろに足され、交易所のボタンは動かない。
  expect(await exchange.boundingBox()).toStrictEqual(before);
  const added = await factoryLink.boundingBox();
  expect(added?.y ?? Number.NaN).toBeGreaterThan(before?.y ?? Number.NaN);

  await factoryLink.click();
  await expect(page.locator("#factory-links")).toHaveText("1");
  await expect(page.locator("#factories")).toHaveText("10");
  await expect(page.locator("#production")).toHaveText("120");
});

test("自動購入を持っていれば、工場の連携が解放された時刻に、値段に届いている工場の連携を自動で買う", async ({
  page,
}) => {
  // 採集機 200 台・工場 80 台・造幣所 30・精錬所 30・交易所 20・改良 12・採集機の改修 3 つで毎秒 12300 × 1.25^12（約
  // 178988）。ほかの品物はどれも 1.2e8 より高く、手元の 36000000 では工場の連携しか買えない。解放の条件まであと 100000
  // で、約 0.56 秒で届く。
  await page.addInitScript(
    putSave,
    JSON.stringify({
      version: 8,
      savedAt: at(60_000).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 36_000_000 },
        totalEarned: { sign: 1, layer: 0, mag: 1_049_900_000 },
        collectors: 200,
        factories: 80,
        mints: 30,
        refineries: 30,
        exchanges: 20,
        upgrades: 12,
        collectorUpgrades: 3,
        factoryLinks: 0,
        autoBuyer: true,
        cautiousAutoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#production")).toHaveText("178988");
  await expect(page.locator("#factory-links")).toHaveText("0");

  // 工場 80 台がそれぞれ 10 × 0.01 × 80 = 8 ずつ増え、毎秒 12940 × 1.25^12 になる。2 つ目（288000000）には届かない。
  await page.clock.runFor(1000);
  await expect(page.locator("#factory-links")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("188301");
});
