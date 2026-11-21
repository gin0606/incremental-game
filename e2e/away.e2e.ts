import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";

/**
 * 時計の基準から `savedAt` ミリ秒後に保存した、採集機 2 台・工場 1 台・自動購入あり、コイン 1000 の保存データ
 * （保存形式の版 1）。
 */
const saveData = (savedAt: number): string =>
  JSON.stringify({
    version: 1,
    savedAt: at(savedAt).getTime(),
    state: {
      coins: { sign: 1, layer: 0, mag: 1000 },
      totalEarned: { sign: 1, layer: 0, mag: 1000 },
      collectors: 2,
      factories: 1,
      autoBuyer: true,
    },
  });

/** 保存データ `save`（`null` なら置かない）を、ページのスクリプトより前に置く。 */
const seed = (save: string | null): void => {
  if (save !== null) {
    localStorage.setItem("incremental-game:save", save);
  }
};

test("離れていた後に開くと、離れていた時間と生産したコインと自動購入で増えた施設を示し、閉じるまで出しておく", async ({
  page,
}) => {
  // 保存してから 1 時間 1 分後に開く。読み込みにかかる実時間に左右されないよう、時計を止めてから開く。
  await page.addInitScript(seed, saveData(0));
  await page.clock.install({ time: at(3_600_000) });
  await page.clock.pauseAt(at(3_660_000));
  await page.goto("/");

  const away = page.getByRole("region", { name: "離れていた間に進んだこと" });
  await expect(away).toBeVisible();
  // 数はゲームの数値で変わるため、文の形と、画面の数との合い方で確かめる（数そのものはユニットテストで確かめる）。
  const report = page.locator("#away-report");
  await expect(report).toHaveText(
    /^離れていた 1 時間 1 分のあいだに、コインを \d+ 生産した。自動購入で採集機が \d+ 台、工場が \d+ 台増えた。$/v,
  );
  const [coins, collectors, factories] = [
    ...((await report.textContent()) ?? "").matchAll(/\d+(?= (?:生産|台))/gv),
  ].map(([digits]) => Number(digits));
  // 保存したときは、これまでに生産したコイン 1000、採集機 2 台、工場 1 台。時計を止めているので、開いた後は進まない。
  await expect(page.locator("#total-earned")).toHaveText(String(1000 + Number(coins)));
  await expect(page.locator("#collectors")).toHaveText(String(2 + Number(collectors)));
  await expect(page.locator("#factories")).toHaveText(String(1 + Number(factories)));

  // 時間が経っても消さない。
  await page.clock.runFor(60_000);
  await expect(away).toBeVisible();

  await away.getByRole("button", { name: "閉じる" }).click();
  await expect(away).toBeHidden();
});

for (const { name, save, notice } of [
  { name: "保存データが無い", save: null, notice: "" },
  // 保存してから 10 秒後に開く。
  { name: "離れていた時間が 10 秒以下の", save: saveData(50_000), notice: "" },
  // 保存した時刻より 1 分戻った時計で開く。時計が戻ったことの知らせは出す。
  {
    name: "時計が保存時より戻っている",
    save: saveData(120_000),
    notice:
      "保存した時刻（2026-01-01T00:02:00.000Z）が今の時計より先のため、時計がその時刻を過ぎるまで生産を数えない。",
  },
] as const) {
  test(`${name}ときは、離れていた間に進んだことを示さない`, async ({ page }) => {
    await page.addInitScript(seed, save);
    await page.clock.install({ time: at(0) });
    await page.clock.pauseAt(at(60_000));
    await page.goto("/");

    // 遊び始めた（施設の数を表示した）後に確かめる。
    await expect(page.locator("#collectors")).not.toHaveText("");
    await expect(page.locator("#away")).toBeHidden();
    await expect(page.locator("#notice")).toHaveText(notice);
  });
}
