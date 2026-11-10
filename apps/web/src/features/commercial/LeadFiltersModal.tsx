import type { LeadFilter, LeadFilterOptions } from "@crm/contracts";
import { useState } from "react";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { leadStages } from "../relationship/index";
import {
  activeModalFilters,
  contactFilterLabels,
  taskFilterLabels,
} from "./lead-filter-labels";

const listFilters = [
  ["source", "Filtrar origem", "sources"],
  ["interest", "Filtrar interesse", "interests"],
  ["contactMethod", "Filtrar forma de contato", "contactMethods"],
  ["lostReason", "Filtrar motivo de perda", "lostReasons"],
] as const;

/** Configura vários filtros do funil de uma vez; só aplica ao confirmar. */
export function LeadFiltersModal({
  filter,
  options,
  stages = leadStages,
  onApply,
  onClose,
}: {
  filter: LeadFilter;
  options: LeadFilterOptions;
  stages?: ReadonlyArray<{ value: string; label: string }>;
  onApply: (filter: LeadFilter) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LeadFilter>(filter);
  const patch = (key: keyof LeadFilter, value: string) =>
    setDraft((current) => {
      const next = { ...current };
      if (value) Object.assign(next, { [key]: value });
      else delete next[key];
      return next;
    });
  const clearModalFilters = () =>
    setDraft(filter.search ? { search: filter.search } : {});
  return (
    <Modal
      eyebrow="CRM comercial"
      title="Filtros do funil"
      subtitle="Combine os filtros e aplique de uma vez."
      wide
      onClose={onClose}
    >
      <form
        className="clinical-form"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <div className="form-grid">
          <label>
            Filtrar etapa
            <select
              value={draft.stage ?? ""}
              onChange={(event) => patch("stage", event.target.value)}
            >
              <option value="">Todas as etapas</option>
              {stages.map((stage) => (
                <option value={stage.value} key={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filtrar responsável
            <select
              value={draft.responsibleUserId ?? ""}
              onChange={(event) =>
                patch("responsibleUserId", event.target.value)
              }
            >
              <option value="">Todos os responsáveis</option>
              {options.responsibles.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {listFilters.map(([key, label, optionKey]) => (
            <label key={key}>
              {label}
              <select
                value={draft[key] ?? ""}
                onChange={(event) => patch(key, event.target.value)}
              >
                <option value="">Todos</option>
                {options[optionKey].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Filtrar tarefas
            <select
              value={draft.tasks ?? ""}
              onChange={(event) => patch("tasks", event.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(taskFilterLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filtrar histórico de contato
            <select
              value={draft.contact ?? ""}
              onChange={(event) => patch("contact", event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(contactFilterLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cadastrados a partir de
            <input
              type="date"
              value={draft.from ?? ""}
              max={draft.to || undefined}
              onChange={(event) => patch("from", event.target.value)}
            />
          </label>
          <label>
            Cadastrados até
            <input
              type="date"
              value={draft.to ?? ""}
              min={draft.from || undefined}
              onChange={(event) => patch("to", event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="text-button"
            disabled={activeModalFilters(draft).length === 0}
            onClick={clearModalFilters}
          >
            Limpar filtros
          </button>
          <ModalCancelButton>Cancelar</ModalCancelButton>
          <button className="primary-button">Aplicar filtros</button>
        </div>
      </form>
    </Modal>
  );
}
