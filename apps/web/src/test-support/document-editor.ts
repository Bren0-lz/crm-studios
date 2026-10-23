import { act } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

/** Usa a instância pública ligada ao contenteditable, incluindo suas transações reais. */
export function documentEditor(element: HTMLElement) {
  return (element as HTMLElement & { editor: Editor }).editor;
}
export function setDocumentText(element: HTMLElement, text: string) {
  act(() => {
    element.focus();
    documentEditor(element).commands.setContent({
      type: "doc",
      content: text.split("\n\n").map((paragraph) => ({
        type: "paragraph",
        content: paragraph
          .split("\n")
          .flatMap((line, index) => [
            ...(index ? [{ type: "hardBreak" }] : []),
            ...(line ? [{ type: "text", text: line }] : []),
          ]),
      })),
    });
  });
}

export function installDocumentBrowserMocks() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: () => "blob:test-contract",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: () => {},
  });
  if (!Range.prototype.getClientRects)
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
  if (!Range.prototype.getBoundingClientRect)
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
}
