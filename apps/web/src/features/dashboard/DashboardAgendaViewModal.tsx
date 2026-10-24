import type { Professional } from "@crm/contracts";
import { Check } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { professionalColorStyle } from "../../shared/lib/tag-colors";

/**
 * Visualização da agenda do início (só com "Ver agenda de todos os profissionais"): todos ou
 * os profissionais marcados. Lista vazia = todos.
 */
export function DashboardAgendaViewModal({
  professionals,
  loadError,
  selected,
  ownProfessionalId,
  onApply,
  onClose,
}: {
  professionals: Professional[] | null;
  loadError: string;
  selected: readonly string[];
  ownProfessionalId: string | null;
  onApply: (professionalIds: string[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"all" | "some">(
    selected.length > 0 ? "some" : "all",
  );
  const [draft, setDraft] = useState<string[]>([...selected]);
  const own = professionals?.find((item) => item.id === ownProfessionalId);

  function toggle(id: string) {
    setDraft((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <Modal
      eyebrow="Início"
      title="Visualização da agenda"
      subtitle="Escolha de quem são os atendimentos mostrados no início."
      onClose={onClose}
    >
      <div className="agenda-view-form">
        <div
          className="view-toggle agenda-view-mode"
          role="group"
          aria-label="Mostrar agenda de"
        >
          <button
            type="button"
            className={`tab-button ${mode === "all" ? "active" : ""}`}
            aria-pressed={mode === "all"}
            onClick={() => setMode("all")}
          >
            Todos os profissionais
          </button>
          <button
            type="button"
            className={`tab-button ${mode === "some" ? "active" : ""}`}
            aria-pressed={mode === "some"}
            onClick={() => setMode("some")}
          >
            Escolher profissionais
          </button>
        </div>
        {mode === "some" &&
          (loadError ? (
            <ErrorBanner error={loadError} />
          ) : !professionals ? (
            <LoadingBlock />
          ) : professionals.length === 0 ? (
            <EmptyState
              title="Nenhum profissional ativo"
              copy="Cadastre profissionais para filtrar a agenda."
            />
          ) : (
            <div className="agenda-view-picker">
              <div className="agenda-view-shortcuts">
                <span>
                  {draft.length === 0
                    ? "Nenhum selecionado"
                    : draft.length === 1
                      ? "1 selecionado"
                      : `${draft.length} selecionados`}
                </span>
                {own && (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setDraft([own.id])}
                  >
                    Só eu
                  </button>
                )}
                <button
                  type="button"
                  className="text-link"
                  disabled={draft.length === 0}
                  onClick={() => setDraft([])}
                >
                  Limpar
                </button>
              </div>
              <div
                className="agenda-view-chips"
                role="group"
                aria-label="Profissionais"
              >
                {professionals.map((professional) => {
                  const pressed = draft.includes(professional.id);
                  return (
                    <button
                      type="button"
                      key={professional.id}
                      className="agenda-view-chip"
                      aria-pressed={pressed}
                      style={professionalColorStyle(professional.color)}
                      onClick={() => toggle(professional.id)}
                    >
                      <i className="pro-dot" aria-hidden="true">
                        {pressed && <Check size={10} strokeWidth={3} />}
                      </i>
                      {professional.fullName}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        <div className="modal-actions">
          <ModalCancelButton>Cancelar</ModalCancelButton>
          <button
            type="button"
            className="primary-button"
            disabled={mode === "some" && draft.length === 0}
            onClick={() => onApply(mode === "all" ? [] : draft)}
          >
            Aplicar
          </button>
        </div>
      </div>
    </Modal>
  );
}
