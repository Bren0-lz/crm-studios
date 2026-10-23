import { X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useEscapeToClose } from "../hooks/useEscapeToClose";
import { ModuleLabelContext } from "../lib/ModuleLabelContext";
import { SettingsPanelContext } from "../workflows/SettingsPanelContext";
import { useSettingsBusy } from "../workflows/useSettingsBusy";
import { useDirtyGuard } from "../workflows/useDirtyGuard";
import {
  type ModalGuard,
  ModalGuardContext,
} from "../workflows/ModalGuardContext";

/**
 * Botão "Cancelar"/"Voltar" de um formulário em `Modal`: com o formulário
 * alterado, pergunta "Descartar alterações?" antes de fechar.
 */
export function ModalCancelButton({
  className = "secondary-button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type">) {
  const requestClose = useContext(ModalGuardContext)?.requestClose;
  return (
    <button
      {...props}
      type="button"
      className={className}
      onClick={() => requestClose?.()}
    />
  );
}

/** Pergunta exibida ao fechar um formulário alterado (Esc, X ou Cancelar). */
function DiscardChangesModal({
  onDiscard,
  onContinue,
}: {
  onDiscard: () => void;
  onContinue: () => void;
}) {
  return (
    <Modal
      eyebrow="Alterações não salvas"
      title="Descartar alterações?"
      subtitle="O formulário tem edição que ainda não foi salva."
      onClose={onContinue}
    >
      <div className="form-grid">
        <p className="span-2">
          Ao descartar, o que foi preenchido ou alterado neste formulário será
          perdido.
        </p>
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onContinue}
            autoFocus
          >
            Continuar editando
          </button>
          <button type="button" className="danger-button" onClick={onDiscard}>
            Descartar
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Modal({
  title,
  subtitle,
  eyebrow,
  wide = false,
  initialFocus,
  busy = false,
  inactive = false,
  dirty = false,
  className = "",
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  /** Variante ampla para formulários com várias seções. */
  wide?: boolean;
  /** Seletor do primeiro campo a receber foco ao abrir. */
  initialFocus?: string;
  /** Salvamento em andamento: X e Esc ficam desativados. */
  busy?: boolean;
  /** Mantém o formulário montado, mas inacessível sob outro modal. */
  inactive?: boolean;
  /** Formulário alterado: Esc, X e `ModalCancelButton` perguntam antes de fechar. */
  dirty?: boolean;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const settingsPanel = useContext(SettingsPanelContext);
  const moduleLabel = useContext(ModuleLabelContext);
  useBodyScrollLock();
  useSettingsBusy(true);
  const [dirtyForms, setDirtyForms] = useState(0);
  const guard = useDirtyGuard({
    dirty: dirty || dirtyForms > 0,
    busy,
    onClose,
  });
  const { requestClose, confirmDiscard } = guard;
  const registerDirty = useCallback(() => {
    setDirtyForms((count) => count + 1);
    return () => setDirtyForms((count) => count - 1);
  }, []);
  const context = useMemo<ModalGuard>(
    () => ({ requestClose, confirmDiscard, registerDirty }),
    [requestClose, confirmDiscard, registerDirty],
  );
  const blocked = inactive || guard.asking;
  useEscapeToClose(requestClose, busy);
  // Id próprio: com modal sobre modal, cada um é nomeado pelo seu título.
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!blocked && section && !section.contains(document.activeElement)) {
      const firstField = initialFocus
        ? section.querySelector<HTMLElement>(initialFocus)
        : null;
      (
        firstField ??
        section.querySelector<HTMLElement>(
          "input, select, textarea, button:not(:disabled)",
        )
      )?.focus();
    }
  }, [blocked, initialFocus]);
  return (
    <ModalGuardContext.Provider value={context}>
      <div
        className="modal-backdrop"
        role="presentation"
        inert={blocked}
        aria-hidden={blocked || undefined}
      >
        <section
          ref={sectionRef}
          className={
            (wide ? "modal modal-wide" : "modal") +
            (settingsPanel ? " settings-modal" : "") +
            (className ? ` ${className}` : "")
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = Array.from(
              sectionRef.current?.querySelectorAll<HTMLElement>(
                'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex="0"]',
              ) ?? [],
            ).filter(
              (element) =>
                !element.closest("[hidden], [inert]") &&
                element.getAttribute("type") !== "hidden",
            );
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <div className="modal-head">
            <div>
              <span className="eyebrow">{eyebrow ?? moduleLabel}</span>
              <h2 id={titleId}>{title}</h2>
              <p>{subtitle}</p>
            </div>
            <button
              className="icon-button"
              onClick={requestClose}
              aria-label="Fechar"
              disabled={busy}
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
        </section>
      </div>
      {guard.asking && (
        <DiscardChangesModal
          onDiscard={guard.discard}
          onContinue={guard.keepEditing}
        />
      )}
    </ModalGuardContext.Provider>
  );
}
