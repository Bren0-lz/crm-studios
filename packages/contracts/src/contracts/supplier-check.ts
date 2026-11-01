import {
  documentContentFields,
  documentContentFromText,
  type DocumentContent,
} from "./content.js";
import {
  documentTemplateValues,
  missingDocumentValue,
  type DocumentTemplateContext,
} from "./model.js";
import {
  documentTemplateVariables,
  type DocumentTemplateVariable,
} from "./variables.js";

/** Campo do cadastro de fornecedor que alimenta um campo `fornecedor_*` do modelo. */
export type SupplierTemplateSource =
  "name" | "document" | "contractAmountInCents" | "paymentMethod" | "hiredOn";

/**
 * Campo do modelo que sairia sem valor num documento de fornecedor:
 * - `missing`: o cadastro do fornecedor não tem o dado (`source` diz qual campo preencher);
 * - `not_applicable`: campo de cliente, plano ou profissional, que fica vazio para fornecedor.
 */
export type SupplierDocumentGap =
  | {
      key: DocumentTemplateVariable;
      label: string;
      reason: "missing";
      source: SupplierTemplateSource;
      /** Nome do campo no cadastro do fornecedor. */
      fieldLabel: string;
    }
  | { key: DocumentTemplateVariable; label: string; reason: "not_applicable" };

const supplierSources: Partial<
  Record<
    DocumentTemplateVariable,
    { source: SupplierTemplateSource; fieldLabel: string }
  >
> = {
  fornecedor_nome: { source: "name", fieldLabel: "Nome" },
  fornecedor_documento: { source: "document", fieldLabel: "CPF ou CNPJ" },
  fornecedor_valor: {
    source: "contractAmountInCents",
    fieldLabel: "Valor contratado",
  },
  fornecedor_pagamento: {
    source: "paymentMethod",
    fieldLabel: "Forma ou condições de pagamento",
  },
  fornecedor_contratacao: {
    source: "hiredOn",
    fieldLabel: "Data de contratação",
  },
};

const notForSuppliers = /^(paciente|plano|profissional)_/;

/** Campos `{{...}}` usados pelo modelo (texto antigo ou conteúdo do editor). */
export function documentTemplateFields(template: {
  body: string;
  content?: DocumentContent | undefined;
}) {
  return documentContentFields(
    template.content ?? documentContentFromText(template.body),
  );
}

/**
 * Cruza os campos do modelo com os dados do fornecedor (mesmo cálculo da emissão) e diz o
 * que sairia em branco. Dados da clínica não entram: vêm das configurações, não do cadastro.
 */
export function supplierDocumentGaps(
  fields: readonly string[],
  supplier: NonNullable<DocumentTemplateContext["supplier"]>,
): SupplierDocumentGap[] {
  const values = documentTemplateValues({
    clinic: { name: "" },
    supplier,
    issuedOn: "",
  });
  return documentTemplateVariables.flatMap(
    ({ key, label }): SupplierDocumentGap[] => {
      if (!fields.includes(key)) return [];
      if (notForSuppliers.test(key))
        return [{ key, label, reason: "not_applicable" }];
      const source = supplierSources[key];
      const value = values[key].trim();
      if (source && (!value || value === missingDocumentValue))
        return [{ key, label, reason: "missing", ...source }];
      return [];
    },
  );
}
