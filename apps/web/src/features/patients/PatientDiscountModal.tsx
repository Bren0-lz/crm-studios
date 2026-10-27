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
  const [error, setError] = useState("");
  const dirty = useFormDirty({ type, percent, amountInCents });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = patientDiscountSchema.safeParse(
      type === "percentage"
        ? { type, percent: Number(percent.replace(",", ".")) || 0 }
        : { type, amountInCents: amountInCents ?? 0 },
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
