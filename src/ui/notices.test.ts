import { expect, test } from "vitest";

import { createNotices } from "./notices.ts";

const setup = (): {
  readonly rendered: string[];
  readonly notices: ReturnType<typeof createNotices>;
} => {
  const rendered: string[] = [];
  const notices = createNotices((text) => {
    rendered.push(text);
  });
  return { rendered, notices };
};

test("知らせた文を行に重ね、変わるたびに全文を描く", () => {
  const { rendered, notices } = setup();

  notices.show("一つ目");
  notices.show("二つ目");

  expect(rendered).toStrictEqual(["一つ目", "一つ目\n二つ目"]);
});

test("保存の失敗はほかの文の後に 1 つだけ示し、同じ失敗では描き直さず、保存できたら消す", () => {
  const { rendered, notices } = setup();

  notices.show("一つ目");
  notices.setSaveError("保存できなかった");
  notices.setSaveError("保存できなかった");
  notices.show("二つ目");
  notices.setSaveError("別の理由で保存できなかった");
  notices.setSaveError(undefined);
  notices.setSaveError(undefined);

  expect(rendered).toStrictEqual([
    "一つ目",
    "一つ目\n保存できなかった",
    "一つ目\n二つ目\n保存できなかった",
    "一つ目\n二つ目\n別の理由で保存できなかった",
    "一つ目\n二つ目",
  ]);
});

test("消すのは知らせた文だけで、保存の失敗は残す", () => {
  const { rendered, notices } = setup();

  notices.show("一つ目");
  notices.setSaveError("保存できなかった");
  notices.clear();
  notices.show("二つ目");

  expect(rendered).toStrictEqual([
    "一つ目",
    "一つ目\n保存できなかった",
    "保存できなかった",
    "二つ目\n保存できなかった",
  ]);
});
