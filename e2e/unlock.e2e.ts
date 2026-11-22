import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";

test("工場が解放される前は解放の条件と残りを示し、解放されると工場を並べて次の改良の条件を示す", async ({
  page,
}) => {
  // 時計を止めてから開き、コイン 0 から始める。採集機 1 台で毎秒 1。
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");

  // 見出しの直後の値を読み、見出しと値の組で確かめる。
  const label = page.locator('dt:text-is("次の解放")');
  const condition = page.locator('dt:text-is("次の解放") + dd');
  const factory = page.getByRole("button", { name: /^工場を買う/v });
  await expect(label).toBeVisible();
  // toHaveText は隠れた要素の文字も読むため、見えていることを別に確かめる。
  await expect(condition).toBeVisible();
  await expect(condition).toHaveText(
    "工場: これまでに生産したコインが 100 に達すると解放（あと 100）",
  );
  await expect(factory).toBeHidden();

  await page.clock.runFor(12_000);
  await expect(condition).toHaveText(
    "工場: これまでに生産したコインが 100 に達すると解放（あと 88）",
  );

  // 採集機の値段 11.5 を払っても、これまでに生産したコインは減らず、残りは変わらない。
  await page.getByRole("button", { name: /^採集機を買う/v }).click();
  await expect(page.locator("#collectors")).toHaveText("2");
  await expect(condition).toHaveText(
    "工場: これまでに生産したコインが 100 に達すると解放（あと 88）",
  );

  // 採集機 2 台で毎秒 2。残りの 88 に 44 秒で届く。
  await page.clock.runFor(44_000);
  await expect(factory).toBeVisible();
  await expect(label).toBeVisible();
  await expect(condition).toBeVisible();
  await expect(condition).toHaveText(
    "改良: これまでに生産したコインが 6000000 に達すると解放（あと 5999900）",
  );
});

/**
 * 開く時刻 `at(60_000)` に保存した保存データ（保存形式の版 3）。改良の解放の条件まであと 30 で、改良の値段 400000 を
 * 持ち、採集機 10 台と工場 2 つ（毎秒 30）で、自動購入なし。
 */
const beforeUpgradeUnlock = JSON.stringify({
  version: 3,
  savedAt: at(60_000).getTime(),
  state: {
    coins: { sign: 1, layer: 0, mag: 400_000 },
    totalEarned: { sign: 1, layer: 0, mag: 5_999_970 },
    collectors: 10,
    factories: 2,
    mints: 0,
    upgrades: 0,
    autoBuyer: false,
  },
});

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("改良が解放される前は店に並べず、解放されると次の造幣所の条件を示して並べ、買うと改良の数と毎秒の生産が増える", async ({
  page,
}) => {
  await page.addInitScript(putSave, beforeUpgradeUnlock);
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("10");

  const condition = page.locator('dt:text-is("次の解放") + dd');
  const upgrade = page.getByRole("button", { name: /^改良を買う/v });
  await expect(condition).toHaveText(
    "改良: これまでに生産したコインが 6000000 に達すると解放（あと 30）",
  );
  await expect(page.locator("#upgrades")).toHaveText("0");
  await expect(upgrade).toBeHidden();

  // 毎秒 30 で残りの 30 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(condition).toHaveText(
    "造幣所: これまでに生産したコインが 150000000 に達すると解放（あと 144000000）",
  );
  await expect(upgrade).toBeVisible();
  await expect(upgrade).toHaveText("改良を買う（400000 コイン）");
  // 毎秒 30 の 0.25 倍の 7.5 を切り捨てる。
  await expect(upgrade).toHaveAccessibleDescription(
    "買うと毎秒の生産が 7 増える（すべての施設の生産が 1.25 倍になる）",
  );

  // 毎秒 30 の 1.25 倍の 37.5 を切り捨てて示す。
  await upgrade.click();
  await expect(page.locator("#upgrades")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("37");
});

test("造幣所が解放される前は店に並べず、解放されると条件を隠して並べ、買うと造幣所の数と毎秒の生産が増える", async ({
  page,
}) => {
  // 解放の条件まであと 30 で、造幣所の値段 10000000 を持つ、採集機 10 台と工場 2 つ（毎秒 30）の保存データ（保存形式の
  // 版 2）を、開く時刻に保存したものとして置く。工場の数を造幣所と違えて、造幣所の欄が造幣所の数を示すことを確かめる。
  await page.addInitScript(
    (save: string) => {
      localStorage.setItem("incremental-game:save", save);
    },
    JSON.stringify({
      version: 2,
      savedAt: at(60_000).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 10_000_000 },
        totalEarned: { sign: 1, layer: 0, mag: 149_999_970 },
        collectors: 10,
        factories: 2,
        mints: 0,
        autoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("10");

  const label = page.locator('dt:text-is("次の解放")');
  const condition = page.locator('dt:text-is("次の解放") + dd');
  const mint = page.getByRole("button", { name: /^造幣所を買う/v });
  await expect(condition).toHaveText(
    "造幣所: これまでに生産したコインが 150000000 に達すると解放（あと 30）",
  );
  await expect(page.locator("#mints")).toHaveText("0");
  await expect(mint).toBeHidden();

  // 毎秒 30 で残りの 30 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(label).toBeHidden();
  // 中身が空の要素は隠さなくても toBeHidden を満たすため、隠したことは hidden 属性で確かめる。
  await expect(condition).toHaveAttribute("hidden");
  await expect(mint).toBeVisible();
  await expect(mint).toHaveText("造幣所を買う（10000000 コイン）");
  await expect(mint).toHaveAccessibleDescription("買うと毎秒の生産が 30 増える");

  await mint.click();
  await expect(page.locator("#mints")).toHaveText("1");
  await expect(page.locator("#factories")).toHaveText("2");
  await expect(page.locator("#production")).toHaveText("60");
});
