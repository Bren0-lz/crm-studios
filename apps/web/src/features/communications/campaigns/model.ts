import {
  messageVariables,
  type WhatsappCampaignSegment,
  type MessageTemplate,
  type WhatsappCampaign,
  type WhatsappCampaignRecipient,
} from "@crm/contracts";

/** Pedaço do texto: normal, código `{{nome}}` ou trecho com a formatação do WhatsApp. */
export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string; label: string }
  | { kind: "bold" | "italic" | "strike"; text: string };

const variableLabels = new Map<string, string>(
  messageVariables.map((item) => [
    item.code.replace(/[{}\s]/g, ""),
    item.label,
  ]),
);

/**
 * Divide a mensagem para exibir como no WhatsApp: *negrito*, _itálico_,
 * ~riscado~ e, se `codes`, os `{{nome}}` como etiquetas.
 */
export function messageParts(text: string, codes = false): MessagePart[] {
  const pattern = codes
    ? /(\{\{\s*[\w.]+\s*\}\}|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g
    : /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  return text
    .split(pattern)
    .filter((piece) => piece !== "")
    .map((piece): MessagePart => {
      if (piece.startsWith("{{")) {
        const key = piece.replace(/[{}\s]/g, "");
        return {
          kind: "code",
          text: piece,
          label: variableLabels.get(key) ?? key,
        };
      }
      const inner = piece.slice(1, -1);
      if (piece.length > 2 && piece.startsWith("*") && piece.endsWith("*"))
        return { kind: "bold", text: inner };
      if (piece.length > 2 && piece.startsWith("_") && piece.endsWith("_"))
        return { kind: "italic", text: inner };
      if (piece.length > 2 && piece.startsWith("~") && piece.endsWith("~"))
        return { kind: "strike", text: inner };
      return { kind: "text", text: piece };
    });
}

/** O texto usa algum código de personalização (`{{nome}}`, `{{nome_completo}}`). */
export function usesVariables(text: string) {
  return messageParts(text, true).some((part) => part.kind === "code");
}

/** Insere `snippet` no lugar da seleção; devolve o texto e onde o cursor fica. */
export function insertAtSelection(
  text: string,
  snippet: string,
  start = text.length,
  end = start,
) {
  return {
    text: text.slice(0, start) + snippet + text.slice(end),
    cursor: start + snippet.length,
  };
}

/** Envolve a seleção com o marcador do WhatsApp (`*`, `_`, `~`). */
export function wrapSelection(
  text: string,
  marker: string,
  start: number,
  end: number,
) {
  const selected = text.slice(start, end) || "texto";
  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  };
}

export function campaignHandled(campaign: WhatsappCampaign) {
  return campaign.sent + campaign.skipped;
}

/** Próximo pendente depois de `afterIndex` (dá a volta na lista); -1 se não houver. */
export function nextPendingIndex(
  recipients: WhatsappCampaignRecipient[],
  afterIndex = -1,
) {
  for (let step = 1; step <= recipients.length; step++) {
    const index = (afterIndex + step) % recipients.length;
    if (recipients[index]?.status === "pending") return index;
  }
  return -1;
}

export const campaignDateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function campaignPath(campaignId: string) {
  return `/comunicacoes/campanhas/${campaignId}`;
}

/** Imagem no editor: já salva (`id`) ou nova, lida do computador (`dataUrl`). */
export type EditorImage =
  | { key: string; id: string; fileName: string; sizeBytes: number }
  | { key: string; fileName: string; sizeBytes: number; dataUrl: string };

export interface TemplateDraft {
  title: string;
  body: string;
  images: EditorImage[];
}

export function templateDraft(template?: MessageTemplate): TemplateDraft {
  return {
    title: template?.title ?? "",
    body: template?.body ?? "",
    images:
      template?.images.map((image) => ({
        key: image.id,
        id: image.id,
        fileName: image.fileName,
        sizeBytes: image.sizeBytes,
      })) ?? [],
  };
}

export type CampaignFilterGroup =
  "tags" | "profile" | "dates" | "agenda" | "plans" | "repeat";

/** Filtros da campanha sem nada ligado, só com "ativos" (o começo mais comum). */
export function emptyCampaignSegment(): WhatsappCampaignSegment {
  return { tags: [], birthdayMonth: false, status: "active" };
}

/** Quantos filtros estão ligados em cada grupo (o "ativos" padrão conta). */
export function filterGroupCounts(
  segment: WhatsappCampaignSegment,
): Record<CampaignFilterGroup, number> {
  const has = (value: unknown) =>
    Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== false && value !== "";
  const count = (...values: unknown[]) => values.filter(has).length;
  return {
    tags: count(segment.tags, segment.excludeTags),
    profile: count(
      segment.status,
      segment.gender,
      segment.ageMin,
      segment.ageMax,
      segment.city,
      segment.neighborhood,
      segment.source,
      segment.occupation,
      segment.interest,
      segment.level,
    ),
    dates: count(
      segment.birthdayMonth,
      segment.birthMonth,
      segment.newClientDays,
    ),
    agenda: count(
      segment.serviceIds,
      segment.professionalIds,
      segment.absentDays,
      segment.visitedWithinDays,
      segment.noUpcomingAppointment,
    ),
    plans: count(
      segment.activePlan,
      segment.planExpiringDays,
      segment.maxRemainingSessions,
      segment.overdue,
    ),
    repeat: count(segment.excludeContactedDays),
  };
}

export function activeFilterCount(segment: WhatsappCampaignSegment) {
  return Object.values(filterGroupCounts(segment)).reduce(
    (total, value) => total + value,
    0,
  );
}
