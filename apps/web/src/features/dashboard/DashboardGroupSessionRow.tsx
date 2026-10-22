import type { GroupSession } from "@crm/contracts";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthorization } from "../../authorization-context";
import { timeLabel } from "../../shared/lib/formatting";

/** Aula de turma do dia na "Agenda de hoje" do painel (mesmo layout dos atendimentos). */
export function DashboardGroupSessionRow({
  session,
}: {
  session: GroupSession;
}) {
  const { can } = useAuthorization();
  return (
    <div className="appointment-row group-session-row">
      <span className="time">
        {timeLabel.format(new Date(session.startsAt))}
      </span>
      <span className="appointment-line" />
      <div className="appointment-copy">
        <strong>{session.groupName}</strong>
        <span>
          Aula em grupo · {session.professionalName} · {session.roomName}
        </span>
      </div>
      <span className={`status-pill ${session.status}`}>
        {session.status === "completed" ? "Realizada" : "Agendada"}
      </span>
      <div className="appointment-row-actions">
        {can("groups.view") && (
          <Link
            className="icon-button"
            to={`/turmas?sessionId=${session.id}`}
            title="Abrir encontro"
            aria-label={`Abrir encontro de ${session.groupName}`}
          >
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
