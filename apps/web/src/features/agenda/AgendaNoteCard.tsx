import type { AgendaNote } from "@crm/contracts";
import { StickyNote } from "lucide-react";
import { tagColorStyle } from "../../tag-colors";
import { timeLabel } from "../../shared/lib/formatting";

export function AgendaNoteCard({
  note,
  onOpen,
}: {
  note: AgendaNote;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="agenda-note"
      style={tagColorStyle(note.backgroundColor)}
      onClick={onOpen}
      aria-label={`Detalhes da nota: ${note.description}`}
    >
      <span>
        <StickyNote size={16} aria-hidden="true" />{" "}
        <time>
          {timeLabel.format(new Date(note.startsAt))}–
          {timeLabel.format(new Date(note.endsAt))}
        </time>
      </span>
      <span>{note.description}</span>
    </button>
  );
}
