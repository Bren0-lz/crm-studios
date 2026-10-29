import {
  cnpjDigits,
  cpfDigits,
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  type PaymentMethod,
  type Supplier,
  type SupplierBillingCycle,
  type SupplierInput,
} from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { currency } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { paymentMethodOptions } from "./model";

const emptySupplier: SupplierInput = {
  name: "",
  kind: "company",
  document: "",
  phone: "",
  whatsapp: "",
  email: "",
  billingCycle: "one_time",
  installments: 1,
  paymentTerms: "",
  orders: "",
  contracts: "",
  notes: "",
  active: true,
};

const billingCycleOptions: { value: SupplierBillingCycle; label: string }[] = [
  { value: "one_time", label: "Valor único" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly", label: "Anual" },
];

function documentDigits(kind: SupplierInput["kind"], value: string) {
  return kind === "person" ? cpfDigits(value) : cnpjDigits(value);
}

/** Documento preenchido por completo, mas com dígitos verificadores errados. */
function invalidDocument(form: SupplierInput) {
  const digits = documentDigits(form.kind, form.document);
  if (!digits) return false;
  return form.kind === "person"
    ? digits.length !== 11 || !isValidCpf(digits)
    : digits.length !== 14 || !isValidCnpj(digits);
}

export function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | "new";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<SupplierInput>(() =>
    supplier === "new" ? emptySupplier : { ...emptySupplier, ...supplier },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentTouched, setDocumentTouched] = useState(false);
  const dirty = useFormDirty(form, true);
  const isNew = supplier === "new";
  const person = form.kind === "person";
  const documentLabel = person ? "CPF" : "CNPJ";
  const documentError =
    documentTouched && invalidDocument(form)
      ? `Informe um ${documentLabel} válido.`
      : "";
  const installmentValue =
    form.contractAmountInCents && form.installments > 1
      ? `${form.installments}× de ${currency.format(
          Math.round(form.contractAmountInCents / form.installments) / 100,
        )}`
      : "";

  function update<K extends keyof SupplierInput>(
    key: K,
    value: SupplierInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Campos opcionais vazios saem do objeto: a API rejeita data, valor e forma em branco.
  function updateOptional<
    K extends "hiredOn" | "contractAmountInCents" | "paymentMethod",
  >(key: K, value: SupplierInput[K] | "") {
    setForm((current) => {
      const next = { ...current };
      if (value === undefined || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function submit() {
    setDocumentTouched(true);
    if (invalidDocument(form)) {
      setError(
        `Informe um ${documentLabel} válido ou deixe o campo em branco.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.saveSupplier(form, isNew ? undefined : supplier.id);
      toast.success(
        isNew ? "Fornecedor cadastrado." : "Fornecedor atualizado.",
      );
      await onSaved();
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? "Novo fornecedor" : "Editar fornecedor"}
      subtitle="Desativar mantém os vínculos e o histórico das despesas."
      wide
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        className="clinical-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && <ErrorBanner error={error} />}
        <fieldset className="form-fields form-grid" disabled={busy}>
          <label className="span-2">
            Nome
            <input
              required
              minLength={2}
              maxLength={160}
              placeholder={
                person ? "Nome completo" : "Razão social ou nome fantasia"
              }
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>
          <label>
            Tipo
            <select
              value={form.kind}
              onChange={(event) =>
                update("kind", event.target.value as SupplierInput["kind"])
              }
            >
              <option value="company">Pessoa jurídica</option>
              <option value="person">Pessoa física</option>
            </select>
          </label>
          <div className="field-with-hint">
            <label>
              {documentLabel}
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder={person ? "000.000.000-00" : "00.000.000/0000-00"}
                maxLength={person ? 14 : 18}
                value={
                  person ? formatCpf(form.document) : formatCnpj(form.document)
                }
                aria-invalid={documentError ? true : undefined}
                aria-describedby={
                  documentError ? "supplier-document-error" : undefined
                }
                onBlur={() => setDocumentTouched(true)}
                onChange={(event) =>
                  update(
                    "document",
                    documentDigits(form.kind, event.target.value),
                  )
                }
              />
            </label>
            {documentError && (
              <small
                id="supplier-document-error"
                className="field-error"
                aria-live="polite"
              >
                {documentError}
              </small>
            )}
          </div>

          <fieldset className="form-fieldset span-2">
            <legend>Contato</legend>
            <div className="form-fieldset-grid">
              <label>
                Telefone
                <PhoneInput
                  value={form.phone}
                  onChange={(digits) => update("phone", digits)}
                />
              </label>
              <label>
                WhatsApp
                <PhoneInput
                  value={form.whatsapp}
                  onChange={(digits) => update("whatsapp", digits)}
                />
              </label>
              <label className="span-2">
                E-mail
                <input
                  type="email"
                  placeholder="contato@empresa.com.br"
                  value={form.email ?? ""}
                  onChange={(event) => update("email", event.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-fieldset span-2">
            <legend>Contratação e valores</legend>
            <div className="form-fieldset-grid">
              <label>
                Data de contratação
                <input
                  type="date"
                  value={form.hiredOn ?? ""}
                  onChange={(event) =>
                    updateOptional("hiredOn", event.target.value)
                  }
                />
              </label>
              <label>
                Valor contratado (R$)
                <MoneyInput
                  valueInCents={form.contractAmountInCents ?? null}
                  onChange={(cents) =>
                    updateOptional("contractAmountInCents", cents ?? "")
                  }
                />
              </label>
              <label>
                Recorrência
                <select
                  value={form.billingCycle}
                  onChange={(event) =>
                    update(
                      "billingCycle",
                      event.target.value as SupplierBillingCycle,
                    )
                  }
                >
                  {billingCycleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="form-fieldset span-2">
            <legend>Pagamento</legend>
            <div className="form-fieldset-grid">
              <label>
                Forma de pagamento
                <select
                  value={form.paymentMethod ?? ""}
                  onChange={(event) =>
                    updateOptional(
                      "paymentMethod",
                      event.target.value as PaymentMethod | "",
                    )
                  }
                >
                  <option value="">Não definida</option>
                  {paymentMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-with-hint">
                <label>
                  Parcelas
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    value={form.installments}
                    onChange={(event) =>
                      update(
                        "installments",
                        Math.max(
                          1,
                          Math.trunc(Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
                {installmentValue && (
                  <small className="field-hint">{installmentValue}</small>
                )}
              </div>
              <label className="span-2">
                Condições de pagamento
                <input
                  maxLength={300}
                  placeholder="Ex.: entrada + 3x no boleto, vencimento todo dia 10"
                  value={form.paymentTerms}
                  onChange={(event) =>
                    update("paymentTerms", event.target.value)
                  }
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-fieldset span-2">
            <legend>Pedidos e contratos</legend>
            <div className="form-fieldset-grid">
              <label className="span-2">
                Pedidos
                <textarea
                  maxLength={2000}
                  placeholder="Itens ou serviços pedidos, números de pedido e prazos de entrega"
                  value={form.orders}
                  onChange={(event) => update("orders", event.target.value)}
                />
              </label>
              <label className="span-2">
                Contratos
                <textarea
                  maxLength={2000}
                  placeholder="Número do contrato, vigência, reajuste e onde o documento está guardado"
                  value={form.contracts}
                  onChange={(event) => update("contracts", event.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <label className="span-2">
            Observações
            <textarea
              value={form.notes}
              maxLength={1000}
              onChange={(event) => update("notes", event.target.value)}
            />
          </label>
          <label className="checkbox-field span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => update("active", event.target.checked)}
            />
            Ativo
          </label>
        </fieldset>
        <div className="modal-actions">
          <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={busy}>
            Salvar fornecedor
          </button>
        </div>
      </form>
    </Modal>
  );
}
