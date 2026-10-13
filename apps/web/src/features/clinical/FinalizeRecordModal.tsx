import type { ClinicalRecord } from "@crm/contracts";
import { ActionModal } from "../../shared/components/ActionModal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";

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
  return (
    <ActionModal
      eyebrow="Prontuários"
      title="Finalizar evolução"
      subtitle={`${record.patientName} · ${shortDate.format(startsAt)} às ${timeLabel.format(startsAt)}`}
      effect="Depois de finalizada, a evolução fica fechada e não poderá mais ser editada. Confira o texto antes de confirmar."
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
