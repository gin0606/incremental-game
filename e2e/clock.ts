const START = new Date("2026-01-01T00:00:00Z").getTime();

/**
 * E2E テストの時計（Playwright の `page.clock`）の基準から `milliseconds` ミリ秒後の時刻。
 *
 * 使う側の決まり（この関数は確かめない）: 時計を止める時刻は install から 60 秒先に置き、テストの実行が止まっても
 * 過去を指定しないようにする。
 */
export const at = (milliseconds: number): Date => new Date(START + milliseconds);
