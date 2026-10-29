import type { PatientDiscount } from "@crm/contracts";
import { patientDiscountLabel } from "./model";

/** Desconto de um plano ou serviço avulso vendido no cadastro: resumo e botão do modal. */
export function PlanDiscountSummary({
  discount,
  emptyLabel,
  oneTime = false,
  disabled,
  onEdit,
}: {
  discount: PatientDiscount | undefined;
  emptyLabel: string;
  /** Produto e desconto geral valem só na venda: sem o alcance nas cobranças. */
  oneTime?: boolean;
  disabled: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="discount-summary plan-discount">
      <p className="muted-copy">
        {!discount
          ? emptyLabel
          : oneTime
            ? patientDiscountLabel(discount).split(" · ")[0]
            : patientDiscountLabel(discount)}
      </p>
      <button
        type="button"
        className="secondary-button"
        disabled={disabled}
        onClick={onEdit}
      >
        {discount ? "Alterar desconto" : "Configurar desconto"}
      </button>
    </div>
  );
}
