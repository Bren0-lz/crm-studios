import { type Lead, type LeadStage, formatPhone } from "@crm/contracts";
import { CalendarDays, ListTodo, Pencil, UserCheck } from "lucide-react";
import { leadStages } from "../relationship/index";

/** Etiquetas visíveis no cartão; o resto vira "+N" (lista completa no title). */
const VISIBLE_TAGS = 2;

export interface LeadCardPermissions {
  manage: boolean;
  drag: boolean;
  stage: boolean;
  update: boolean;
  convert: boolean;
  schedule: boolean;
}

/** Cartão enxuto do funil: nome, interesse/origem, contato e ações em ícones. */
export function LeadCard({
  lead,
  dragging,
  permissions,
  onDragStart,
  onDragEnd,
  onMove,
  onActivity,
  onEdit,
  onConvert,
  onSchedule,
}: {
  lead: Lead;
  dragging: boolean;
  permissions: LeadCardPermissions;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (stage: LeadStage) => void;
  onActivity: () => void;
  onEdit: () => void;
  onConvert: () => void;
  onSchedule: () => void;
}) {
  const open = !["won", "lost"].includes(lead.stage);
  const taskLabel = `${lead.openTasks} tarefa(s)${lead.overdueTasks > 0 ? ` · ${lead.overdueTasks} atrasada(s)` : ""}`;
  const hiddenTags = lead.tags.length - VISIBLE_TAGS;
  return (
    <article
      className={`lead-card${dragging ? " dragging" : ""}`}
      draggable={permissions.drag && open}
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", lead.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="lead-card-head">
        <h3 title={lead.fullName}>{lead.fullName}</h3>
        <div className="lead-card-icons">
          {!lead.convertedPatientId && permissions.update && (
            <button
              className="icon-button button-sm lead-icon-button"
              aria-label="Editar cadastro"
              title="Editar cadastro"
              onClick={onEdit}
            >
              <Pencil size={14} />
            </button>
          )}
          {/* Atividades: o próprio botão mostra as tarefas abertas (vermelho se houver atrasada). */}
          <button
            className={`icon-button button-sm lead-icon-button lead-activity-button${lead.overdueTasks ? " overdue" : ""}`}
            aria-label="Atividades"
            title={`Atividades · ${taskLabel}`}
            onClick={onActivity}
          >
            <ListTodo size={14} />
            {lead.openTasks > 0 && <span>{lead.openTasks}</span>}
          </button>
        </div>
      </div>
      <p className="lead-card-meta" title={`${lead.interest} · ${lead.source}`}>
        {lead.interest} · <span className="lead-source">{lead.source}</span>
      </p>
      <p className="lead-card-meta">
        {formatPhone(lead.phone)}
        {lead.responsibleName && (
          <>
            {" · "}
            <span className="lead-owner">{lead.responsibleName}</span>
          </>
        )}
      </p>
      {lead.tags.length > 0 && (
        <div className="lead-tags" title={lead.tags.join(", ")}>
          {lead.tags.slice(0, VISIBLE_TAGS).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {hiddenTags > 0 && <span>+{hiddenTags}</span>}
        </div>
      )}
      {lead.lostReason && (
        <div className="lost-reason" title={lead.lostReason}>
          {lead.lostReason}
        </div>
      )}
      {permissions.manage && open && (
        <div className="lead-card-actions">
          <select
            aria-label={`Etapa de ${lead.fullName}`}
            value={lead.stage}
            disabled={!permissions.stage}
            onChange={(event) => onMove(event.target.value as LeadStage)}
          >
            {leadStages
              .filter((item) => item.value !== "won")
              .map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
          </select>
          <div className="lead-card-icons">
            {!lead.convertedPatientId && permissions.schedule && (
              <button
                className="icon-button button-sm lead-icon-button"
                aria-label="Agendar experimental"
                title="Agendar experimental"
                onClick={onSchedule}
              >
                <CalendarDays size={14} />
              </button>
            )}
            {permissions.convert && (
              <button
                className="icon-button button-sm lead-icon-button lead-convert-button"
                aria-label="Converter"
                title="Converter em cliente"
                onClick={onConvert}
              >
                <UserCheck size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
