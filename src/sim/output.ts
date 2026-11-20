import { toText } from "../core/num.ts";
import { botName } from "./bot.ts";
import type { Entry, Run } from "./simulate.ts";

const entryJson = (entry: Entry): string => {
  const { resource, rate, ...rest } = entry;
  return JSON.stringify({ ...rest, resource: toText(resource), rate: toText(rate) });
};

/**
 * 1 回の実行を JSON Lines（1 行に 1 つの JSON）にする。最初の行は `kind: "run"` でボットと設定を、続く行は
 * 時系列（simulate.ts の Entry）を時刻の順に持つ。資源量と生産量は、大きさの上限が無いため文字列で書く
 * （num.ts の toText）。末尾は改行で終える。
 */
export function toJsonLines<S>(run: Run<S>): string {
  const { bot, settings } = run;
  const header = JSON.stringify({
    kind: "run",
    bot: botName(bot),
    purchase: bot.purchase,
    checkIn: bot.checkIn,
    prestige: bot.prestige,
    ...settings,
  });
  return [header, ...run.timeline.map((entry) => entryJson(entry))]
    .map((line) => `${line}\n`)
    .join("");
}
