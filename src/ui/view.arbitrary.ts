import type { Arbitrary } from "fast-check";

import type { Action, GameState } from "../core/game.ts";
import { gameState } from "../core/game.arbitrary.ts";
import { production, withPurchase } from "../core/game.ts";
import { toNumber } from "../core/num.ts";

/**
 * 表示（`format`）が `value` の端数を切り捨てて示すか。`format` は有効数字 12 桁に丸めてから切り捨てるので、整数の
 * ごく手前の端数（たとえば 441967067.9996）は次の整数に切り上がって示される。浮動小数点の誤差で整数をわずかに下回った
 * 値（たとえば 110 になるはずの 109.99999999999999）は、元の整数として切り捨てたものとみなす。
 */
const floorsAsShown = (value: number): boolean =>
  Math.floor(Number(value.toPrecision(12))) === Math.floor(value) ||
  Math.ceil(value) - value <= 1e-14 * Math.max(1, value);

/**
 * `action` を買った後の毎秒の生産が 10 億未満で、買う前後の毎秒の生産とその差のどれも、表示で切り上がらない状態。
 * このとき、買うと増えると示す毎秒の生産と、買う前後の毎秒の生産の表示の差は、切り捨てた端数の分（1 まで）しかずれない。
 */
export const flooredDisplay = (action: Action): Arbitrary<GameState> =>
  gameState.filter((current) => {
    const before = toNumber(production(current));
    const after = toNumber(production(withPurchase(current, action)));
    return after < 1e9 && [before, after, after - before].every((value) => floorsAsShown(value));
  });
