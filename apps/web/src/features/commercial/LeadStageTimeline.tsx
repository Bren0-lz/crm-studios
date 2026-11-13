import type { Lead, LeadStage, LeadStageChange } from "@crm/contracts";
import { shortDateTime, timeLabel } from "../../shared/lib/formatting";

const changeDay = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function When({ iso }: { iso: string }) {
  const at = new Date(iso);
  return (
    <time
      className="contact-timeline-when"
      dateTime={iso}
      title={at.toLocaleString("pt-BR")}
    >
      <strong>{timeLabel.format(at)}</strong>
      <span>{changeDay.format(at)}</span>
    </time>
  );
}

/**
 * Linha do tempo das movimentações do lead no funil: de qual etapa para qual, quando, quem
 * moveu e o motivo (perda ou conversão). Termina no cadastro do lead.
 */
export function LeadStageTimeline({
  lead,
  changes,
  stageLabel,
}: {
  lead: Lead;
  changes: LeadStageChange[];
  /** Nome atual da etapa; `undefined` quando a etapa saiu do funil. */
  stageLabel: (stage: LeadStage) => string | undefined;
}) {
  const label = (stage: LeadStage) => stageLabel(stage) ?? "Etapa removida";
  return (
    <ol className="contact-timeline" aria-label="Movimentações no funil">
      {changes.map((item) => (
        <li key={item.id} className="contact-timeline-item stage-change">
          <When iso={item.createdAt} />
          <span className="contact-timeline-dot" aria-hidden="true" />
          <div className="contact-timeline-body">
            <div className="contact-timeline-tags">
              <span className="contact-datetime">
                {shortDateTime(item.createdAt)}
              </span>
            </div>
            <p>
              {item.fromStage ? (
                <>
                  De <strong>{label(item.fromStage)}</strong> para{" "}
                  <strong>{label(item.toStage)}</strong>
                </>
              ) : (
                <>
                  Movido para <strong>{label(item.toStage)}</strong>
                </>
              )}
            </p>
            {item.reason && (
              <p className="lead-stage-reason">
                {item.toStage === "lost" ? "Motivo da perda: " : ""}
                {item.reason}
              </p>
            )}
            {item.actorName && (
              <span className="contact-timeline-actor">
                por {item.actorName}
              </span>
            )}
          </div>
        </li>
      ))}
      <li className="contact-timeline-item stage-change">
        <When iso={lead.createdAt} />
        <span className="contact-timeline-dot" aria-hidden="true" />
        <div className="contact-timeline-body">
          <div className="contact-timeline-tags">
            <span className="contact-datetime">
              {shortDateTime(lead.createdAt)}
            </span>
          </div>
          <p>Lead cadastrado</p>
        </div>
      </li>
    </ol>
  );
}
