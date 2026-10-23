import { describe, expect, it } from "vitest";
import {
  documentContentFromText,
  documentContentSchema,
  documentContentText,
  fillDocumentContent,
} from "./content.js";
import {
  defaultContractTemplateBody,
  documentTemplateInputSchema,
} from "./model.js";
import { prepareDocumentContent } from "./preview.js";

describe("visual documents", () => {
  it("imports legacy text without losing lines, fields or standard clauses", () => {
    for (const body of [
      defaultContractTemplateBody,
      "Primeira linha\nSegunda linha\n\n\nÚltima linha\n",
      "Contrato {{paciente_nome}} com {{campo_legado}}.",
    ]) {
      const content = documentContentSchema.parse(
        documentContentFromText(body),
      );
      expect(documentContentText(content)).toBe(body);
    }
    expect(
      documentContentFromText(defaultContractTemplateBody).doc.content?.some(
        (node) =>
          node.content?.some(
            (child) =>
              child.text?.startsWith("CLÁUSULA 1ª") &&
              child.marks?.some((mark) => mark.type === "bold"),
          ),
      ),
    ).toBe(true);
  });
  it("fills fields as text while preserving emphasis and literal user values", () => {
    const content = documentContentFromText(
      "Cliente: {{paciente_nome}}. Condições acordadas.",
    );
    content.doc.content![0]!.content![1]!.marks = [{ type: "bold" }];
    const filled = fillDocumentContent(content, {
      paciente_nome: "Ana <script> & {{plano_nome}}",
    });
    expect(documentContentText(filled)).toBe(
      "Cliente: Ana <script> & {{plano_nome}}. Condições acordadas.",
    );
    expect(filled.doc.content![0]!.content![1]).toEqual({
      type: "text",
      text: "Ana <script> & {{plano_nome}}",
      marks: [{ type: "bold" }],
    });
    expect(documentContentText(content)).toContain("{{paciente_nome}}");
    const optional = fillDocumentContent(
      documentContentFromText(
        "Profissional [{{profissional_nome}}] [{{profissional_crefito}}].",
      ),
      {},
    );
    expect(documentContentText(optional)).toBe("Profissional [] [].");
    expect(documentContentSchema.safeParse(optional).success).toBe(true);
  });
  it("derives compatible text and validates structure, unknown fields and limits", () => {
    const content = documentContentFromText(
      "Este é o conteúdo visual completo do contrato.",
    );
    expect(
      documentTemplateInputSchema.parse({
        name: "Contrato visual",
        kind: "contract",
        body: "Texto divergente",
        content,
      }).body,
    ).toBe(documentContentText(content));
    const invalid = [
      { type: "image", attrs: { src: "javascript:alert(1)" } },
      { type: "paragraph", attrs: { onclick: "alert(1)" } },
      {
        type: "paragraph",
        content: [{ type: "documentField", attrs: { key: "desconhecido" } }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "x",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
      { type: "text", text: "Texto solto na raiz" },
    ];
    for (const node of invalid)
      expect(
        documentContentSchema.safeParse({
          version: 1,
          doc: { type: "doc", content: [node] },
        }).success,
      ).toBe(false);
    expect(
      documentContentSchema.safeParse(
        documentContentFromText("x".repeat(20001)),
      ).success,
    ).toBe(false);
  });
  it("reports only missing fields actually used in the document", () => {
    const source = documentContentFromText(
      "Cliente: {{paciente_nome}}. Plano: {{plano_nome}}.",
    );
    const values = Object.fromEntries(
      ["paciente_nome", "plano_nome", "clinica_cnpj"].map((key) => [
        key,
        key === "paciente_nome" ? "Maria" : "Não vinculado",
      ]),
    ) as Parameters<typeof prepareDocumentContent>[2];
    expect(prepareDocumentContent("", source, values).missingFields).toEqual([
      { key: "plano_nome", label: "Plano" },
    ]);
  });
});
