import type {
  AppointmentPromotion,
  AutoCampaignPromotionOffer,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { shortDate } from "../../shared/lib/formatting";

/**
 * Pergunta, para cada campanha promocional que o cliente recebeu e ainda vale hoje, se o
 * atendimento é dela. No máximo uma marcada. Sem promoção (ou se a busca falhar), nada aparece.
 */
export function AppointmentPromotionField({
  patientId,
  value,
  onChange,
}: {
  patientId: string;
  value: AppointmentPromotion | undefined;
  onChange: (promotion: AppointmentPromotion | undefined) => void;
}) {
  const [offers, setOffers] = useState<{
    patientId: string;
    items: AutoCampaignPromotionOffer[];
  } | null>(null);
  useEffect(() => {
    if (!patientId) return;
    let active = true;
    api
      .appointmentPromotions(patientId)
      .then(
        (items) =>
          active &&
          setOffers({ patientId, items: Array.isArray(items) ? items : [] }),
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [patientId]);
  if (!patientId || offers?.patientId !== patientId) return null;
  return offers.items.map((offer) => {
    const checked =
      value?.source === offer.source &&
      value?.campaignId === offer.campaignId &&
      value.occurrenceKey === offer.occurrenceKey;
    return (
      <label
        className="checkbox-field span-2"
        key={`${offer.source ?? "auto"}:${offer.campaignId}:${offer.occurrenceKey}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? {
                    ...(offer.source ? { source: offer.source } : {}),
                    campaignId: offer.campaignId,
                    occurrenceKey: offer.occurrenceKey,
                  }
                : undefined,
            )
          }
        />
        <span>
          Esse atendimento é referente à campanha “{offer.campaignName}”?
          <span className="field-hint">
            {" "}
            Promoção válida para agendar até{" "}
            {shortDate.format(new Date(`${offer.validUntil}T12:00:00`))}.
          </span>
        </span>
      </label>
    );
  });
}
