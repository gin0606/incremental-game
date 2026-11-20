import * as fc from "fast-check";
import { expect, inject } from "vitest";

import type { Num } from "./src/core/num.ts";
import { DEFAULT_TOLERANCE, approxEqual, format, toParts } from "./src/core/num.ts";

export interface FastCheckSettings {
  readonly seed?: number;
  readonly numRuns?: number;
}

declare module "vitest" {
  export interface ProvidedContext {
    fastCheck: FastCheckSettings;
  }

  export interface Matchers<R> {
    /** Num が `expected` と相対誤差 `tolerance`（既定は DEFAULT_TOLERANCE）の範囲で等しい。 */
    toBeApprox: (expected: Num, tolerance?: number) => R;
  }
}

fc.configureGlobal(inject("fastCheck"));

const describeNum = (value: Num): string => `${format(value)} ${JSON.stringify(toParts(value))}`;

expect.extend({
  toBeApprox(received: Num, expected: Num, tolerance: number = DEFAULT_TOLERANCE) {
    return {
      pass: approxEqual(received, expected, tolerance),
      message: () =>
        `${describeNum(received)} が ${describeNum(expected)} と相対誤差 ${tolerance} の範囲で${this.isNot ? "等しくない" : "等しい"}ことを期待した`,
    };
  },
});
