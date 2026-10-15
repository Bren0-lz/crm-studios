import { X } from "lucide-react";
import {
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useEscapeToClose } from "../hooks/useEscapeToClose";
import { SettingsPanelContext } from "../workflows/SettingsPanelContext";
import { useSettingsBusy } from "../workflows/useSettingsBusy";

export function Modal({
  title,
  subtitle,
  eyebrow = "Cadastro rápido",
  wide = false,
  initialFocus,
  busy = false,
  inactive = false,
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
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const settingsPanel = useContext(SettingsPanelContext);
  useBodyScrollLock();
  useSettingsBusy(true);
  useEscapeToClose(onClose, busy);
  // Id próprio: com modal sobre modal, cada um é nomeado pelo seu título.
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!inactive && section && !section.contains(document.activeElement)) {
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
  }, [inactive, initialFocus]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      inert={inactive}
      aria-hidden={inactive || undefined}
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
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
