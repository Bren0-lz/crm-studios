import { describe, expect, it } from "vitest";
import {
  eventLeadInputSchema,
  leadImportFileSchema,
  leadImportInputSchema,
  relaxedLeadInputSchema,
} from "../index.js";

describe("importação de leads por planilha (LI1)", () => {
  it("aceita linha sem nome nem telefone, sem evento e com interesse padrão", () => {
    expect(leadImportInputSchema.parse({ notes: "Só observação" })).toEqual(
      expect.objectContaining({
        fullName: "",
        phone: "",
        interest: "Não informado",
        notes: "Só observação",
      }),
    );
    expect(
      leadImportInputSchema.parse({
        phone: "(11) 99999-0000",
        source: "Feira",
      }),
    ).toMatchObject({ phone: "11999990000", source: "Feira" });
    expect(
      leadImportInputSchema.parse({ eventId: crypto.randomUUID() }),
    ).not.toHaveProperty("eventId");
    expect(
      relaxedLeadInputSchema.safeParse({ interest: "Pilates" }).success,
    ).toBe(false);
  });

  it("mantém os padrões do participante de evento", () => {
    expect(
      eventLeadInputSchema.parse({ eventId: crypto.randomUUID() }),
    ).toMatchObject({
      fullName: "",
      phone: "",
      source: "Evento",
      interest: "Evento",
    });
  });

  it("exige origem e etapa e recusa campo repetido no mapeamento", () => {
    const file = { fileName: "leads.csv", contentBase64: "eA==" };
    expect(
      leadImportFileSchema.safeParse({
        ...file,
        source: "Planilha",
        stage: "new_contact",
      }).success,
    ).toBe(true);
    expect(
      leadImportFileSchema.safeParse({
        ...file,
        source: "",
        stage: "new_contact",
      }).success,
    ).toBe(false);
    expect(
      leadImportFileSchema.safeParse({ ...file, source: "Planilha", stage: "" })
        .success,
    ).toBe(false);
    const repeated = leadImportFileSchema.safeParse({
      ...file,
      source: "Planilha",
      stage: "new_contact",
      mapping: ["source", "source"],
    });
    expect(repeated.success).toBe(false);
    expect(repeated.error?.issues[0]?.message).toBe(
      "O campo Origem foi escolhido em mais de uma coluna.",
    );
    expect(
      leadImportFileSchema.safeParse({
        ...file,
        source: "Planilha",
        stage: "new_contact",
        mapping: ["extra", "extra"],
      }).success,
    ).toBe(true);
  });
});
