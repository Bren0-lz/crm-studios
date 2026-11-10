import type {
  CampaignAudienceKind,
  LeadAudienceFilter,
  WhatsappCampaignPreview,
  WhatsappCampaignSegment,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../../api";

export interface SegmentPreviewState {
  loading: boolean;
  preview?: WhatsappCampaignPreview | undefined;
  error?: string | undefined;
}

/** Leads no público dos filtros: quem entra e o filtro de leads. */
export interface SegmentLeads {
  audience: CampaignAudienceKind;
  leadFilter: LeadAudienceFilter;
}

/**
 * Quem entra no segmento, consultado com pequeno atraso a cada mudança de
 * filtro. Sem mensagem (`templateId` vazio) ou com `segment` nulo, não consulta.
 * Com `leads`, a contagem soma (ou só considera) os leads do filtro de leads.
 */
export function useSegmentPreview(
  templateId: string,
  segment: WhatsappCampaignSegment | null,
  leads?: SegmentLeads,
): SegmentPreviewState {
  const key =
    templateId && segment
      ? JSON.stringify({
          templateId,
          segment,
          ...(leads && leads.audience !== "patients" ? { leads } : {}),
        })
      : "";
  const [result, setResult] = useState<{
    key: string;
    preview?: WhatsappCampaignPreview;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const {
        templateId: id,
        segment: filter,
        leads: withLeads,
      } = JSON.parse(key) as {
        templateId: string;
        segment: WhatsappCampaignSegment;
        leads?: SegmentLeads;
      };
      api
        .previewWhatsappCampaign({
          templateId: id,
          audience: { mode: "segment", segment: filter, ...withLeads },
        })
        .then((preview) => active && setResult({ key, preview }))
        .catch(
          (cause: Error) => active && setResult({ key, error: cause.message }),
        );
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key]);
  const current = result?.key === key ? result : null;
  return {
    loading: !current,
    preview: current?.preview,
    error: current?.error,
  };
}
