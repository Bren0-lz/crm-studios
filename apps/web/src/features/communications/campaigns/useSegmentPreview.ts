import type {
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

/**
 * Quem entra no segmento, consultado com pequeno atraso a cada mudança de
 * filtro. Sem mensagem (`templateId` vazio) ou com `segment` nulo, não consulta.
 */
export function useSegmentPreview(
  templateId: string,
  segment: WhatsappCampaignSegment | null,
): SegmentPreviewState {
  const key =
    templateId && segment ? JSON.stringify({ templateId, segment }) : "";
  const [result, setResult] = useState<{
    key: string;
    preview?: WhatsappCampaignPreview;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const { templateId: id, segment: filter } = JSON.parse(key) as {
        templateId: string;
        segment: WhatsappCampaignSegment;
      };
      api
        .previewWhatsappCampaign({
          templateId: id,
          audience: { mode: "segment", segment: filter },
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
