import type { ScheduleBlock } from "@crm/contracts";
import { useAuthorization } from "../../authorization-context";
import { timeLabel } from "../../shared/lib/formatting";

export function ScheduleBlockCard({
  block,
  compact = false,
  onCancel,
}: {
  block: ScheduleBlock;
  compact?: boolean;
  /** Sem `onCancel` (sem permissão de edição) o botão de cancelar não aparece. */
  onCancel?: (() => void) | undefined;
}) {
  const { can } = useAuthorization();
  return (
    <article
      className={`schedule-block ${compact ? "compact" : ""} ${block.status}`}
    >
      <div>
        <strong>{block.reason}</strong>
        <span>
          {timeLabel.format(new Date(block.startsAt))} —{" "}
          {timeLabel.format(new Date(block.endsAt))}
        </span>
        {!compact && (
          <small>
            {[block.professionalName, block.roomName]
              .filter(Boolean)
              .join(" · ")}
          </small>
        )}
      </div>
      {block.status === "active" &&
        !compact &&
        onCancel &&
        can("agenda.blocks_cancel") && (
          <button className="danger-button button-sm" onClick={onCancel}>
            Cancelar bloqueio
          </button>
        )}
    </article>
  );
}
