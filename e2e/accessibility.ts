import type { CDPSession } from "@playwright/test";

/** アクセシビリティツリーの節の役割と名前。 */
export interface AccessibleNode {
  readonly role: string;
  readonly name: string;
}

/**
 * フォーカスを持つ要素（`document.activeElement`）について、Chromium が計算したアクセシビリティツリー
 * （Chrome DevTools Protocol の Accessibility.getPartialAXTree）の節の役割と名前。`cdp` はそのページにつないだもの
 * （`page.context().newCDPSession(page)`）を渡す。
 *
 * Playwright の `toHaveAccessibleName`・`getByRole` は Playwright が自分で名前を計算するので、ブラウザが支援技術へ
 * 渡す値はこちらで確かめる。
 */
export const focusedAccessibleNode = async (
  cdp: Readonly<Pick<CDPSession, "send">>,
): Promise<AccessibleNode> => {
  const { result } = await cdp.send("Runtime.evaluate", { expression: "document.activeElement" });
  if (result.objectId === undefined) {
    throw new Error(`document.activeElement が要素でない: ${String(result.description)}`);
  }
  const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
    objectId: result.objectId,
    fetchRelatives: false,
  });
  const [node] = nodes;
  if (node === undefined) {
    throw new Error("フォーカスを持つ要素の節が、アクセシビリティツリーに無い");
  }
  return { role: String(node.role?.value ?? ""), name: String(node.name?.value ?? "") };
};
