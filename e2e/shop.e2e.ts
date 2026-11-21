import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";

test("品物ごとに買うと得られるものを示し、工場の分は解放されるまで隠す", async ({ page }) => {
  // 時計を止めてから開き、コイン 0 から始める。採集機 1 台で毎秒 1。
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");

  const collector = page.getByRole("button", { name: /^採集機を買う/v });
  const factory = page.getByRole("button", { name: /^工場を買う/v });
  const autoBuyer = page.getByRole("button", { name: /^自動購入を買う/v });
  const collectorGain = "買うと毎秒の生産が 1 増える";
  const factoryGain = "買うと毎秒の生産が 10 増える";
  const autoBuyerWork = "採集機と工場を、買える額に達するたびに自動で買う";

  // 説明は品物のボタンの説明としても読め、ボタンの隣に見えている。
  await expect(collector).toHaveAccessibleDescription(collectorGain);
  await expect(page.getByText(collectorGain)).toBeVisible();
  await expect(autoBuyer).toHaveAccessibleDescription(autoBuyerWork);
  await expect(page.getByText(autoBuyerWork)).toBeVisible();
  await expect(factory).toBeHidden();
  // toBeHidden は中身が空の要素でも満たすため、文字が入っていて隠れていることを確かめる。
  await expect(page.getByText(factoryGain)).toHaveCount(1);
  await expect(page.getByText(factoryGain)).toBeHidden();

  // 採集機の値段 11.5 に届いてから買うと、毎秒の生産が示したとおり 1 増える。
  await page.clock.runFor(12_000);
  await expect(page.locator("#production")).toHaveText("1");
  await collector.click();
  await expect(page.locator("#production")).toHaveText("2");
  await expect(collector).toHaveAccessibleDescription(collectorGain);

  // これまでに生産したコインが 100 に達すると工場が並び、その説明も見える。毎秒 2 で残りの 88 に 44 秒で届く。
  await page.clock.runFor(44_000);
  await expect(factory).toBeVisible();
  await expect(factory).toHaveAccessibleDescription(factoryGain);
  await expect(page.getByText(factoryGain)).toBeVisible();
});

test("自動購入を買うと、そのボタンと説明を隠す", async ({ page }) => {
  // 自動購入の値段 1000000 ちょうどのコインを持つ保存データ（保存形式の版 1）を、開く時刻に保存したものとして置く。
  await page.addInitScript(
    (save) => {
      localStorage.setItem("incremental-game:save", save);
    },
    JSON.stringify({
      version: 1,
      savedAt: at(0).getTime(),
      state: {
        coins: { sign: 1, layer: 0, mag: 1e6 },
        totalEarned: { sign: 1, layer: 0, mag: 1e6 },
        collectors: 1,
        factories: 0,
        autoBuyer: false,
      },
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");

  const autoBuyer = page.getByRole("button", { name: /^自動購入を買う/v });
  const work = page.getByText("採集機と工場を、買える額に達するたびに自動で買う");
  await expect(work).toBeVisible();
  await autoBuyer.click();
  await expect(page.locator("#auto-buyer")).toHaveText("稼働中");
  await expect(autoBuyer).toBeHidden();
  await expect(work).toHaveCount(1);
  await expect(work).toBeHidden();
});
