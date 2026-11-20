import { createServer } from "node:net";

import { defineConfig, devices } from "@playwright/test";

const HOST = "127.0.0.1";

/** 空いているポートを OS に選ばせる。 */
const findFreePort = async (): Promise<number> => {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error(`ポートを取得できなかった: ${String(address)}`));
          return;
        }
        resolve(address.port);
      });
    });
  });
  return port;
};

// 別の worktree で同時に走る E2E のサーバーへつながず、この実行がビルドしたものだけを検査するよう、実行ごとに
// 空いているポートを使う。設定は worker のプロセスでも読み直されるため、最初に選んだポートを環境変数で引き継ぐ。
// 引き継ぐのは worker（Playwright が TEST_WORKER_INDEX を渡す）だけにし、シェルに残った値は使わない。
const { E2E_PORT: inherited, TEST_WORKER_INDEX: workerIndex } = process.env;
const PORT =
  workerIndex !== undefined && inherited !== undefined ? Number(inherited) : await findFreePort();
Object.assign(process.env, { E2E_PORT: String(PORT) });

/**
 * E2E テストの設定。実ブラウザで、ビルドしたゲームを開いて遊ぶ。
 *
 * - ブラウザは PLAYWRIGHT_BROWSERS_PATH=0 で node_modules に入れた Chromium の headless shell
 *   （package.json の e2e:install・test:e2e）。利用者のキャッシュや手元の Chrome の版に左右されない。
 * - 失敗を再実行で通さない（retries: 0）。不安定なテストは直す。
 * - 毎回ビルドしてから preview で配信し、既に動いているサーバーは使わない（古いビルドを検査しない）。
 */
const config: ReturnType<typeof defineConfig> = defineConfig({
  testDir: "e2e",
  // Vitest が集める `*.test.ts` と分ける。
  testMatch: "**/*.e2e.ts",
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  // 失敗時の trace は test-results/ に出る（.gitignore で外す）。
  outputDir: "test-results",
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite build && vite preview --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: false,
  },
});

export default config;
