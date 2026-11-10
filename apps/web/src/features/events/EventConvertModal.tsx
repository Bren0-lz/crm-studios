import type { EventParticipant, LeadConversion } from "@crm/contracts";
import { api } from "../../api";
import { LeadConvertModal } from "../commercial/index";

/**
 * "Se tornou cliente": o cadastro de cliente já preenchido com o participante, pela conversão
 * de lead (`POST /leads/:id/convert`). Abre na frente de onde foi chamado, sem sair da tela.
 */
export function EventConvertModal({
  participant,
  onClose,
  onConverted,
}: {
  participant: EventParticipant;
  onClose: () => void;
  onConverted: (conversion: LeadConversion) => void;
}) {
  return (
    <LeadConvertModal
      lead={participant}
      eyebrow="Eventos"
      title="Cadastrar cliente"
      confirmLabel="Cadastrar cliente"
      onClose={onClose}
      onConfirm={async (input) => {
        onConverted(await api.convertLead(participant.id, input));
      }}
    />
  );
}
