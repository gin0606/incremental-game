/** 利用者に知らせる文。変わるたびに、表示する全文を渡された関数へ渡す。 */
export interface Notices {
  readonly show: (message: string) => void;
  /** {@link show} で出した文を消す。保存の失敗は消さない。 */
  readonly clear: () => void;
  /**
   * 保存の失敗を知らせる。失敗は自動保存のたびに起きうるため積み重ねず 1 つだけ示し、`undefined` で消す
   * （保存できたら消す）。
   */
  readonly setSaveError: (message: string | undefined) => void;
}

export function createNotices(render: (text: string) => void): Notices {
  const shown: string[] = [];
  let saveError: string | undefined;
  const update = (): void => {
    render([...shown, ...(saveError === undefined ? [] : [saveError])].join("\n"));
  };
  return {
    show: (message) => {
      shown.push(message);
      update();
    },
    clear: () => {
      shown.length = 0;
      update();
    },
    setSaveError: (message) => {
      if (message !== saveError) {
        saveError = message;
        update();
      }
    },
  };
}
