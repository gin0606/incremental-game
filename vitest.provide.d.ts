/**
 * vitest.config.ts が `provide` でテストへ渡し、vitest.setup.ts が `inject` で受け取る値の型。
 * vitest.config.ts はこの型のために vitest.setup.ts を読まない。読むと、その先のゲームのコードまでが設定ファイルの
 * program に入り、composite な tsconfig.node.lint.json が列挙していないファイルとして TS6307 になる（エディタと、
 * その設定を直接 tsrs で検査したときに出る。pnpm run の検査には出ない）。
 * tsconfig.json と tsconfig.node.json の両方に含まれるため .d.ts にする（理由は tsconfig.json の references のコメント）。
 */
export interface FastCheckSettings {
  readonly seed?: number;
  readonly numRuns?: number;
}

declare module "vitest" {
  export interface ProvidedContext {
    fastCheck: FastCheckSettings;
  }
}
