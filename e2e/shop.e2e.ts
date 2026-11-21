import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";

/**
 * コイン `coins` を持つ保存データ（保存形式の版 1）。時計を止める時刻 `at(60_000)` に保存したものとし、その時刻に
 * 開けば離れていた時間が無く、コインは保存したまま始まる。採集機 1 台、工場 0 台、自動購入なしで、これまでに生産した
 * コインは 1000000 とコインの多いほう（工場は解放済み。コインより少ない保存データは読み込まれない）。
 */
const savedWithCoins = (coins: number): string =>
  JSON.stringify({
    version: 1,
    savedAt: at(60_000).getTime(),
    state: {
      coins: { sign: 1, layer: 0, mag: coins },
      totalEarned: { sign: 1, layer: 0, mag: Math.max(coins, 1e6) },
      collectors: 1,
      factories: 0,
      autoBuyer: false,
    },
  });

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

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
  // 自動購入の値段 1000000 ちょうどのコインを持つ保存データを、開く時刻に保存したものとして置く。
  await page.addInitScript(putSave, savedWithCoins(1e6));
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

/**
 * ブラウザに描画の更新をさせる。フォーカスを持つ要素が隠れたり押せなくなったりしたときにフォーカスを外す処理は、
 * HTML の仕様では描画の更新の中で走る（HTML Living Standard 8.1.7.3 の update the rendering）。スクリーンショットは
 * 新しい描画を待つので、その後にフォーカスを確かめれば、この処理が走った後の位置を見られる。
 */
const rendered = async (page: Readonly<Pick<Page, "screenshot">>): Promise<void> => {
  await page.screenshot();
};

test("キーボードで自動購入を買うと、フォーカスを店の中の前にある品物のボタンへ移し、続けて店の中を移れる", async ({
  page,
}) => {
  await page.addInitScript(putSave, savedWithCoins(1e6));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  const collector = page.getByRole("button", { name: /^採集機を買う/v });
  const factory = page.getByRole("button", { name: /^工場を買う/v });
  const autoBuyer = page.getByRole("button", { name: /^自動購入を買う/v });

  await autoBuyer.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#auto-buyer")).toHaveText("稼働中");
  await expect(autoBuyer).toBeHidden();
  // 自動購入は店の最後の品物なので、前にある工場へ移す。コインを使い切って買えなくても、フォーカスは受けられる。
  await rendered(page);
  await expect(factory).toBeFocused();
  await expect(factory).toBeDisabled();
  await page.keyboard.press("Shift+Tab");
  await expect(collector).toBeFocused();
});

test("キーボードで採集機を買ってコインが足りなくなっても、フォーカスはそのボタンに残り、届けば続けて買える", async ({
  page,
}) => {
  await page.addInitScript(putSave, savedWithCoins(12));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  const collector = page.getByRole("button", { name: /^採集機を買う/v });

  const operableColor = await collector.evaluate((button) => getComputedStyle(button).color);

  // 値段 11.5 を払うとコインは 0.5 で、次の値段（約 13.2）に足りない。押せないことは見た目でも示す。
  await collector.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#collectors")).toHaveText("2");
  await expect(collector).toBeDisabled();
  await expect(collector).not.toHaveCSS("color", operableColor);
  await rendered(page);
  await expect(collector).toBeFocused();
  // 買えない間に押しても買わない。
  await page.keyboard.press("Enter");
  await expect(page.locator("#collectors")).toHaveText("2");

  // 採集機 2 台で毎秒 2。残りの約 12.7 に 7 秒で届き、フォーカスを置いたまま続けて買える。
  await page.clock.runFor(7000);
  await expect(collector).toBeEnabled();
  await expect(collector).toHaveCSS("color", operableColor);
  await expect(collector).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#collectors")).toHaveText("3");
});
