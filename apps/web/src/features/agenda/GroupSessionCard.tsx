import { useAuthorization } from "../../authorization-context";
import { Link } from "react-router-dom";
import type { GroupSession } from "@crm/contracts";
import { ArrowUpRight } from "lucide-react";
import { timeLabel } from "../../shared/lib/formatting";
import { professionalColorStyle } from "../../tag-colors";

export function GroupSessionCard({
  session,
  compact = false,
  professionalColor,
}: {
  session: GroupSession;
  compact?: boolean;
  /** Cor do profissional responsável (bolinha, como nos atendimentos). */
  professionalColor?: string | undefined;
}) {
  const { can } = useAuthorization();
  const startsAt = timeLabel.format(new Date(session.startsAt));
  const endsAt = timeLabel.format(new Date(session.endsAt));
  if (compact)
    return (
      <article
        className="week-appointment group-class"
        style={professionalColorStyle(professionalColor)}
        aria-label={session.groupName}
      >
        <i className="pro-dot" aria-hidden="true" />
        <time>
          {startsAt}–{endsAt}
        </time>
        <strong className="group-name" title={session.groupName}>
          {session.groupName}
        </strong>
        <span>
          {session.professionalName} · {session.roomName}
        </span>
      </article>
    );
  return (
    <article
      className="agenda-card group-class"
      style={professionalColorStyle(professionalColor)}
      aria-label={session.groupName}
    >
      <div className="agenda-time">
        <strong>{startsAt}</strong>
        <span>{endsAt}</span>
      </div>
      <div className="agenda-main">
        <div>
          <span className="service-name">
            <i className="pro-dot" aria-hidden="true" />
            Aula em grupo
          </span>
          <h3 className="group-name" title={session.groupName}>
            {session.groupName}
          </h3>
          <p>
            {session.professionalName} · {session.roomName}
          </p>
        </div>
        {can("groups.view") && (
          <Link
            className="secondary-button"
            to={`/turmas?sessionId=${session.id}`}
          >
            Abrir encontro
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}
