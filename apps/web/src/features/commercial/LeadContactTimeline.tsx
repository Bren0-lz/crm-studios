import { leadContactChannelLabels, type LeadContact } from "@crm/contracts";
import { shortDateTime, timeLabel } from "../../shared/lib/formatting";

const leadContactDirectionLabels: Record<LeadContact["direction"], string> = {
  outbound: "Mensagem enviada",
  inbound: "Recebido do lead",
  internal: "Registro interno",
};

/** Rótulo do contato: o realizado (`outbound`) muda conforme o canal (D3). */
function contactLabel(item: LeadContact) {
  if (item.direction === "outbound" && item.channel === "phone")
    return "Ligação realizada";
  if (item.direction === "outbound" && item.channel === "in_person")
    return "Atendimento presencial";
  return leadContactDirectionLabels[item.direction];
}

const contactDay = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Linha do tempo de contatos do lead com data, hora, canal, direção e observações. */
export function LeadContactTimeline({
  contacts,
  className,
}: {
  contacts: LeadContact[];
  className?: string;
}) {
  if (contacts.length === 0) {
    return (
      <p className="contact-timeline-empty">Nenhum contato registrado ainda.</p>
    );
  }
  return (
    <ol
      className={`contact-timeline${className ? ` ${className}` : ""}`}
      aria-label="Histórico de contatos"
    >
      {contacts.map((item) => {
        const at = new Date(item.occurredAt);
        return (
          <li
            key={item.id}
            className={`contact-timeline-item ${item.direction}${item.reached === false ? " unreached" : ""}`}
          >
            <time
              className="contact-timeline-when"
              dateTime={item.occurredAt}
              title={at.toLocaleString("pt-BR")}
            >
              <strong>{timeLabel.format(at)}</strong>
              <span>{contactDay.format(at)}</span>
            </time>
            <span className="contact-timeline-dot" aria-hidden="true" />
            <div className="contact-timeline-body">
              <div className="contact-timeline-tags">
                <span className="contact-direction">
                  {contactLabel(item)}
                </span>
                <span className="contact-channel">
                  {item.contactMethod || leadContactChannelLabels[item.channel]}
                </span>
                <span className="contact-datetime">
                  {shortDateTime(item.occurredAt)}
                </span>
                {item.reached === false && (
                  <span className="contact-unreached">Sem resposta</span>
                )}
              </div>
              <p>{item.notes}</p>
              {item.actorName && (
                <span className="contact-timeline-actor">
                  por {item.actorName}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
