import * as fc from "fast-check";

import type { GameState } from "./game.ts";
import type { Num } from "./num.ts";
import { add, num } from "./num.ts";

/** テスト用の生成器。0 以上の Num を作る。number で表せる範囲に収める。 */
export const nonNegativeNum: fc.Arbitrary<Num> = fc
  .double({ min: 0, max: 1e200, noNaN: true, noDefaultInfinity: true })
  .map((value) => num(value));

/** テスト用の生成器。到達しうる形の状態（累計の生産量が手元のコイン以上）を作る。 */
export const gameState: fc.Arbitrary<GameState> = fc
  .record({
    coins: nonNegativeNum,
    spent: nonNegativeNum,
    collectors: fc.nat({ max: 300 }),
    factories: fc.nat({ max: 100 }),
    mints: fc.nat({ max: 100 }),
    refineries: fc.nat({ max: 100 }),
    upgrades: fc.nat({ max: 60 }),
    autoBuyer: fc.boolean(),
    cautiousAutoBuyer: fc.boolean(),
  })
  .map(
    ({
      coins,
      spent,
      collectors,
      factories,
      mints,
      refineries,
      upgrades,
      autoBuyer,
      cautiousAutoBuyer,
    }) => ({
      coins,
      totalEarned: add(coins, spent),
      collectors,
      factories,
      mints,
      refineries,
      upgrades,
      autoBuyer,
      cautiousAutoBuyer,
    }),
  );
