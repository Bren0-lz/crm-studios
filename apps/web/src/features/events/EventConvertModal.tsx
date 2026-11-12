import type { EventParticipant, Patient } from "@crm/contracts";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { LeadConvertModal } from "../commercial/index";
import { PatientModal } from "../patients/index";

/**
 * "Se tornou cliente": o pedido de dados (CV1) e o cadastro completo de cliente (LC1), já
 * preenchido com o participante; ao salvar, o participante (lead) é convertido junto. Abre na frente de onde foi chamado, sem
 * sair da tela.
 */
export function EventConvertModal({
  participant,
  onClose,
  onConverted,
}: {
  participant: EventParticipant;
  onClose: () => void;
  onConverted: (patient: Patient, notice?: string) => void;
}) {
  const configuredTags = usePatientTags();
  return (
    <LeadConvertModal
      lead={participant}
      eyebrow="Eventos"
      title="Cadastrar cliente"
      onClose={onClose}
    >
      <PatientModal
        patient={undefined}
        lead={participant}
        eyebrow="Eventos"
        title="Cadastrar cliente"
        submitLabel="Cadastrar cliente"
        configuredTags={configuredTags}
        onClose={onClose}
        onSaved={(patient, notice) => onConverted(patient, notice)}
      />
    </LeadConvertModal>
  );
}
