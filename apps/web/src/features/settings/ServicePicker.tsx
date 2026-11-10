import type { Service } from "@crm/contracts";
import { ChevronDown, Plus } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  computeFloatingPosition,
  scrollNeededBelow,
} from "../../shared/components/calendar-position";
import { clearInlineValidation } from "../../shared/feedback/inline-validation";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function scrollableAncestor(element: HTMLElement): Element | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node;
  }
  return null;
}

function viewportBox() {
  const viewport = window.visualViewport;
  return {
    top: viewport?.offsetTop ?? 0,
    left: viewport?.offsetLeft ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

/**
 * Campo "Serviço" do modelo de plano: digita para filtrar a lista e escolhe um serviço. O
 * "+ Novo serviço" fica fixo no rodapé da lista (sempre visível, mesmo rolando ou filtrando).
 * O texto digitado nunca vira valor: sair do campo sem escolher volta ao serviço escolhido.
 */
export function ServicePicker({
  label,
  srLabel,
  services,
  value,
  unavailableIds,
  onChange,
  onCreate,
  action,
  disabled = false,
}: {
  label: string;
  /** Complemento do nome acessível (ex.: " 1" → "Serviço 1"). */
  srLabel?: string;
  services: Service[];
  value: string;
  /** Serviços já escolhidos em outras linhas do plano. */
  unavailableIds: string[];
  onChange: (id: string) => void;
  onCreate?: (() => void) | undefined;
  /** Ação no canto direito do rótulo (ex.: remover a linha). */
  action?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const selected = services.find((service) => service.id === value);
  const term = normalize(query?.trim() ?? "");
  const choices = services.filter(
    (service) =>
      (service.active || service.id === value) &&
      (!term || normalize(service.name).includes(term)),
  );
  const isAvailable = (service: Service) =>
    service.active && !unavailableIds.includes(service.id);
  const isOpen = open && !disabled;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setCustomValidity(value ? "" : "Selecione um serviço da lista.");
    if (value && input.validity.valid) clearInlineValidation(input);
  }, [value]);

  useEffect(() => {
    if (isOpen && active >= 0)
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, active]);

  // Painel em position: fixed (escapa do overflow do modal), sempre abaixo do campo; se não
  // couber, rola o corpo do modal para dar espaço.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const input = inputRef.current;
    if (!isOpen || !panel || !input) return;
    function positionPanel() {
      if (!panel || !input) return;
      const anchor = input.getBoundingClientRect();
      const position = computeFloatingPosition({
        trigger: anchor,
        panelWidth: anchor.width,
        viewport: viewportBox(),
      });
      const values: Record<string, string> = {
        "--service-picker-top": `${position.top}px`,
        "--service-picker-left": `${position.left}px`,
        "--service-picker-width": `${position.width}px`,
        "--service-picker-max-height": `${position.maxHeight}px`,
      };
      for (const [name, next] of Object.entries(values))
        if (panel.style.getPropertyValue(name) !== next)
          panel.style.setProperty(name, next);
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      positionPanel();
    }
    const needed = scrollNeededBelow({
      trigger: input.getBoundingClientRect(),
      panelHeight: Math.min(panel.scrollHeight, 320),
      viewport: viewportBox(),
    });
    if (needed > 0) {
      const container = scrollableAncestor(input);
      if (container) container.scrollTop += needed;
    }
    positionPanel();
    window.addEventListener("resize", positionPanel);
    document.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", positionPanel);
    window.visualViewport?.addEventListener("scroll", positionPanel);
    return () => {
      window.removeEventListener("resize", positionPanel);
      document.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", positionPanel);
      window.visualViewport?.removeEventListener("scroll", positionPanel);
    };
  }, [isOpen]);

  function close() {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }

  function choose(service: Service) {
    if (!isAvailable(service)) return;
    onChange(service.id);
    close();
  }

  function move(step: 1 | -1) {
    const enabled = choices
      .map((service, index) => (isAvailable(service) ? index : -1))
      .filter((index) => index >= 0);
    if (!enabled.length) return setActive(-1);
    const current = enabled.indexOf(active);
    const next =
      current < 0
        ? step === 1
          ? 0
          : enabled.length - 1
        : (current + step + enabled.length) % enabled.length;
    setActive(enabled[next]!);
  }

  return (
    <div
      className="span-2 service-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          // Fecha só a lista, não o modal.
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="service-picker-head">
        <label htmlFor={`${id}-input`}>{label}</label>
        {action}
      </div>
      <div className="service-picker-field">
        <input
          id={`${id}-input`}
          ref={inputRef}
          role="combobox"
          aria-label={`${label}${srLabel ?? ""}`}
          required
          disabled={disabled}
          autoComplete="off"
          maxLength={120}
          placeholder={selected ? selected.name : "Buscar serviço"}
          value={query ?? selected?.name ?? ""}
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${id}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && active >= 0 ? `${id}-${active}` : undefined
          }
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              move(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && isOpen) {
              event.preventDefault();
              const service = choices[active];
              if (service) choose(service);
            }
          }}
        />
        <ChevronDown size={18} aria-hidden="true" />
      </div>
      {isOpen && (
        <div ref={panelRef} className="service-picker-panel">
          {choices.length === 0 && (
            <p role="status">Nenhum serviço encontrado.</p>
          )}
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={`${label}${srLabel ?? ""}: opções`}
          >
            {choices.map((service, index) => {
              const available = isAvailable(service);
              return (
                <li
                  id={`${id}-${index}`}
                  key={service.id}
                  role="option"
                  aria-selected={service.id === value}
                  aria-disabled={!available || undefined}
                  className={index === active ? "active" : undefined}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(service)}
                >
                  {service.name}
                  {!service.active ? (
                    <small>inativo</small>
                  ) : !available ? (
                    <small>já está no plano</small>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {onCreate && (
            <div className="service-picker-footer">
              <button
                type="button"
                className="secondary-button button-sm"
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  close();
                  onCreate();
                }}
              >
                <Plus size={16} aria-hidden="true" />
                Novo serviço
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
