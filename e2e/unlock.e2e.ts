import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";

test("工場が解放される前は解放の条件と残りを示し、解放されると条件を隠して工場を並べる", async ({
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
  await expect(label).toBeHidden();
  // 中身が空の要素は隠さなくても toBeHidden を満たすため、隠したことは hidden 属性で確かめる。
  await expect(condition).toHaveAttribute("hidden");
  await expect(factory).toBeVisible();
});
