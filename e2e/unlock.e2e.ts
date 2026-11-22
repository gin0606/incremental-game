import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

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
 * 開く時刻 `at(60_000)` に保存した保存データ（保存形式の版 3）。改良の値段 400000 を持ち、改良と造幣所はまだ無い。
 */
const beforeUpgradeUnlock = (state: {
  readonly totalEarned: number;
  readonly collectors: number;
  readonly factories: number;
  readonly autoBuyer: boolean;
}): string =>
  JSON.stringify({
    version: 3,
    savedAt: at(60_000).getTime(),
    state: {
      coins: { sign: 1, layer: 0, mag: 400_000 },
      totalEarned: { sign: 1, layer: 0, mag: state.totalEarned },
      collectors: state.collectors,
      factories: state.factories,
      mints: 0,
      upgrades: 0,
      autoBuyer: state.autoBuyer,
    },
  });

const putSave = (save: string): void => {
  localStorage.setItem("incremental-game:save", save);
};

test("改良が解放される前は店に並べず、解放されると次の造幣所の条件を示して並べ、買うと改良の数と毎秒の生産が増える", async ({
  page,
}) => {
  // 改良の解放の条件まであと 30 で、採集機 10 台と工場 2 つ（毎秒 30）、自動購入なし。
  await page.addInitScript(
    putSave,
    beforeUpgradeUnlock({ totalEarned: 5_999_970, collectors: 10, factories: 2, autoBuyer: false }),
  );
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

test("解放の前の改良も、解放されて値段に届くまでの時間を次に買えるまでの待ち時間に示す", async ({
  page,
}) => {
  // 改良の解放の条件まであと 10000。採集機 100 台と工場 60 台（毎秒 700）の値段は 800 万を超え、自動購入は買い終えている。
  await page.addInitScript(
    putSave,
    beforeUpgradeUnlock({
      totalEarned: 5_990_000,
      collectors: 100,
      factories: 60,
      autoBuyer: true,
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("100");

  // 残りの 10000 に毎秒 700 で約 14.3 秒で届く。
  const wait = page.locator("#next-purchase");
  await expect(wait).toHaveText("今の生産のままで約 15 秒");

  // 解放されると自動購入が改良を買い、毎秒の生産が 700 の 1.25 倍になる。
  await page.clock.runFor(15_000);
  await expect(page.locator("#upgrades")).toHaveText("1");
  await expect(page.locator("#production")).toHaveText("875");
});

test("造幣所が解放される前は店に並べず、解放されると条件に替えてすべて解放したことを示して並べ、買うと造幣所の数と毎秒の生産が増える", async ({
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
  await expect(label).toBeVisible();
  await expect(condition).toBeVisible();
  await expect(condition).toHaveText("なし（すべて解放済み）");
  await expect(mint).toBeVisible();
  await expect(mint).toHaveText("造幣所を買う（10000000 コイン）");
  await expect(mint).toHaveAccessibleDescription("買うと毎秒の生産が 30 増える");

  await mint.click();
  await expect(page.locator("#mints")).toHaveText("1");
  await expect(page.locator("#factories")).toHaveText("2");
  await expect(page.locator("#production")).toHaveText("60");
});

/** 要素ごとの位置と大きさ。見えていない要素は null。 */
const boxesOf = async (
  locators: readonly Readonly<Pick<Locator, "boundingBox">>[],
): Promise<Awaited<ReturnType<Locator["boundingBox"]>>[]> => {
  const boxes = await Promise.all(
    locators.map(async (locator) => {
      const box = await locator.boundingBox();
      return box;
    }),
  );
  return boxes;
};

test("品物が解放されると店の行は後ろに足され、それまで並んでいた品物のボタンの位置は変わらない", async ({
  page,
}) => {
  // 造幣所の解放の条件まであと 30 で、採集機 10 台と工場 2 つ（毎秒 30）、自動購入なし。工場と改良は解放済みで、店には
  // 採集機・自動購入・工場・改良が並ぶ。
  await page.addInitScript(
    putSave,
    beforeUpgradeUnlock({
      totalEarned: 149_999_970,
      collectors: 10,
      factories: 2,
      autoBuyer: false,
    }),
  );
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("10");

  const shown = [/^採集機を買う/v, /^自動購入を買う/v, /^工場を買う/v, /^改良を買う/v].map((name) =>
    page.getByRole("button", { name }),
  );
  const mint = page.getByRole("button", { name: /^造幣所を買う/v });
  await expect(mint).toBeHidden();
  const before = await boxesOf(shown);
  // 隠れたボタンの位置は null になるため、どれも並んでいることを確かめる。
  expect(before).not.toContain(null);

  // 毎秒 30 で残りの 30 に 1 秒で届く。
  await page.clock.runFor(1000);
  await expect(mint).toBeVisible();
  await rendered(page);
  const after = await boxesOf(shown);
  expect(after).toStrictEqual(before);
  // 造幣所の行は、それまで並んでいた行の後ろに足される。
  const added = await mint.boundingBox();
  expect(added?.y ?? Number.NaN).toBeGreaterThan(before.at(-1)?.y ?? Number.NaN);
});
