import { describe, expect, it } from "vitest";
import {
  documentTemplateFields,
  supplierDocumentGaps,
} from "./supplier-check.js";

describe("supplier document gaps", () => {
  const body =
    "Contrato com {{fornecedor_nome}}, CNPJ {{fornecedor_documento}}, valor {{fornecedor_valor}}, " +
    "pago {{fornecedor_pagamento}}, desde {{fornecedor_contratacao}}. Plano {{plano_nome}}. {{clinica_nome}}";

  it("lists the supplier fields the template needs and the registration lacks", () => {
    const fields = documentTemplateFields({ body });
    expect(
      supplierDocumentGaps(fields, {
        name: "Equipamentos Pilates",
        kind: "company",
        document: "",
        contractAmountInCents: 240_000,
        billingCycle: "monthly",
        installments: 1,
        paymentTerms: "",
      }),
    ).toEqual([
      {
        key: "plano_nome",
        label: "Plano",
        reason: "not_applicable",
      },
      {
        key: "fornecedor_documento",
        label: "CPF ou CNPJ do fornecedor",
        reason: "missing",
        source: "document",
        fieldLabel: "CPF ou CNPJ",
      },
      {
        key: "fornecedor_pagamento",
        label: "Pagamento ao fornecedor",
        reason: "missing",
        source: "paymentMethod",
        fieldLabel: "Forma ou condições de pagamento",
      },
      {
        key: "fornecedor_contratacao",
        label: "Data de contratação do fornecedor",
        reason: "missing",
        source: "hiredOn",
        fieldLabel: "Data de contratação",
      },
    ]);
  });

  it("is empty when every field the template uses is filled", () => {
    const fields = documentTemplateFields({
      body: "Contrato com {{fornecedor_nome}}, pago {{fornecedor_pagamento}}.",
    });
    expect(
      supplierDocumentGaps(fields, {
        name: "Limpeza Brilho",
        kind: "company",
        paymentTerms: "Todo dia 10",
      }),
    ).toEqual([]);
    expect(
      supplierDocumentGaps(fields, { name: " ", kind: "company" }).map(
        (gap) => gap.key,
      ),
    ).toEqual(["fornecedor_nome", "fornecedor_pagamento"]);
  });
});
