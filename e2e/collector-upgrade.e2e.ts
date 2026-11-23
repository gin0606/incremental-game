import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

// 改良と造幣所の間に解放される採集機の改修の、解放の表示と店の行。ほかの要素の解放は unlock.e2e.ts。

/**
 * 採集機の改修の解放の条件まであと 30 で、その値段 5000000 を持つ、採集機 10 台と工場 2 つ（毎秒 30）の保存データ
 * （保存形式の版 6。採集機の改修の数を持たない）を、開く時刻 `at(60_000)` に保存したもの。工場と改良は解放済み。
 */
const beforeCollectorUpgradeUnlock = JSON.stringify({
  version: 6,
  savedAt: at(60_000).getTime(),
  state: {
    coins: { sign: 1, layer: 0, mag: 5_000_000 },
    totalEarned: { sign: 1, layer: 0, mag: 74_999_970 },
    collectors: 10,
    factories: 2,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    autoBuyer: false,
    cautiousAutoBuyer: false,
  },
});

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("採集機の改修が解放される前は店に並べず、解放されると次の造幣所の条件を示して改良の後ろに並べ、買うと採集機の改修の数と毎秒の生産が増える", async ({
  page,
}) => {
  await page.addInitScript(putSave, beforeCollectorUpgradeUnlock);
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("10");

  const condition = page.locator('dt:text-is("次の解放") + dd');
  const upgrade = page.getByRole("button", { name: /^改良を買う/v });
  const collectorUpgrade = page.getByRole("button", { name: /^採集機の改修を買う/v });
  await expect(condition).toHaveText(
    "採集機の改修: これまでに生産したコインが 75000000 に達すると解放（あと 30）",
  );
  await expect(page.locator("#collector-upgrades")).toHaveText("0");
  await expect(collectorUpgrade).toBeHidden();
  // 採集機の改修の前に並ぶ最後の行（改良）の位置。
  const before = await upgrade.boundingBox();
  expect(before).not.toBeNull();

  // 毎秒 30 で残りの 30 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(condition).toHaveText(
    "造幣所: これまでに生産したコインが 130000000 に達すると解放（あと 55000000）",
  );
  await expect(collectorUpgrade).toBeVisible();
  await expect(collectorUpgrade).toHaveText("採集機の改修を買う（5000000 コイン）");
  // 採集機 10 台の毎秒 10 が 2 倍になる。
  await expect(collectorUpgrade).toHaveAccessibleDescription(
    "買うと毎秒の生産が 10 増える（採集機の生産が 2 倍になる）",
  );
  await rendered(page);
  // 採集機の改修の行は、それまで並んでいた行の後ろに足され、改良のボタンは動かない。
  expect(await upgrade.boundingBox()).toStrictEqual(before);
  const added = await collectorUpgrade.boundingBox();
  expect(added?.y ?? Number.NaN).toBeGreaterThan(before?.y ?? Number.NaN);

  await collectorUpgrade.click();
  await expect(page.locator("#collector-upgrades")).toHaveText("1");
  await expect(page.locator("#collectors")).toHaveText("10");
  await expect(page.locator("#production")).toHaveText("40");
});

test("自動購入を持っていれば、採集機の改修が解放された時刻に、値段に届いている採集機の改修を自動で買う", async ({
  page,
}) => {
  // 採集機 200 台・工場 100 台・改良 8 つで毎秒 1200 × 1.25^8（約 7152）。ほかの品物はどれも 2e7 より高く、手元の
  // 5000000 では採集機の改修しか買えない。解放の条件まであと 10000 で、約 1.4 秒で届く。
  await page.addInitScript(
    putSave,
    JSON.stringify({
      version: 7,
      savedAt: at(60_000).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 5_000_000 },
        totalEarned: { sign: 1, layer: 0, mag: 74_990_000 },
        collectors: 200,
        factories: 100,
        mints: 0,
        refineries: 0,
        exchanges: 0,
        upgrades: 8,
        collectorUpgrades: 0,
        autoBuyer: true,
        cautiousAutoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#production")).toHaveText("7152");
  await expect(page.locator("#collector-upgrades")).toHaveText("0");

  // 採集機 200 台の生産が 2 倍になり、毎秒 1400 × 1.25^8 になる。2 つ目（40000000）には届かない。
  await page.clock.runFor(2000);
  await expect(page.locator("#collector-upgrades")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("8344");
});
