import { patientDiscountSchema, type PatientDiscount } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/**
 * Desconto do cliente (porcentagem ou valor). Só altera o formulário do cadastro:
 * o desconto é gravado junto com o cliente ao salvar.
 */
export function PatientDiscountModal({
  discount,
  onApply,
  onClose,
}: {
  discount: PatientDiscount | null | undefined;
  onApply: (discount: PatientDiscount | null) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<PatientDiscount["type"]>(
    discount?.type ?? "percentage",
  );
  const [percent, setPercent] = useState(
    discount?.type === "percentage"
      ? String(discount.percent).replace(".", ",")
      : "",
  );
  const [amountInCents, setAmountInCents] = useState<number | null>(
    discount?.type === "amount" ? discount.amountInCents : null,
  );
  const [scope, setScope] = useState<PatientDiscount["scope"]>(
    discount?.scope ?? "once",
  );
  const [charges, setCharges] = useState(
    discount?.scope === "next" && discount.charges
      ? String(discount.charges)
      : "3",
  );
  const [error, setError] = useState("");
  const dirty = useFormDirty({ type, percent, amountInCents, scope, charges });

  function submit(event: FormEvent) {
    event.preventDefault();
    const reach = {
      scope,
      ...(scope === "next" ? { charges: Number(charges) || 0 } : {}),
    };
    const parsed = patientDiscountSchema.safeParse(
      type === "percentage"
        ? { type, percent: Number(percent.replace(",", ".")) || 0, ...reach }
        : { type, amountInCents: amountInCents ?? 0, ...reach },
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Desconto inválido.");
      return;
    }
    onApply(parsed.data);
  }

  return (
    <Modal
      eyebrow="Clientes"
      title="Desconto do cliente"
      subtitle="Defina um desconto em porcentagem ou em valor para este cliente."
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <fieldset className="form-fieldset span-2">
          <legend>Tipo de desconto</legend>
          <div className="form-fieldset-grid">
            <label className="checkbox-field">
              <input
                type="radio"
                name="patient-discount-type"
                checked={type === "percentage"}
                onChange={() => setType("percentage")}
              />
              Porcentagem (%)
            </label>
            <label className="checkbox-field">
              <input
                type="radio"
                name="patient-discount-type"
                checked={type === "amount"}
                onChange={() => setType("amount")}
              />
              Valor (R$)
            </label>
          </div>
        </fieldset>
        {type === "percentage" ? (
          <label className="span-2">
            Porcentagem de desconto (%)
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex.: 10"
              value={percent}
              onChange={(e) =>
                setPercent(e.target.value.replace(/[^\d.,]/g, ""))
              }
            />
          </label>
        ) : (
          <label className="span-2">
            Valor do desconto (R$)
            <MoneyInput
              valueInCents={amountInCents}
              onChange={setAmountInCents}
            />
          </label>
        )}
        <fieldset className="form-fieldset span-2">
          <legend>Onde o desconto vale</legend>
          <div className="form-fieldset-grid">
            <label className="checkbox-field">
              <input
                type="radio"
                name="patient-discount-scope"
                checked={scope === "once"}
                onChange={() => setScope("once")}
              />
              Só no próximo pagamento
            </label>
            <label className="checkbox-field">
              <input
                type="radio"
                name="patient-discount-scope"
                checked={scope === "next"}
                onChange={() => setScope("next")}
              />
              Nas próximas cobranças
            </label>
            <label className="checkbox-field">
              <input
                type="radio"
                name="patient-discount-scope"
                checked={scope === "permanent"}
                onChange={() => setScope("permanent")}
              />
              Permanente (até remover)
            </label>
          </div>
        </fieldset>
        {scope === "next" && (
          <label className="span-2">
            Quantas cobranças (parcelas ou renovações)
            <input
              type="number"
              min={2}
              max={36}
              value={charges}
              onChange={(e) => setCharges(e.target.value)}
            />
          </label>
        )}
        <p className="muted-copy span-2">
          Cada parcela ou renovação de plano é uma cobrança. O desconto entra
          nas próximas cobranças geradas; as que já existem não mudam.
          {discount && (discount.usedCharges ?? 0) > 0
            ? ` Já usado em ${discount.usedCharges} ${discount.usedCharges === 1 ? "cobrança" : "cobranças"}.`
            : ""}
        </p>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          {discount && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onApply(null)}
            >
              Remover desconto
            </button>
          )}
          <ModalCancelButton>Cancelar</ModalCancelButton>
          <button className="primary-button">Aplicar desconto</button>
        </div>
      </form>
    </Modal>
  );
}
