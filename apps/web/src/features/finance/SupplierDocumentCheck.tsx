import {
  documentTemplateFields,
  missingDocumentValue,
  supplierDocumentGaps,
  type DocumentTemplate,
  type SupplierInput,
  type SupplierTemplateSource,
} from "@crm/contracts";

/**
 * Confere os campos do modelo escolhido com o que está preenchido no cadastro (mesmo sem
 * salvar) e diz o que sairia em branco no documento, com o atalho para o campo a preencher.
 */
export function SupplierDocumentCheck({
  template,
  form,
  onFix,
}: {
  template: DocumentTemplate;
  form: SupplierInput;
  onFix: (source: SupplierTemplateSource) => void;
}) {
  const gaps = supplierDocumentGaps(documentTemplateFields(template), {
    name: form.name,
    kind: form.kind,
    document: form.document,
    hiredOn: form.hiredOn,
    contractAmountInCents: form.contractAmountInCents,
    billingCycle: form.billingCycle,
    paymentMethod: form.paymentMethod,
    installments: form.installments,
    paymentTerms: form.paymentTerms,
  });
  if (!gaps.length)
    return (
      <p className="field-hint span-2" role="status">
        Os dados do fornecedor que o modelo usa estão preenchidos.
      </p>
    );
  const missing = gaps.filter((gap) => gap.reason === "missing");
  const notApplicable = gaps.filter((gap) => gap.reason === "not_applicable");
  return (
    <div
      className="supplier-document-check span-2"
      role="status"
      aria-label="Conferência do modelo"
    >
      {missing.length > 0 && (
        <>
          <p>
            <strong>Falta no cadastro para este modelo:</strong>
          </p>
          <ul>
            {missing.map((gap) => (
              <li key={gap.key}>
                <span>{gap.fieldLabel}</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onFix(gap.source)}
                >
                  Preencher
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {notApplicable.length > 0 && (
        <p>
          O modelo também usa campos que não existem para fornecedor:{" "}
          {notApplicable.map((gap) => gap.label).join(", ")}. Eles saem como
          “Não vinculado”; escolha um modelo de fornecedor ou ajuste o modelo em
          Contratos.
        </p>
      )}
      {missing.length > 0 && (
        <p className="field-hint">
          Sem esses dados, o documento sai com “{missingDocumentValue}” no
          lugar.
        </p>
      )}
    </div>
  );
}
