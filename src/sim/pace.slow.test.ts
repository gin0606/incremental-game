import { expect, inject, test, vi } from "vitest";

import targets from "../../docs/design/minimal-game.targets.json" with { type: "json" };
import { minimalGame } from "./minimal-game.ts";
import { checkPace } from "./pace-check.ts";
import { parseTargets } from "./pace-targets.ts";
import { fastSet, fullSet } from "./sets.ts";

// 最小ゲームのペースの指標を、設計記録の目標値（docs/design/minimal-game.targets.json）と不変条件と比べる。commit ごとに
// 速い組で、取り込み前に全組（`pnpm run test:pace:full`）で回す。指標はテストを集める時点で一度だけ測る。
//
// 1 件の時間切れを広げる。ほかの処理で機械が混み合うと Vitest の既定の 5 秒を超えうる。時間切れは遅くなった実装を
// 検出するためのものではない（所要時間は src/sim/sets.ts の目安で見る）。
vi.setConfig({ testTimeout: 120_000 });

const checks = checkPace(
  minimalGame,
  parseTargets(targets),
  inject("paceSet") === "full" ? fullSet : fastSet,
);

test.each(
  checks.map(
    (check) => [`${check.kind}: ${check.name}（ボット: ${check.bots.join(", ")}）`, check] as const,
  ),
)("%s", (_title, { problems }) => {
  expect(problems).toStrictEqual([]);
});
