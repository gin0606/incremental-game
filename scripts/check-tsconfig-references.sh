#!/bin/sh
# tsconfig.json が references で参照する lint 用の設定（composite）について、型情報を使う lint のための構成が
# 崩れていないことを確かめる。理由は tsconfig.json の references のコメントにある。`pnpm run typecheck` から呼ぶ。
#
# - tsconfig.json を `tsrs --noEmit -p` で検査する。参照先が composite でない（TS6306）、出力を止めている（TS6310）
#   などの、参照の要件を満たさない構成を拒む。
# - 参照先ごとに `tsrs --noEmit -p` で検査する。参照先が読むファイルを include で列挙していないと TS6307 になる。
# - 参照先と tsconfig.json の両方の program に入る TypeScript のソース（.d.ts と node_modules の下を除く）があれば
#   失敗する。tsconfig.json の program を型検査しても、そのファイルを読むコードが無いときや、参照先の出力が残って
#   いるときは型エラーにならないため、ファイルの一覧を比べる。tsconfig.json の一覧は、参照先への置き換えが起きない
#   tsconfig.check.json（同じ include・exclude を継承し、references は継承しない）から取る。
set -eu

# 参照先は、整形後の tsconfig.json の `"path": "…"` を grep で読む。コメントにこの形を書かない。
refs=$(grep -o '"path": *"[^"]*"' tsconfig.json | sed 's/^"path": *"\(.*\)"$/\1/')
if [ -z "$refs" ]; then
  echo "tsconfig.json の references から参照先を読めなかった。" >&2
  exit 1
fi

root=$(tsrs --listFilesOnly -p tsconfig.check.json)
status=0
tsrs --noEmit -p tsconfig.json || status=1
for ref in $refs; do
  tsrs --noEmit -p "$ref" || status=1
  files=$(tsrs --listFilesOnly -p "$ref")
  while IFS= read -r file; do
    case "$file" in
      */node_modules/* | *.d.ts | *.d.mts | *.d.cts) ;;
      *.ts | *.tsx | *.mts | *.cts)
        if printf '%s\n' "$root" | grep -Fxq -- "$file"; then
          echo "$file は tsconfig.json と $ref の両方の program に入っている。$ref の include に含めたなら .d.ts にするか include から外し、含めていないなら TS6307 のとおり import をやめる。" >&2
          status=1
        fi
        ;;
    esac
  done <<EOF
$files
EOF
done
exit "$status"
