import type { Holiday } from "@crm/contracts";
import { ActionModal } from "../../shared/components/ActionModal";
import { formatIsoDate } from "../../shared/lib/formatting";

export function DeleteHolidayModal({
  holiday,
  onClose,
  onConfirm,
}: {
  holiday: Holiday;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ActionModal
      eyebrow="Feriados"
      title="Excluir feriado"
      subtitle={`${holiday.name} · ${formatIsoDate(holiday.date)}`}
      effect={`A agenda volta a aceitar atendimentos em ${formatIsoDate(holiday.date)}.`}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
