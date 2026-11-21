import type { Page } from "@playwright/test";

/**
 * ブラウザに描画の更新をさせる。フォーカスを持つ要素が隠れたり押せなくなったりしたときにフォーカスを外す処理は、
 * HTML の仕様では描画の更新の中で走る（HTML Living Standard 8.1.7.3 の update the rendering）。スクリーンショットは
 * 新しい描画を待つので、その後にフォーカスを確かめれば、この処理が走った後の位置を見られる。
 */
export const rendered = async (page: Readonly<Pick<Page, "screenshot">>): Promise<void> => {
  await page.screenshot();
};
