import { patientDiscountSchema, type PatientDiscount } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/**
 * Para quem vale o desconto: plano (com alcance nas cobranças), produto, o pedido todo do
 * cadastro ou a venda inteira da tela Vendas.
 */
export type DiscountTarget = "plan" | "product" | "order" | "sale";

const discountTitles: Record<DiscountTarget, [string, string]> = {
  plan: [
    "Desconto do plano",
    "Defina um desconto em porcentagem ou em valor para este plano.",
  ],
  product: [
    "Desconto do produto",
    "Defina um desconto em porcentagem ou em valor para este produto.",
  ],
  order: [
    "Desconto geral",
    "Desconto sobre a soma dos planos e produtos da sacola, dividido entre eles pelo valor de cada um.",
  ],
  sale: [
    "Desconto geral",
    "Desconto sobre a soma dos produtos da venda, dividido entre eles pelo valor de cada um.",
  ],
};

/**
 * Desconto do plano, produto ou pedido vendido no cadastro (porcentagem ou valor). Só
 * altera o formulário: o desconto é gravado junto com a venda ao salvar. Produto e
 * desconto geral valem uma vez, na venda; só o plano escolhe o alcance nas cobranças.
 */
export function PatientDiscountModal({
  discount,
  target = "plan",
  eyebrow = "Clientes",
  onApply,
  onClose,
}: {
  discount: PatientDiscount | null | undefined;
  target?: DiscountTarget;
  /** Nome do módulo no topo do modal (o cadastro guiado fica em Clientes). */
  eyebrow?: string;
  onApply: (discount: PatientDiscount | null) => void;
  onClose: () => void;
}) {
  const [title, subtitle] = discountTitles[target];
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
    const reach =
      target === "plan"
        ? {
            scope,
            ...(scope === "next" ? { charges: Number(charges) || 0 } : {}),
          }
        : { scope: "once" as const };
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
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
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
        {target === "plan" && (
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
        )}
        {target === "plan" && scope === "next" && (
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
        {target === "plan" && (
          <p className="muted-copy span-2">
            Cada parcela ou renovação deste plano é uma cobrança. O desconto
            vale só nas cobranças deste plano, não nas de outros planos do
            cliente.
            {discount && (discount.usedCharges ?? 0) > 0
              ? ` Já usado em ${discount.usedCharges} ${discount.usedCharges === 1 ? "cobrança" : "cobranças"}.`
              : ""}
          </p>
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
