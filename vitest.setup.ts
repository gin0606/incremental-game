import * as fc from "fast-check";
import { inject } from "vitest";

export interface FastCheckSettings {
  readonly seed?: number;
  readonly numRuns?: number;
}

declare module "vitest" {
  export interface ProvidedContext {
    fastCheck: FastCheckSettings;
  }
}

fc.configureGlobal(inject("fastCheck"));
