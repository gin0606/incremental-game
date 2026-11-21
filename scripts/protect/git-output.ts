// 取り込み前の検査（cli/check.ts）が読む git の出力の解釈。

export interface ChangedPath {
  /** `git diff --no-renames --name-status` の状態（A・D・M・T など）。 */
  readonly status: string;
  readonly path: string;
}

/** `git diff --no-renames --name-status -z` の出力（状態とパスを NUL で区切って交互に並べる）を読む。 */
export const parseNameStatus = (output: string): readonly ChangedPath[] => {
  const fields = output.split("\0");
  if (fields.at(-1) !== "" || fields.length % 2 !== 1) {
    throw new Error(`git diff --name-status -z の出力を読めない: ${JSON.stringify(output)}`);
  }
  // 偶数番目を状態、その次をパスとして組にする。末尾の空の要素は、次の要素が無いため組にならない。
  return fields.flatMap((status, index) =>
    index % 2 === 0 ? fields.slice(index + 1, index + 2).map((path) => ({ status, path })) : [],
  );
};

/**
 * 1 つのファイルの `git diff -U0` の出力から、追加・削除された行（先頭の `+`・`-` を除く）を集める。
 * 最初の `@@` までの見出し（`+++`・`---` の行を含む）と、`\ No newline at end of file` の行は読まない。
 */
export const parseUnifiedDiff = (
  output: string,
): { readonly added: readonly string[]; readonly removed: readonly string[] } => {
  const added: string[] = [];
  const removed: string[] = [];
  let inHunk = false;
  for (const line of output.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && line.startsWith("+")) {
      added.push(line.slice(1));
    } else if (inHunk && line.startsWith("-")) {
      removed.push(line.slice(1));
    }
  }
  return { added, removed };
};
