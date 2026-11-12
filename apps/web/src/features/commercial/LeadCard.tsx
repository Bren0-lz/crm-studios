import { type Lead, type LeadStage, formatPhone } from "@crm/contracts";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCheck,
  Clock3,
  ListTodo,
  Pencil,
  Phone,
  Send,
  UserCheck,
} from "lucide-react";
import type { MouseEvent } from "react";
import {
  initials,
  relativeTime,
  shortDateTime,
} from "../../shared/lib/formatting";
import { leadStages } from "../relationship/index";

export interface LeadCardPermissions {
  manage: boolean;
  stage: boolean;
  update: boolean;
  convert: boolean;
  schedule: boolean;
  /** Registrar contato (botão "Marcar mensagem enviada"). */
  contact?: boolean;
}

/** Faixa "Mensagem enviada · 10 de nov. às 14:32" / "Mensagem não enviada" do cartão. */
function LeadMessageStatus({ lead }: { lead: Lead }) {
  const sentAt = lead.lastMessageSentAt;
  const count = lead.contactCount ?? 0;
  return (
    <div
      className={`lead-message-status ${sentAt ? "sent" : "pending"}`}
      title={
        sentAt
          ? `Última mensagem enviada em ${new Date(sentAt).toLocaleString("pt-BR")}`
          : "Nenhuma mensagem enviada para este lead"
      }
    >
      {sentAt ? (
        <CheckCheck size={13} aria-hidden="true" />
      ) : (
        <Clock3 size={13} aria-hidden="true" />
      )}
      {sentAt ? (
        <span>
          Mensagem enviada ·{" "}
          <time dateTime={sentAt}>{shortDateTime(sentAt)}</time>
        </span>
      ) : (
        <span>Mensagem não enviada</span>
      )}
      {count > 0 && (
        <span className="lead-message-count">
          {count === 1 ? "1 contato" : `${count} contatos`}
        </span>
      )}
    </div>
  );
}

/** Selo e tom do cartão: tarefa atrasada (amarelo), perdido (vermelho), convertido (verde). */
function leadAlert(lead: Lead) {
  if (lead.stage === "lost")
    return { tone: "lost", label: "Perdido", detail: lead.lostReason };
  if (lead.stage === "won") return { tone: "won", label: "Convertido" };
  if (lead.overdueTasks > 0)
    return {
      tone: "overdue",
      label:
        lead.overdueTasks === 1
          ? "Tarefa atrasada"
          : `${lead.overdueTasks} tarefas atrasadas`,
    };
  return null;
}

/** Cartão denso do funil: nome e tempo, origem/interesse, contato e ações em ícones. */
export function LeadCard({
  lead,
  permissions,
  stages = leadStages,
  onMove,
  onActivity,
  onEdit,
  onConvert,
  onSchedule,
  onMessageSent,
  sendingMessage = false,
  onOpen,
}: {
  lead: Lead;
  permissions: LeadCardPermissions;
  /** Etapas com os nomes da clínica (seletor "Mover etapa"). */
  stages?: ReadonlyArray<{ value: LeadStage; label: string }>;
  onMove: (stage: LeadStage) => void;
  onActivity: () => void;
  onEdit: () => void;
  onConvert: () => void;
  onSchedule: () => void;
  /** Registra agora um contato "Mensagem enviada" (sem abrir o modal). */
  onMessageSent?: () => void;
  sendingMessage?: boolean;
  /** Clique no cartão (fora dos ícones e do seletor): abre os detalhes do lead. */
  onOpen: () => void;
}) {
  const open = !["won", "lost"].includes(lead.stage);
  const alert = leadAlert(lead);
  // Os ícones e o seletor de etapa têm ação própria: só o resto do cartão abre os detalhes.
  const openFromCard = (event: MouseEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest("button, select, label, a, input")
    )
      return;
    onOpen();
  };
  const taskLabel = `${lead.openTasks} tarefa(s)${lead.overdueTasks > 0 ? ` · ${lead.overdueTasks} atrasada(s)` : ""}`;
  return (
    <article
      className={`lead-card lead-card-clickable${alert ? ` alert-${alert.tone}` : ""}`}
      onClick={openFromCard}
    >
      {alert && (
        <span
          className="lead-card-badge"
          title={
            alert.detail ? `${alert.label} · ${alert.detail}` : alert.label
          }
        >
          {alert.label}
          {alert.detail && (
            <>
              {" · "}
              <span className="lead-card-badge-detail">{alert.detail}</span>
            </>
          )}
        </span>
      )}
      <div className="lead-card-head">
        <h3 title={lead.fullName}>
          <button
            type="button"
            className="lead-card-open"
            aria-label={`Ver detalhes de ${lead.fullName}`}
            onClick={onOpen}
          >
            {lead.fullName}
          </button>
        </h3>
        <time
          dateTime={lead.updatedAt}
          title={`Atualizado em ${new Date(lead.updatedAt).toLocaleString("pt-BR")}`}
        >
          {relativeTime(lead.updatedAt)}
        </time>
      </div>
      <div className="lead-card-chips" title={lead.tags.join(", ")}>
        <span className="lead-source">{lead.source}</span>
        <span className="lead-interest">{lead.interest}</span>
        {lead.tags[0] && <span className="lead-tag">{lead.tags[0]}</span>}
      </div>
      <div className="lead-card-contact">
        <span className="lead-phone">
          <Phone size={12} aria-hidden="true" />
          {formatPhone(lead.phone)}
        </span>
        {lead.responsibleName && (
          <span
            className="lead-owner"
            title={`Responsável: ${lead.responsibleName}`}
            aria-label={`Responsável: ${lead.responsibleName}`}
          >
            {initials(lead.responsibleName)}
          </span>
        )}
      </div>
      <LeadMessageStatus lead={lead} />
      <div className="lead-card-actions">
        {permissions.manage && open && (
          <label
            className="lead-icon-button lead-stage-picker"
            title="Mover etapa"
          >
            <ArrowRightLeft size={13} aria-hidden="true" />
            <select
              aria-label={`Etapa de ${lead.fullName}`}
              value={lead.stage}
              disabled={!permissions.stage}
              onChange={(event) => onMove(event.target.value as LeadStage)}
            >
              {stages
                .filter((item) => item.value !== "won")
                .map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        {permissions.manage && permissions.contact && onMessageSent && (
          <button
            className={`icon-button button-sm lead-icon-button lead-send-button${lead.lastMessageSentAt ? " sent" : ""}`}
            aria-label="Marcar mensagem enviada"
            title={
              lead.lastMessageSentAt
                ? "Registrar nova mensagem enviada agora"
                : "Marcar mensagem enviada agora"
            }
            disabled={sendingMessage}
            onClick={onMessageSent}
          >
            <Send size={13} />
          </button>
        )}
        {permissions.manage &&
          open &&
          !lead.convertedPatientId &&
          permissions.schedule && (
            <button
              className="icon-button button-sm lead-icon-button"
              aria-label="Agendar experimental"
              title="Agendar experimental"
              onClick={onSchedule}
            >
              <CalendarDays size={13} />
            </button>
          )}
        {permissions.manage && open && permissions.convert && (
          <button
            className="icon-button button-sm lead-icon-button lead-convert-button"
            aria-label="Converter"
            title="Converter em cliente"
            onClick={onConvert}
          >
            <UserCheck size={13} />
          </button>
        )}
        {!lead.convertedPatientId && permissions.update && (
          <button
            className="icon-button button-sm lead-icon-button"
            aria-label="Editar cadastro"
            title="Editar cadastro"
            onClick={onEdit}
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          className={`icon-button button-sm lead-icon-button lead-activity-button${lead.overdueTasks ? " overdue" : ""}`}
          aria-label="Atividades"
          title={`Atividades · ${taskLabel}`}
          onClick={onActivity}
        >
          <ListTodo size={13} />
          {lead.openTasks > 0 && <span>{lead.openTasks}</span>}
        </button>
      </div>
    </article>
  );
}
