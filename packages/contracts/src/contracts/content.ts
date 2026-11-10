import { z } from "zod";
import {
  documentTemplateVariables,
  type DocumentTemplateValues,
} from "./variables.js";

export interface DocumentNode {
  type:
    | "doc"
    | "paragraph"
    | "heading"
    | "text"
    | "hardBreak"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "documentField";
  text?: string | undefined;
  attrs?:
    | {
        level?: number | undefined;
        textAlign?: "left" | "center" | "right" | "justify" | undefined;
        start?: number | undefined;
        key?: string | undefined;
      }
    | undefined;
  marks?: Array<{ type: "bold" | "italic" | "underline" }> | undefined;
  content?: DocumentNode[] | undefined;
}
export interface DocumentContent {
  version: 1;
  doc: DocumentNode;
}

const nodeSchema: z.ZodType<DocumentNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "doc",
        "paragraph",
        "heading",
        "text",
        "hardBreak",
        "bulletList",
        "orderedList",
        "listItem",
        "documentField",
      ]),
      text: z.string().optional(),
      attrs: z
        .object({
          level: z.number().int().min(1).max(2).optional(),
          textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
          start: z.number().int().min(1).max(10000).optional(),
          key: z.string().optional(),
        })
        .strict()
        .optional(),
      marks: z
        .array(
          z.object({ type: z.enum(["bold", "italic", "underline"]) }).strict(),
        )
        .max(3)
        .optional(),
      content: z.array(nodeSchema).max(1000).optional(),
    })
    .strict(),
);

export const documentContentSchema = z
  .object({ version: z.literal(1), doc: nodeSchema })
  .strict()
  .superRefine((value, context) => {
    const inline = ["text", "hardBreak", "documentField"];
    const blocks = ["paragraph", "heading", "bulletList", "orderedList"];
    function check(node: DocumentNode, depth: number): boolean {
      if (depth > 16) return false;
      const children = node.content ?? [];
      if (node.type === "text" && (!node.text || children.length)) return false;
      if (node.type !== "text" && node.text !== undefined) return false;
      if (!inline.includes(node.type) && node.marks?.length) return false;
      if (inline.includes(node.type) && children.length) return false;
      if (
        node.type === "documentField" &&
        !documentTemplateVariables.some((v) => v.key === node.attrs?.key)
      )
        return false;
      if (node.type === "heading" && !node.attrs?.level) return false;
      if (node.attrs?.key !== undefined && node.type !== "documentField")
        return false;
      if (node.attrs?.level !== undefined && node.type !== "heading")
        return false;
      if (
        node.attrs?.textAlign !== undefined &&
        !["paragraph", "heading"].includes(node.type)
      )
        return false;
      if (node.attrs?.start !== undefined && node.type !== "orderedList")
        return false;
      const allowed =
        node.type === "doc" || node.type === "listItem"
          ? blocks
          : node.type === "paragraph" || node.type === "heading"
            ? inline
            : node.type === "bulletList" || node.type === "orderedList"
              ? ["listItem"]
              : [];
      return children.every(
        (child) => allowed.includes(child.type) && check(child, depth + 1),
      );
    }
    if (value.doc.type !== "doc" || !check(value.doc, 0))
      context.addIssue({
        code: "custom",
        message: "Estrutura do documento inválida.",
      });
    if (documentContentText(value).length > 20000)
      context.addIssue({
        code: "custom",
        message: "O conteúdo deve ter no máximo 20.000 caracteres.",
      });
  });

export function documentContentText(content: DocumentContent): string {
  function text(node: DocumentNode): string {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "documentField") return `{{${node.attrs?.key}}}`;
    if (node.type === "bulletList" || node.type === "orderedList")
      return (node.content ?? [])
        .map(
          (child, i) =>
            `${node.type === "bulletList" ? "•" : `${(node.attrs?.start ?? 1) + i}.`} ${text(child)}`,
        )
        .join("\n");
    return (node.content ?? [])
      .map(text)
      .join(node.type === "doc" || node.type === "listItem" ? "\n\n" : "");
  }
  return text(content.doc);
}

/** Importação não destrutiva de texto legado e seus campos automáticos. */
export function documentContentFromText(body: string): DocumentContent {
  return {
    version: 1,
    doc: {
      type: "doc",
      content: body.split("\n\n").map((paragraph) => {
        const content: DocumentNode[] = [];
        for (const piece of paragraph.split(/(\n|\{\{[a-z_]+\}\})/g)) {
          if (!piece) continue;
          const key = piece.slice(2, -2);
          content.push(
            piece === "\n"
              ? { type: "hardBreak" }
              : documentTemplateVariables.some((v) => v.key === key) &&
                  piece.startsWith("{{")
                ? { type: "documentField", attrs: { key } }
                : {
                    type: "text",
                    text: piece,
                    ...(/^CLÁUSULA \d+ª[^\n]*$/.test(piece)
                      ? { marks: [{ type: "bold" as const }] }
                      : {}),
                  },
          );
        }
        return /^(CONTRATO DE PRESTAÇÃO DE SERVIÇOS|CLÁUSULA \d+ª[^\n]*)$/.test(
          paragraph,
        )
          ? {
              type: "heading",
              attrs: { level: paragraph.startsWith("CLÁUSULA") ? 2 : 1 },
              content,
            }
          : { type: "paragraph", content };
      }),
    },
  };
}

export function fillDocumentContent(
  content: DocumentContent,
  values: Partial<DocumentTemplateValues>,
): DocumentContent {
  function fill(node: DocumentNode): DocumentNode {
    if (node.type === "documentField") {
      const text =
        values[node.attrs?.key as keyof DocumentTemplateValues] ?? "";
      return text
        ? { type: "text", text, ...(node.marks ? { marks: node.marks } : {}) }
        : { type: "text", text: "" };
    }
    return {
      ...node,
      ...(node.content
        ? {
            content: node.content
              .map(fill)
              .filter((child) => child.type !== "text" || Boolean(child.text)),
          }
        : {}),
    };
  }
  return { version: 1, doc: fill(content.doc) };
}

export function documentContentFields(content: DocumentContent): string[] {
  const keys = new Set<string>();
  function walk(node: DocumentNode) {
    if (node.type === "documentField" && node.attrs?.key)
      keys.add(node.attrs.key);
    node.content?.forEach(walk);
  }
  walk(content.doc);
  return [...keys];
}
