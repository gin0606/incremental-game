import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { gitIn } from "../../protect/cli/fixture.ts";
import type { Context } from "./fixture.ts";
import {
  createContext,
  readIf,
  removeContext,
  round,
  rounds,
  runDriver,
  scenarios,
} from "./fixture.ts";

// 無人運転のドライバが、監督役の結果と main checkout の状態が取り決めから外れたときに、取り込まないか head だけを
// 取り込み、実行できなかった完了を次の回に伝えることを、模擬の claude・axon で確かめる。

vi.setConfig({ testTimeout: 120_000 });

let context: Context = { repository: "", mock: "", logDir: "", stopFile: "" };

beforeEach(() => {
  context = createContext();
});

afterEach(() => {
  removeContext(context);
});

const handover = (index: number): string =>
  readFileSync(join(context.logDir, "rounds", round(context, index), "previous-report.md"), "utf8");

const ALL_COMPLETIONS =
  "- 実行できなかった完了（次の回が拾い直す）: `task-1`、`fail-1`、`group-1`\n";

const subject = (revision: string): string =>
  gitIn(context.repository, ["log", "-1", "--format=%s", revision]).trim();

const completionsRun = (): boolean =>
  readIf(join(context.mock, "axon.log")).includes("args=complete");

test("最終報告を書かずに ready と報告した回は取り込まず、worktree を残す", () => {
  scenarios(context, "ready-noreport", "nothing-stop");
  const mainBefore = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  const name = round(context, 0);
  expect(log).toContain(`回 ${name}: 失敗。取り込まなかった: report.md が書かれていない`);
  expect(gitIn(context.repository, ["rev-parse", "main"]).trim()).toBe(mainBefore);
  expect(existsSync(join(context.repository, ".claude/worktrees", name))).toBe(true);
  expect(handover(0)).toContain(ALL_COMPLETIONS);
});

test("記録の確認が失敗したら、記録を捨てて head だけを取り込み、すべての完了を実行できなかったと伝える", () => {
  writeFileSync(join(context.mock, "storage-fail"), "");
  scenarios(context, "ready-stop");
  const { status, log } = runDriver(context);
  expect(status).toBe(0);
  expect(log).toContain("記録の commit か取り込みが失敗したので、head だけを取り込む");
  expect(subject("main")).toBe("work");
  expect(gitIn(context.repository, ["ls-tree", "-r", "--name-only", "main"])).not.toContain(
    ".axon",
  );
  expect(handover(0)).toContain(ALL_COMPLETIONS);
  // worktree を head に戻したので、取り込んだ回の worktree とブランチを消せる。
  expect(existsSync(join(context.repository, ".claude/worktrees", round(context, 0)))).toBe(false);
  expect(gitIn(context.repository, ["branch", "--list", "worktree-*"])).toBe("");
});

test("記録の確認の間に main checkout のブランチが変わったら、どのブランチも進めずに head に戻す", () => {
  writeFileSync(join(context.mock, "switch-on-storage"), "");
  scenarios(context, "ready-stop");
  const before = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  expect(log).toContain("head も取り込めなかった");
  expect(gitIn(context.repository, ["rev-parse", "main", "other"]).trim()).toBe(
    `${before}\n${before}`,
  );
  expect(subject(`worktree-${round(context, 0)}`)).toBe("work");
  expect(handover(0)).toContain(ALL_COMPLETIONS);
});

test("記録の確認の間に main が動いたら、取り込まずに head に戻す", () => {
  writeFileSync(join(context.mock, "move-on-storage"), "");
  scenarios(context, "ready-stop");
  const { log } = runDriver(context);
  expect(log).toContain("head も取り込めなかった: Error: main が回の開始時から動いた");
  expect(subject("main")).toBe("moved");
  expect(subject(`worktree-${round(context, 0)}`)).toBe("work");
  expect(handover(0)).toContain(ALL_COMPLETIONS);
});

test("セッションの worktree に .axon/ の外の変更があれば、記録を commit せずに head だけを取り込む", () => {
  scenarios(context, "ready-stray");
  const { log } = runDriver(context);
  expect(log).toContain(".axon/ の外に変更がある: stray.txt");
  expect(subject("main")).toBe("work");
  // 依存が変わらなければ入れ直さない。
  expect(readIf(join(context.mock, "pnpm.log"))).toBe("");
  expect(handover(0)).toContain(ALL_COMPLETIONS);
});

test("セッションの worktree の HEAD が head でなければ、完了を実行せずに取り込まない", () => {
  scenarios(context, "ready-detached");
  const mainBefore = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  expect(log).toContain("取り込まない: セッションの worktree の HEAD が head");
  expect(completionsRun()).toBe(false);
  expect(gitIn(context.repository, ["rev-parse", "main"]).trim()).toBe(mainBefore);
  expect(handover(0)).toContain(ALL_COMPLETIONS);
});

test("回の間に main checkout のブランチが変わったら、完了を実行せずにどのブランチも進めない", () => {
  scenarios(context, "switch-branch");
  const before = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  expect(log).toContain("取り込まない: main checkout のブランチが main でない（other）");
  expect(completionsRun()).toBe(false);
  expect(gitIn(context.repository, ["rev-parse", "main", "other"]).trim()).toBe(
    `${before}\n${before}`,
  );
  expect(handover(0)).toContain(ALL_COMPLETIONS);
});

test("セッションの worktree が result のブランチをチェックアウトしていなければ、完了を実行せずに取り込まない", () => {
  scenarios(context, "ready-off-branch");
  const mainBefore = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  expect(log).toContain(
    `取り込まない: セッションの worktree が worktree-${round(context, 0)} をチェックアウトしていない`,
  );
  expect(completionsRun()).toBe(false);
  expect(gitIn(context.repository, ["rev-parse", "main"]).trim()).toBe(mainBefore);
});

test("nothing の回の commit が Axon の記録の外を変えていれば取り込まない", () => {
  scenarios(context, "nothing-work");
  const mainBefore = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  expect(log).toContain(
    `取り込まない: nothing の回の commit が Axon の記録の外を変えた: work-${round(context, 0)}.txt`,
  );
  expect(gitIn(context.repository, ["rev-parse", "main"]).trim()).toBe(mainBefore);
});

test("nothing の回の commit が記録の外のファイルを .axon/ へ移しただけでも取り込まない", () => {
  scenarios(context, "nothing-rename");
  const mainBefore = gitIn(context.repository, ["rev-parse", "main"]).trim();
  const { log } = runDriver(context);
  expect(log).toContain(
    "取り込まない: nothing の回の commit が Axon の記録の外を変えた: README.md",
  );
  expect(gitIn(context.repository, ["rev-parse", "main"]).trim()).toBe(mainBefore);
});

test("取り込みで依存が変われば、main checkout で入れ直す", () => {
  scenarios(context, "ready-deps");
  runDriver(context);
  expect(readIf(join(context.mock, "pnpm.log"))).toBe(
    `cwd=${context.repository} args=install --frozen-lockfile\n`,
  );
});

test("回の途中でドライバの処理が失敗しても、失敗として数えて止まる", () => {
  scenarios(context, "nothing-stop");
  mkdirSync(context.logDir, { recursive: true });
  // 回のディレクトリを作れないようにする。
  writeFileSync(join(context.logDir, "rounds"), "");
  const { status, log } = runDriver(context, ["--max-failures", "2"]);
  expect(status).toBe(1);
  expect(log).toContain("回の途中でドライバの処理が失敗した");
  expect(log).toContain("ドライバを止める: 取り込めた回を挟まずに 2 回失敗した");
});

test("nothing の回が決めた回数だけ続いたら止まり、ready を取り込めた回を挟めば数え直す", () => {
  // 完了が失敗して何も取り込まなかった回と、失敗した回を挟んでも数える。
  scenarios(context, "nothing", "ready", "nothing", "no-report", "nothing-fail", "ready-stop");
  const { status, log } = runDriver(context, ["--max-idle", "2"]);
  expect(status).toBe(1);
  expect(rounds(context)).toHaveLength(5);
  expect(log).toContain("ドライバを止める: 取り込めた回を挟まずに 2 回 nothing で終わった");
});

test("ready を取り込めた回を挟めば失敗を数え直し、nothing の回を挟んでも数え直さない", () => {
  scenarios(context, "no-report", "ready", "no-report", "nothing", "no-report", "ready-stop");
  const { status, log } = runDriver(context, ["--max-failures", "2"]);
  expect(status).toBe(1);
  expect(rounds(context)).toHaveLength(5);
  expect(log).toContain("ドライバを止める: 取り込めた回を挟まずに 2 回失敗した");
});
