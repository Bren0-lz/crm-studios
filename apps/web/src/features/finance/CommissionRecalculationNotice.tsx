import type { CommissionRecalculationPreview } from "@crm/contracts";
import { currency, formatIsoDate } from "../../shared/lib/formatting";

const shown = 5;

function signed(cents: number) {
  return `${cents > 0 ? "+" : ""}${currency.format(cents / 100)}`;
}

/** Prévia do recálculo retroativo mostrada antes de salvar uma regra de comissão. */
export function CommissionRecalculationNotice({
  preview,
}: {
  preview: CommissionRecalculationPreview;
}) {
  const count = preview.items.length;
  return (
    <div className="commission-recalculation-preview span-2" role="status">
      <p>
        Esta mudança recalcula {count} {count === 1 ? "comissão" : "comissões"}{" "}
        de {formatIsoDate(preview.from)} a {formatIsoDate(preview.until)}{" "}
        (diferença: {signed(preview.differenceInCents)}
        {preview.adjustmentInCents
          ? `; ${signed(preview.adjustmentInCents)} em ajustes de comissões já pagas`
          : ""}
        ).
      </p>
      <ul>
        {preview.items.slice(0, shown).map((item) => (
          <li key={item.commissionId}>
            {formatIsoDate(item.sourceDate)} · {item.professionalName}:{" "}
            {currency.format(item.previousAmountInCents / 100)} →{" "}
            {currency.format(item.amountInCents / 100)}
            {item.mode === "adjustment"
              ? ` (já paga: ajuste de ${signed(item.differenceInCents)} no próximo pagamento)`
              : " (em aberto)"}
          </li>
        ))}
        {count > shown && <li>e mais {count - shown}.</li>}
      </ul>
      <p>Confirme para salvar a regra e recalcular.</p>
    </div>
  );
}
