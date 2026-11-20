import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, test, vi } from "vitest";

import { runCli } from "../run.ts";

// 1 件の時間切れを広げる。CLI を起動するテストは 1 件 1 秒ほど（2026-11 に測って最長 0.8 秒）で終わるが、ほかの処理で機械が
// 混み合うと Vitest の既定の 5 秒を超え、結果と関係なく commit の検査が落ちた。時間切れは遅くなった実装を検出する
// ためのものではない（所要時間は src/sim/sets.ts の目安で見る）。
vi.setConfig({ testTimeout: 120_000 });

const main = fileURLToPath(new URL("main.ts", import.meta.url));

const runMain = (args: readonly string[]): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, [main, ...args], { encoding: "utf8" });

test("CLI はボットと期間を受け取り、時系列を JSON Lines で標準出力に書く", () => {
  const args = ["--bot", "efficiency@always", "--bot", "random@1h", "--duration", "1d"];
  const result = runMain(args);
  const lines = result.stdout
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(lines.filter((line) => JSON.stringify(line).startsWith('{"kind":"run"'))).toStrictEqual([
    {
      kind: "run",
      bot: "efficiency@always",
      purchase: "efficiency",
      checkIn: { kind: "always" },
      prestige: "never",
      duration: 86_400,
      step: 60,
      sampleEvery: 3600,
      seed: 1,
    },
    {
      kind: "run",
      bot: "random@3600s",
      purchase: "random",
      checkIn: { kind: "every", seconds: 3600 },
      prestige: "never",
      duration: 86_400,
      step: 60,
      sampleEvery: 3600,
      seed: 1,
    },
  ]);
  // 時系列の中身は run.ts のテストが確かめる。ここでは、同じ引数でプロセスの中から動かした結果と同じことを確かめる。
  let inProcess = "";
  runCli(args, {
    out: (text) => {
      inProcess += text;
    },
    error: () => {
      throw new Error("標準エラーに書かない");
    },
  });
  expect(result.stdout).toBe(inProcess);
  expect(result.stdout).toContain('{"kind":"purchase",');
  expect(result.stdout.trimEnd().split("\n").at(-1)).toMatch(/^\{"kind":"sample","t":86400,/v);
});

test("CLI は引数が誤っていれば、使い方を標準エラーに書いて終了コード 2 で終わる", () => {
  const result = runMain(["--bot", "nope@always"]);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("使い方: pnpm run sim");
});
