import type { ScheduleBlock } from "@crm/contracts";
import { ActionModal } from "../../shared/components/ActionModal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";

export function CancelBlockModal({
  block,
  onClose,
  onConfirm,
}: {
  block: ScheduleBlock;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const startsAt = new Date(block.startsAt);
  const endsAt = new Date(block.endsAt);
  const who = block.professionalName ?? block.roomName;
  return (
    <ActionModal
      eyebrow="Agenda"
      title="Cancelar bloqueio"
      subtitle={`${block.reason} · ${shortDate.format(startsAt)}, ${timeLabel.format(startsAt)}–${timeLabel.format(endsAt)}`}
      effect={`O horário de ${shortDate.format(startsAt)}, das ${timeLabel.format(startsAt)} às ${timeLabel.format(endsAt)}${who ? ` (${who})` : ""}, volta a ficar livre para novos agendamentos.`}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
