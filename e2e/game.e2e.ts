import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { at } from "./clock.ts";

/** 表示されたコインの数。指数表記にならない範囲で使う。 */
const coinsOf = async (coins: Readonly<Pick<Locator, "textContent">>): Promise<number> =>
  Number(await coins.textContent());

test("ページを開くと資源が増え、購入でき、再読み込みで状態が戻る", async ({ page }) => {
  // ゲームの時刻（Date.now・setInterval）を Playwright の時計で動かす。止めた後はテストが進めた分だけ進む。
  await page.clock.install({ time: at(0) });
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  await page.clock.pauseAt(at(60_000));

  const coins = page.locator("#coins");
  const before = await coinsOf(coins);
  await page.clock.runFor(10_000);
  // 採集機 1 台で毎秒 1。表示は小数を切り捨てるため、端数の誤差で 1 ずれうる。
  await expect
    .poll(async () => Number(await coins.textContent()))
    .toBeGreaterThanOrEqual(before + 9);
  expect(await coinsOf(coins)).toBeLessThanOrEqual(before + 11);

  const buy = page.getByRole("button", { name: /^採集機を買う/v });
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(page.locator("#collectors")).toHaveText("2");
  const afterPurchase = await coinsOf(coins);

  await page.reload();
  await expect(page.locator("#collectors")).toHaveText("2");
  await expect
    .poll(async () => Number(await coins.textContent()))
    .toBeGreaterThanOrEqual(afterPurchase);
});

test("次に買えるまでの待ち時間を示し、生産で縮み、届くと買える表示に変わる", async ({ page }) => {
  // 時計を止めてから開き、コイン 0 から始める。採集機の値段 11.5 に毎秒 1 で届く。
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");

  const wait = page.locator("#next-purchase");
  await expect(wait).toHaveText("今の生産のままで約 12 秒");
  await page.clock.runFor(5000);
  await expect(wait).toHaveText("今の生産のままで約 7 秒");
  await page.clock.runFor(7000);
  await expect(wait).toHaveText("今買える");
  await expect(page.getByRole("button", { name: /^採集機を買う/v })).toBeEnabled();
});

test("これまでに生産したコインを見出しとともに示し、生産で増え、購入では減らない", async ({
  page,
}) => {
  // 時計を止めてから開き、コイン 0 から始める。採集機 1 台で毎秒 1。
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");

  // 見出しの直後の値を読み、見出しと値の組で確かめる。
  const total = page.locator('dt:text-is("これまでに生産したコイン") + dd');
  const coins = page.locator("#coins");
  await expect(total).toHaveText("0");
  await page.clock.runFor(12_000);
  await expect(total).toHaveText("12");
  await expect(coins).toHaveText("12");

  // 採集機の値段 11.5 を払うと、手元のコインは減り、累計は変わらない。
  await page.getByRole("button", { name: /^採集機を買う/v }).click();
  await expect(page.locator("#collectors")).toHaveText("2");
  await expect(coins).toHaveText("0");
  await expect(total).toHaveText("12");

  // 採集機 2 台で毎秒 2。
  await page.clock.runFor(5000);
  await expect(total).toHaveText("22");
  await expect(coins).toHaveText("10");
});

test("閉じている間の時間もオフラインの経過として生産する", async ({ context }) => {
  const first = await context.newPage();
  await first.clock.install({ time: at(0) });
  await first.clock.pauseAt(at(60_000));
  await first.goto("/");
  await expect(first.locator("#collectors")).toHaveText("1");
  await first.clock.runFor(10_000);
  const closedWith = await coinsOf(first.locator("#coins"));
  await first.close();

  // 1 時間後に開き直し、1 秒進める。採集機 1 台で毎秒 1。読み込みにかかる実時間に左右されないよう、時計を
  // 止めてから開く。
  const second = await context.newPage();
  await second.clock.install({ time: at(3_610_000) });
  await second.clock.pauseAt(at(3_670_000));
  await second.goto("/");
  await expect(second.locator("#collectors")).toHaveText("1");
  await second.clock.runFor(1000);
  const reopened = await coinsOf(second.locator("#coins"));

  expect(reopened).toBeGreaterThanOrEqual(closedWith + 3600);
  expect(reopened).toBeLessThanOrEqual(closedWith + 3602);
});

test("最初の自動保存より前にページが失われても、閉じていた間を数える", async ({ context }) => {
  const first = await context.newPage();
  await first.clock.install({ time: at(0) });
  await first.clock.pauseAt(at(60_000));
  await first.goto("/");
  await expect(first.locator("#collectors")).toHaveText("1");
  // 時計を止めているので、自動保存はまだ動いていない。開いた時点の保存だけが残った状態を作る。
  const startupSave = await first.evaluate(() => localStorage.getItem("incremental-game:save"));
  expect(startupSave).not.toBeNull();
  await first.close();

  const second = await context.newPage();
  await second.addInitScript((text) => {
    if (text !== null) {
      localStorage.setItem("incremental-game:save", text);
    }
  }, startupSave);
  await second.clock.install({ time: at(3_600_000) });
  await second.clock.pauseAt(at(3_660_000));
  await second.goto("/");

  // 開いた時点（60 秒）から 1 時間。採集機 1 台で毎秒 1。
  await expect(second.locator("#collectors")).toHaveText("1");
  const reopened = await coinsOf(second.locator("#coins"));
  expect(reopened).toBeGreaterThanOrEqual(3599);
  expect(reopened).toBeLessThanOrEqual(3600);
});

test("別のタブで遊んでいる間は始めず、そのタブを閉じると続きから始める", async ({ context }) => {
  const first = await context.newPage();
  await first.clock.install({ time: at(0) });
  await first.goto("/");
  await expect(first.locator("#collectors")).toHaveText("1");
  await first.clock.pauseAt(at(20_000));

  const second = await context.newPage();
  await second.clock.install({ time: at(20_000) });
  await second.goto("/");
  await expect(second.locator("#notice")).toHaveText(
    "別のタブでこのゲームを開いている。そのタブを閉じると、ここで続きから始める。",
  );
  await expect(second.locator("#collectors")).toHaveText("");

  // 待っている間に最初のタブで進めた分も、閉じた後に引き継ぐ。
  await first.getByRole("button", { name: /^採集機を買う/v }).click();
  await expect(first.locator("#collectors")).toHaveText("2");
  await first.close();
  await expect(second.locator("#collectors")).toHaveText("2");
  await expect(second.locator("#notice")).toHaveText("");
});

test("ロックを使えなければ、その旨を知らせて遊び始める", async ({ page }) => {
  await page.addInitScript(() => {
    LockManager.prototype.request = async () => {
      await Promise.resolve();
      throw new DOMException("denied", "SecurityError");
    };
  });
  await page.goto("/");

  await expect(page.locator("#notice")).toContainText(
    "タブの重複を防ぐロックを使えない（SecurityError: denied）ため",
  );
  await expect(page.locator("#collectors")).toHaveText("1");
});

test("時計が戻ったときは、追いつくまで生産を数えずにそのことを示し、追いつくと待ち時間を示す", async ({
  page,
}) => {
  // 時計を止めてから開き、コイン 0 から始める。採集機の値段 11.5 に毎秒 1 で届く。
  await page.clock.install({ time: at(0) });
  await page.clock.pauseAt(at(60_000));
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  const coins = page.locator("#coins");
  const wait = page.locator("#next-purchase");
  await page.clock.runFor(3000);
  await expect(coins).toHaveText("3");

  // 1 時間戻してから 1 秒進める。生産は数えず、再開まで 3599 秒、買えるまで 3607.5 秒。
  await page.clock.setSystemTime(at(63_000 - 3_600_000));
  await page.clock.runFor(1000);
  await expect(wait).toHaveText(
    "時計が戻ったため生産が止まっている（再開まで約 59 分 59 秒）。止まっている間を含めて約 1 時間 1 分",
  );
  await expect(coins).toHaveText("3");

  // 戻る前の時刻の 2 秒前から 7 秒進める。数えるのは追いついた後の 5 秒分だけで、残りは 3.5 秒。
  await page.clock.setSystemTime(at(61_000));
  await page.clock.runFor(7000);
  await expect(coins).toHaveText("8");
  await expect(wait).toHaveText("今の生産のままで約 4 秒");
});

test("保存に失敗し続けても通知は 1 つで、保存できたら消える", async ({ page }) => {
  await page.clock.install({ time: at(0) });
  await page.goto("/");
  await expect(page.locator("#collectors")).toHaveText("1");
  await page.clock.pauseAt(at(60_000));
  // 保存先の容量を埋める。Chromium は値を大きくする書き込みだけを拒むため、ゲームの保存を消してから埋める。
  await page.evaluate(() => {
    localStorage.removeItem("incremental-game:save");
    let index = 0;
    for (let size = 1 << 22; size > 0; size >>= 1) {
      try {
        for (; ; index += 1) {
          localStorage.setItem(`filler:${index}`, "x".repeat(size));
        }
      } catch {
        // この大きさでは入らなくなった。小さくして続ける。
      }
    }
  });
  await page.clock.runFor(5000);
  await expect(page.locator("#notice")).toHaveText(/^保存できなかった: QuotaExceededError[^\n]*$/v);

  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter((name) => name.startsWith("filler:"))) {
      localStorage.removeItem(key);
    }
  });
  await page.clock.runFor(2000);
  await expect(page.locator("#notice")).toHaveText("");
});

test("保存データを読めなければ、保存せずに遊ぶ", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("incremental-game:save", "kept");
    Storage.prototype.getItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
  });
  await page.clock.install({ time: at(0) });
  await page.goto("/");
  await page.clock.runFor(5000);

  await expect(page.locator("#notice")).toContainText(
    "保存データを読めないため、進行を保存せずに始める: SecurityError: denied",
  );
  await expect(page.locator("#collectors")).toHaveText("1");
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(
    JSON.stringify([["incremental-game:save", "kept"]]),
  );
});

test("読み込めない保存データを退避できなければ、元のデータを上書きしない", async ({ page }) => {
  // 保存先の容量（Chromium では 1 つのオリジンにつき約 500 万文字）の半分を超える読めないデータを置き、同じ
  // 大きさの退避が入らないようにする。ゲームの保存は小さいので入る。
  const unreadable = "x".repeat(3_000_000);
  await page.addInitScript((text) => {
    if (sessionStorage.getItem("seeded") === null) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("incremental-game:save", text);
    }
  }, unreadable);
  await page.clock.install({ time: at(0) });
  await page.goto("/");
  await page.clock.runFor(5000);

  await expect(page.locator("#notice")).toContainText(
    "読み込めなかった保存データを退避できなかったため、上書きしないよう進行を保存せずに始める",
  );
  expect(await page.evaluate(() => localStorage.getItem("incremental-game:save"))).toBe(unreadable);
});

test("読み込めない保存データは別のキーへ退避し、最初から始める", async ({ page }) => {
  await page.addInitScript(() => {
    // 再読み込みのたびに壊さないよう、最初の 1 回だけ書く。
    if (sessionStorage.getItem("seeded") === null) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("incremental-game:save", '{"version":99}');
    }
  });
  await page.goto("/");

  await expect(page.locator("#notice")).toContainText(
    "保存データを読み込めなかったため、最初から始める（未知の版: 99）。",
  );
  await expect(page.locator("#collectors")).toHaveText("1");
  const backups = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("incremental-game:save:unreadable:"))
      .map((key) => localStorage.getItem(key)),
  );
  expect(backups).toStrictEqual(['{"version":99}']);
});
