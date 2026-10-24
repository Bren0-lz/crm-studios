import type {
  CampaignFilterOptions,
  PatientOption,
  WhatsappCampaignSegment,
} from "@crm/contracts";
import { useState } from "react";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";
import { useFormDirty } from "../../../shared/workflows/useDirtyGuard";
import { CampaignFilters } from "./CampaignFilters";
import { useSegmentPreview } from "./useSegmentPreview";

/**
 * Configura os filtros da campanha num modal sobre a "Nova campanha". Trabalha
 * num rascunho: só "Aplicar filtros" muda a lista de quem recebe.
 */
export function CampaignFiltersModal({
  templateId,
  initial,
  options,
  patients,
  onApply,
  onClose,
}: {
  templateId: string;
  initial: WhatsappCampaignSegment;
  options: CampaignFilterOptions | null;
  patients: PatientOption[];
  onApply: (segment: WhatsappCampaignSegment) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const dirty = useFormDirty(draft);
  const { loading, preview, error } = useSegmentPreview(templateId, draft);
  return (
    <Modal
      className="campaign-filters-modal"
      eyebrow="Campanha de WhatsApp"
      title="Filtros da campanha"
      subtitle="Combine os filtros; a contagem abaixo mostra na hora quantos clientes entram."
      dirty={dirty}
      onClose={onClose}
    >
      <CampaignFilters
        value={draft}
        options={options}
        patients={patients}
        onChange={setDraft}
      />
      <div className="modal-actions campaign-filters-modal-actions">
        <p className="campaign-filters-modal-count" role="status">
          {loading ? (
            "Contando clientes…"
          ) : error ? (
            "Não foi possível contar os clientes"
          ) : (
            <>
              <strong>{preview!.recipients}</strong>{" "}
              {preview!.recipients === 1
                ? "cliente vai receber"
                : "clientes vão receber"}
            </>
          )}
        </p>
        <ModalCancelButton>Cancelar</ModalCancelButton>
        <button
          type="button"
          className="primary-button"
          onClick={() => onApply(draft)}
        >
          Aplicar filtros
        </button>
      </div>
    </Modal>
  );
}
