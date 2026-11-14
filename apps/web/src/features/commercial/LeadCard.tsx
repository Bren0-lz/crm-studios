import {
  type Lead,
  type LeadContact,
  type LeadStage,
  formatPhone,
  whatsappLink,
} from "@crm/contracts";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCheck,
  Clock3,
  ListTodo,
  MessageCircle,
  Pencil,
  Phone,
  UserCheck,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { api } from "../../api";
import {
  initials,
  relativeTime,
  shortDateTime,
} from "../../shared/lib/formatting";
import { leadStages } from "../relationship/index";
import { LeadContactTimeline } from "./LeadContactTimeline";
import { mergeLeadContacts } from "./lead-contact-history";

export interface LeadCardPermissions {
  manage: boolean;
  stage: boolean;
  update: boolean;
  convert: boolean;
  schedule: boolean;
  /** Registrar contato pelo botão do WhatsApp no cartão. */
  contact?: boolean;
}

/**
 * Faixa "Enviada 10 de nov. às 14:32" / "Mensagem não enviada" do cartão.
 * Ao passar o mouse (ou focar), abre um painel flutuante com todo o histórico de contatos.
 */
function LeadMessageStatus({
  lead,
  contacts,
}: {
  lead: Lead;
  contacts?: LeadContact[] | undefined;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<LeadContact[] | null>(null);
  const sentAt = lead.lastMessageSentAt;
  const count = lead.contactCount ?? 0;
  const loading = open && fetched === null;

  useEffect(() => {
    if (!open) return;
    let active = true;
    api
      .leadActivity(lead.id)
      .then((data) => {
        if (active) {
          setFetched(Array.isArray(data?.contacts) ? data.contacts : []);
        }
      })
      .catch(() => {
        if (active) setFetched([]);
      });
    return () => {
      active = false;
    };
  }, [
    open,
    lead.id,
    lead.contactCount,
    lead.lastMessageSentAt,
    lead.lastContactAt,
  ]);

  const history = mergeLeadContacts(lead, fetched, contacts);
  const totalCount = Math.max(count, history.length);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!open || !trigger || !popover) return;
    function positionPopover() {
      if (!trigger || !popover) return;
      const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const margin = 12;
      const gap = 6;
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(340, Math.max(240, viewportWidth - margin * 2));
      popover.style.width = `${width}px`;
      const desiredHeight = popover.getBoundingClientRect().height || 220;
      const below = viewportHeight - anchor.bottom - margin - gap;
      const above = anchor.top - margin - gap;
      const placeAbove = desiredHeight > below && above > below;
      const top = placeAbove
        ? Math.max(margin, anchor.top - gap - desiredHeight)
        : Math.min(
            viewportHeight - margin - desiredHeight,
            anchor.bottom + gap,
          );
      const left = Math.max(
        margin,
        Math.min(anchor.left, viewportWidth - margin - width),
      );
      popover.style.top = `${Math.max(margin, top)}px`;
      popover.style.left = `${left}px`;
    }
    positionPopover();
    window.addEventListener("scroll", positionPopover, true);
    window.addEventListener("resize", positionPopover);
    return () => {
      window.removeEventListener("scroll", positionPopover, true);
      window.removeEventListener("resize", positionPopover);
    };
  }, [open, history.length, loading]);

  return (
    <div
      className="lead-message-status-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        ref={triggerRef}
        tabIndex={0}
        className={`lead-message-status ${sentAt ? "sent" : "pending"}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (
            !event.currentTarget.parentElement?.contains(
              event.relatedTarget as Node | null,
            )
          ) {
            setOpen(false);
          }
        }}
      >
        {sentAt ? (
          <CheckCheck size={13} aria-hidden="true" />
        ) : (
          <Clock3 size={13} aria-hidden="true" />
        )}
        {sentAt ? (
          <>
            {/* RT6: o rótulo pode truncar; a data e a hora ficam sempre inteiras. */}
            <span>Enviada</span>
            <time className="lead-message-time" dateTime={sentAt}>
              {shortDateTime(sentAt)}
            </time>
          </>
        ) : (
          <span>Mensagem não enviada</span>
        )}
        {count > 0 && (
          <span className="lead-message-count">
            {count === 1 ? "1 contato" : `${count} contatos`}
          </span>
        )}
      </div>
      {open && (
        <div
          id={tooltipId}
          ref={popoverRef}
          role="tooltip"
          aria-label="Histórico de contatos"
          className="lead-contact-hover-card"
        >
          <header className="lead-contact-hover-head">
            <span
              className={`lead-contact-hover-icon ${sentAt ? "sent" : "pending"}`}
              aria-hidden="true"
            >
              {sentAt ? <CheckCheck size={15} /> : <Clock3 size={15} />}
            </span>
            <div>
              <strong>Histórico de contatos</strong>
              <span>
                {sentAt
                  ? `Último envio em ${shortDateTime(sentAt)}`
                  : "Nenhuma mensagem enviada para este lead"}
              </span>
            </div>
            {totalCount > 0 && (
              <span className="lead-contact-hover-badge">
                {totalCount === 1 ? "1 contato" : `${totalCount} contatos`}
              </span>
            )}
          </header>
          {loading && history.length === 0 ? (
            <p className="contact-timeline-empty">Carregando histórico...</p>
          ) : (
            <LeadContactTimeline
              contacts={history}
              className="lead-contact-hover-list"
            />
          )}
        </div>
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
  contacts,
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
  contacts?: LeadContact[] | undefined;
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
  // Lead perdido pode voltar ao funil pelo seletor; o ganho só existe pela conversão.
  const movable = lead.stage !== "won" && !lead.convertedPatientId;
  const alert = leadAlert(lead);
  // Os ícones, o seletor de etapa e o painel flutuante têm ação própria: só o resto do cartão abre os detalhes.
  const openFromCard = (event: MouseEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest(
        "button, select, label, a, input, .lead-contact-hover-card",
      )
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
      <LeadMessageStatus lead={lead} contacts={contacts} />
      <div className="lead-card-actions">
        {permissions.manage && movable && (
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
          <a
            className={`whatsapp-button button-sm lead-icon-button lead-send-button${lead.lastMessageSentAt ? " sent" : ""}`}
            href={whatsappLink(lead.whatsapp?.trim() || lead.phone)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Enviar mensagem no WhatsApp"
            title={
              lead.lastMessageSentAt
                ? "Abrir WhatsApp e registrar nova mensagem enviada"
                : "Abrir WhatsApp e registrar mensagem enviada"
            }
            aria-disabled={sendingMessage || undefined}
            onClick={(event) => {
              if (sendingMessage) {
                event.preventDefault();
                return;
              }
              onMessageSent();
            }}
          >
            <MessageCircle size={13} aria-hidden="true" />
          </a>
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
