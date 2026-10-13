import type { GroupSession } from "@crm/contracts";
import { Users } from "lucide-react";
import { timeLabel } from "../../shared/lib/formatting";

export function GroupSessionCard({
  session,
  compact = false,
}: {
  session: GroupSession;
  compact?: boolean;
}) {
  const startsAt = timeLabel.format(new Date(session.startsAt));
  const endsAt = timeLabel.format(new Date(session.endsAt));
  if (compact)
    return (
      <article
        className="week-appointment group-class"
        aria-label={session.groupName}
      >
        <Users size={10} aria-hidden="true" />
        <time>
          {startsAt}–{endsAt}
        </time>
        <strong>{session.groupName}</strong>
        <span>
          {session.professionalName} · {session.roomName}
        </span>
      </article>
    );
  return (
    <article className="agenda-card group-class" aria-label={session.groupName}>
      <div className="agenda-time">
        <strong>{startsAt}</strong>
        <span>{endsAt}</span>
      </div>
      <div className="agenda-main">
        <div>
          <span className="service-name">
            <Users size={13} aria-hidden="true" />
            Aula em grupo
          </span>
          <h3>{session.groupName}</h3>
          <p>
            {session.professionalName} · {session.roomName}
          </p>
        </div>
      </div>
    </article>
  );
}
