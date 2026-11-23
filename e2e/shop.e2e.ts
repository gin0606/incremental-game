import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";
import { rendered } from "./rendered.ts";

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
  const autoBuyerWork =
    "採集機・工場・造幣所・精錬所・交易所・改良・工具の支給・採集機の改修・工場の連携を、買える額に達するたびに自動で買う";

  // 説明は品物のボタンの説明としても読め、ボタンの隣に見えている。
  await expect(collector).toHaveAccessibleDescription(collectorGain);
  await expect(page.getByText(collectorGain, { exact: true })).toBeVisible();
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
  // 自動購入の値段 300000 ちょうどのコインを持つ保存データを、開く時刻に保存したものとして置く。
  await page.addInitScript(putSave, savedWithCoins(3e5));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");

  const autoBuyer = page.getByRole("button", { name: /^自動購入を買う/v });
  const work = page.getByText(
    "採集機・工場・造幣所・精錬所・交易所・改良・工具の支給・採集機の改修・工場の連携を、買える額に達するたびに自動で買う",
  );
  await expect(work).toBeVisible();
  await autoBuyer.click();
  await expect(page.locator("#auto-buyer")).toHaveText("稼働中");
  await expect(autoBuyer).toBeHidden();
  await expect(work).toHaveCount(1);
  await expect(work).toBeHidden();
});

test("控えめな自動購入を買うと、そのボタンと説明を隠し、払った後も今の生産の 10 分ぶんのコインが残るときに品物を自動で買う", async ({
  page,
}) => {
  // 控えめな自動購入の値段 30000 ちょうどのコインを持つ保存データ。採集機 1 台で毎秒 1。
  await page.addInitScript(putSave, savedWithCoins(3e4));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");

  const cautious = page.getByRole("button", { name: /^控えめな自動購入を買う（30000 コイン）/v });
  const work = page.getByText(
    "採集機・工場・造幣所・精錬所・交易所・改良・工具の支給・採集機の改修・工場の連携を、払った後も今の生産の 10 分ぶんのコインが残るときに自動で買う",
  );
  await expect(page.locator("#auto-buyer")).toHaveText("なし");
  await expect(cautious).toHaveAccessibleDescription(
    "採集機・工場・造幣所・精錬所・交易所・改良・工具の支給・採集機の改修・工場の連携を、払った後も今の生産の 10 分ぶんのコインが残るときに自動で買う",
  );
  await cautious.click();
  await expect(page.locator("#auto-buyer")).toHaveText("控えめに稼働中");
  await expect(page.locator("#coins")).toHaveText("0");
  await expect(cautious).toBeHidden();
  await expect(work).toHaveCount(1);
  await expect(work).toBeHidden();
  // 自動購入（300000）はまだ買える品物として並ぶ。
  await expect(page.getByRole("button", { name: /^自動購入を買う/v })).toBeVisible();

  // 2 台目の採集機の値段 11.5 に届いても買わず、値段と残す 600（毎秒 1 の 10 分ぶん）の和の 611.5 に届くと買う。
  // 工場は和の 750 に届かない。
  await page.clock.runFor(12_000);
  await expect(page.locator("#collectors")).toHaveText("1");
  await page.clock.runFor(599_000);
  await expect(page.locator("#collectors")).toHaveText("1");
  await page.clock.runFor(1000);
  await expect(page.locator("#collectors")).toHaveText("2");
  await expect(page.locator("#production")).toHaveText("2");
});

test("キーボードでフォーカスを置いた自動購入をマウスで買っても、ページも後ろの行も動かず、続けて同じ位置を押しても別の品物のボタンに当たらない", async ({
  page,
}) => {
  await page.addInitScript(putSave, savedWithCoins(3e5));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  const autoBuyer = page.getByRole("button", { name: /^自動購入を買う/v });
  const factory = page.getByRole("button", { name: /^工場を買う/v });
  // 文字の大きさによらず店が画面に収まらないよう、画面を低くする。
  await page.setViewportSize({ width: 1280, height: 400 });
  // 自動購入のボタンを画面の下端に置き、その後ろの工場のボタンを画面の外にする。フォーカスを置いたボタンには、マウスで
  // 押してもフォーカスの印が残る。
  await autoBuyer.evaluate((button) => {
    button.scrollIntoView({ block: "end" });
    button.focus({ preventScroll: true });
  });
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await expect(factory).not.toBeInViewport();
  await expect(autoBuyer.and(page.locator(":focus-visible"))).toHaveCount(1);
  const pressed = await autoBuyer.boundingBox();
  const x = (pressed?.x ?? 0) + (pressed?.width ?? 0) / 2;
  const y = (pressed?.y ?? 0) + (pressed?.height ?? 0) / 2;

  await page.mouse.click(x, y);
  await expect(page.locator("#auto-buyer")).toHaveText("稼働中");
  await expect(autoBuyer).toBeHidden();
  await rendered(page);
  // 買い終えた自動購入の行は場所を残し、フォーカスを工場へ移してもページを巻き取らないので、押した位置にはどのボタンも
  // 無い。
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await expect(factory).toBeFocused();
  const onButton = await page.evaluate(
    ({ pointX, pointY }) => document.elementFromPoint(pointX, pointY)?.closest("button") !== null,
    { pointX: x, pointY: y },
  );
  expect(onButton).toBe(false);
});

test("キーボードで自動購入を買うと、フォーカスを店の中の後ろにある品物のボタンへ移し、続けて店の中を移れる", async ({
  page,
}) => {
  await page.addInitScript(putSave, savedWithCoins(3e5));
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  const collector = page.getByRole("button", { name: /^採集機を買う/v });
  const factory = page.getByRole("button", { name: /^工場を買う/v });
  const autoBuyer = page.getByRole("button", { name: /^自動購入を買う/v });

  // 文字の大きさによらず店が画面に収まらないよう、画面を低くする。
  await page.setViewportSize({ width: 1280, height: 400 });
  // 自動購入のボタンを画面の下端に置き、その後ろの工場のボタンを画面の外にする。
  await autoBuyer.evaluate((button) => {
    button.scrollIntoView({ block: "end" });
    button.focus({ preventScroll: true });
  });
  await expect(factory).not.toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("#auto-buyer")).toHaveText("稼働中");
  await expect(autoBuyer).toBeHidden();
  // 自動購入の後ろにある見えている品物のうち最も近い工場へ移す（改良・工具の支給・採集機の改修・造幣所・精錬所・交易所・
  // 工場の連携は解放の前で隠れている）。
  // コインを使い切って買えなくても、フォーカスは受けられる。
  await rendered(page);
  await expect(factory).toBeFocused();
  // キーボードで操作していれば、移した先が見えるようページを巻き取る。
  await expect(factory).toBeInViewport();
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
