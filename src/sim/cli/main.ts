import { runCli } from "../run.ts";

// シミュレーターの CLI。引数を読んで遊ばせる処理は run.ts にあり、ここは標準出力・標準エラー・終了コードにつなぐだけ。
process.exitCode = runCli(process.argv.slice(2), {
  out: (text) => {
    process.stdout.write(text);
  },
  error: (text) => {
    process.stderr.write(text);
  },
});
