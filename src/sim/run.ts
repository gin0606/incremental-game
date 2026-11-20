import { parseArgs } from "./args.ts";
import { minimalGame } from "./minimal-game.ts";
import { toJsonLines } from "./output.ts";
import { simulate } from "./simulate.ts";

/** CLI の出力先。 */
export interface Io {
  readonly out: (text: string) => void;
  readonly error: (text: string) => void;
}

/**
 * CLI の本体。引数を読み、指定されたボットに最小ゲームを遊ばせ、実行ごとに時系列を `out` へ書く。
 * 終了コード（成功は 0、引数の誤りは 2）を返す。
 */
export function runCli(args: readonly string[], io: Io): number {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    io.error(parsed.message);
    return 2;
  }
  const { trials, settings } = parsed.command;
  for (const { bot, seed } of trials) {
    io.out(toJsonLines(simulate(minimalGame, bot, { ...settings, seed })));
  }
  return 0;
}
