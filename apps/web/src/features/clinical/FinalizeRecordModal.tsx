import type { ClinicalRecord } from "@crm/contracts";
import { ActionModal } from "../../shared/components/ActionModal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { missingSoapSteps } from "./model";

export function FinalizeRecordModal({
  record,
  onClose,
  onConfirm,
}: {
  record: ClinicalRecord;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const startsAt = new Date(record.appointmentStartsAt);
  const missing = missingSoapSteps(record);
  const missingText = missing.join(", ");
  return (
    <ActionModal
      eyebrow="Prontuários"
      title="Finalizar evolução"
      subtitle={`${record.patientName} · ${shortDate.format(startsAt)} às ${timeLabel.format(startsAt)}`}
      effect="Depois de finalizada, a evolução fica fechada e não poderá mais ser editada. Confira o texto antes de confirmar."
      validate={() =>
        missing.length
          ? `Preencha antes de finalizar: ${missingText}. Use "Editar" para completar o rascunho.`
          : ""
      }
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {missing.length > 0 && (
        <p className="span-2 form-error">Faltam as etapas: {missingText}.</p>
      )}
    </ActionModal>
  );
}
