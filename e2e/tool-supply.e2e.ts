import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

// 改良と採集機の改修の間に解放される工具の支給の、解放の表示と店の行。ほかの要素の解放は unlock.e2e.ts。

/**
 * 工具の支給の解放の条件まであと 470 で、その値段 2200000 を持つ、採集機 70 台と工場 40 台（毎秒 470）の保存データ
 * （保存形式の版 8。工具の支給の数を持たない）を、開く時刻 `at(60_000)` に保存したもの。工場と改良は解放済み。
 */
const beforeToolSupplyUnlock = JSON.stringify({
  version: 8,
  savedAt: at(60_000).getTime(),
  state: {
    coins: { sign: 1, layer: 0, mag: 2_200_000 },
    totalEarned: { sign: 1, layer: 0, mag: 34_999_530 },
    collectors: 70,
    factories: 40,
    mints: 0,
    refineries: 0,
    exchanges: 0,
    upgrades: 0,
    collectorUpgrades: 0,
    factoryLinks: 0,
    autoBuyer: false,
    cautiousAutoBuyer: false,
  },
});

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("工具の支給が解放される前は店に並べず、解放されると次の採集機の改修の条件を示して改良の後ろに並べ、買うと工具の支給の数と毎秒の生産が増える", async ({
  page,
}) => {
  await page.addInitScript(putSave, beforeToolSupplyUnlock);
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("70");

  const condition = page.locator('dt:text-is("次の解放") + dd');
  const upgrade = page.getByRole("button", { name: /^改良を買う/v });
  const toolSupply = page.getByRole("button", { name: /^工具の支給を買う/v });
  await expect(condition).toHaveText(
    "工具の支給: これまでに生産したコインが 35000000 に達すると解放（あと 470）",
  );
  await expect(page.locator("#tool-supplies")).toHaveText("0");
  await expect(toolSupply).toBeHidden();
  // 工具の支給の前に並ぶ最後の行（改良）の位置。
  const before = await upgrade.boundingBox();
  expect(before).not.toBeNull();

  // 毎秒 470 で残りの 470 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(condition).toHaveText(
    "採集機の改修: これまでに生産したコインが 75000000 に達すると解放（あと 40000000）",
  );
  await expect(toolSupply).toBeVisible();
  await expect(toolSupply).toHaveText("工具の支給を買う（2200000 コイン）");
  // 採集機 70 台がそれぞれ 0.0025 × 工場 40 台 = 0.1 ずつ増える。
  await expect(toolSupply).toHaveAccessibleDescription(
    "買うと毎秒の生産が 7 増える（採集機の生産が、持っている工場 1 台につき、支給の無いときの 0.25% ずつ増える）",
  );
  await rendered(page);
  // 工具の支給の行は、それまで並んでいた行の後ろに足され、改良のボタンは動かない。
  expect(await upgrade.boundingBox()).toStrictEqual(before);
  const added = await toolSupply.boundingBox();
  expect(added?.y ?? Number.NaN).toBeGreaterThan(before?.y ?? Number.NaN);

  await toolSupply.click();
  await expect(page.locator("#tool-supplies")).toHaveText("1");
  await expect(page.locator("#collectors")).toHaveText("70");
  await expect(page.locator("#production")).toHaveText("477");
});

test("自動購入を持っていれば、工具の支給が解放された時刻に、値段に届いている工具の支給を自動で買う", async ({
  page,
}) => {
  // 採集機 89 台・工場 53 台・改良 3 つで毎秒 619 × 1.25^3（約 1208）。ほかの品物はどれも 2300000 より高く（採集機の
  // 改修は解放の前）、手元の 2200000 では工具の支給しか買えない。解放の条件まであと 1000 で、約 0.83 秒で届く。
  await page.addInitScript(
    putSave,
    JSON.stringify({
      version: 8,
      savedAt: at(60_000).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 2_200_000 },
        totalEarned: { sign: 1, layer: 0, mag: 34_999_000 },
        collectors: 89,
        factories: 53,
        mints: 0,
        refineries: 0,
        exchanges: 0,
        upgrades: 3,
        collectorUpgrades: 0,
        factoryLinks: 0,
        autoBuyer: true,
        cautiousAutoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#production")).toHaveText("1208");
  await expect(page.locator("#tool-supplies")).toHaveText("0");

  // 採集機 89 台がそれぞれ 0.0025 × 工場 53 台 = 13.25% 増え、毎秒 (89 × 1.1325 + 530) × 1.25^3 になる。2 つ目
  // （22000000）には届かない。
  await page.clock.runFor(1000);
  await expect(page.locator("#tool-supplies")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("1232");
});
