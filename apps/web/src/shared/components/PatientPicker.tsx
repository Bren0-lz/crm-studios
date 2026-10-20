import type { PatientOption } from "@crm/contracts";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { api } from "../../api";
import { clearInlineValidation } from "../feedback/inline-validation";

type PatientPickerProps = {
  patients: PatientOption[];
  value: string;
  onChange: (id: string, patient?: PatientOption) => void;
  required?: boolean;
  disabled?: boolean;
  /** Sem efeito visual: as sugestões dependem do texto digitado e da busca no servidor. */
  loading?: boolean;
  popover?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onAddPatient?: (() => void) | undefined;
  className?: string;
};

/** Seleciona um cadastro; o texto digitado nunca é enviado como ID de cliente. */
export function PatientPicker({
  patients,
  value,
  onChange,
  required = false,
  disabled = false,
  popover = false,
  inputRef,
  onAddPatient,
  className = "",
}: PatientPickerProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const listRef = useRef<HTMLUListElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<PatientOption | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [response, setResponse] = useState<{
    term: string;
    items: PatientOption[];
    error: string;
  } | null>(null);
  // Uma seleção externa (por exemplo, cadastro rápido) substitui a busca digitada.
  if (value && query !== null) setQuery(null);
  const selected =
    patients.find((patient) => patient.id === value) ??
    (selectedResult?.id === value ? selectedResult : undefined);
  const term = query?.trim() ?? "";
  // Sem texto, mostra apenas a ação de cadastro, sem consultar nem listar clientes.
  const isOpen = open && !disabled && (Boolean(term) || Boolean(onAddPatient));
  const loading = Boolean(term) && response?.term !== term;
  const error = term && response?.term === term ? response.error : "";
  const choices = !term || loading || error ? [] : (response?.items ?? []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const input = ref.current;
    if (!popover || !isOpen || !panel || !input) return;

    // The top layer escapes the modal's overflow while keeping the list inside
    // its DOM subtree, combobox and focus trap.
    panel.showPopover?.();
    function positionPanel() {
      if (!panel || !input) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width =
        viewport?.width ??
        (document.documentElement.clientWidth || window.innerWidth);
      const height = viewport?.height ?? window.innerHeight;
      const margin = 12;
      const gap = 8;
      const anchor = input.getBoundingClientRect();
      const panelWidth = Math.max(
        0,
        Math.min(anchor.width, width - margin * 2),
      );
      panel.style.width = `${panelWidth}px`;
      panel.style.maxHeight = `${Math.max(0, Math.min(240, height - margin * 2))}px`;
      const desiredHeight = panel.getBoundingClientRect().height;
      const below = top + height - margin - anchor.bottom - gap;
      const above = anchor.top - gap - top - margin;
      const placeAbove = desiredHeight > below && above > below;
      const available = Math.max(
        0,
        Math.min(240, height - margin * 2, placeAbove ? above : below),
      );
      panel.style.maxHeight = `${available}px`;
      const panelHeight = Math.min(desiredHeight, available);
      panel.style.left = `${Math.max(left + margin, Math.min(anchor.left, left + width - margin - panelWidth))}px`;
      const panelTop = placeAbove
        ? anchor.top - gap - panelHeight
        : anchor.bottom + gap;
      panel.style.top = `${Math.max(top + margin, Math.min(panelTop, top + height - margin - panelHeight))}px`;
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      positionPanel();
    }
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      ) {
        setOpen(false);
        setActive(-1);
      }
    }
    positionPanel();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(positionPanel);
    observer?.observe(panel);
    observer?.observe(input);
    window.addEventListener("resize", positionPanel);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.visualViewport?.addEventListener("resize", positionPanel);
    window.visualViewport?.addEventListener("scroll", positionPanel);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", positionPanel);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.visualViewport?.removeEventListener("resize", positionPanel);
      window.visualViewport?.removeEventListener("scroll", positionPanel);
      if (panel.isConnected) panel.hidePopover?.();
    };
  }, [popover, isOpen, ref]);

  useEffect(() => {
    if (!isOpen || !term) return;
    let current = true;
    const timer = window.setTimeout(() => {
      api
        .patientOptions(term)
        .then((items) => {
          if (current) setResponse({ term, items, error: "" });
        })
        .catch((cause: unknown) => {
          if (current)
            setResponse({
              term,
              items: [],
              error:
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível buscar clientes.",
            });
        });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, term, query]);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const missing = required && !value;
    input.setCustomValidity(
      missing ? "Selecione um cliente encontrado na busca." : "",
    );
    // Escolher (na lista ou pelo cadastro rápido) tira o erro do último envio.
    if (!missing && input.validity.valid) clearInlineValidation(input);
  }, [ref, required, value]);

  useEffect(() => {
    if (isOpen && active >= 0) {
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
    }
  }, [isOpen, active]);

  function choose(patient: PatientOption) {
    setSelectedResult(patient);
    setQuery(null);
    setOpen(false);
    setActive(-1);
    onChange(patient.id, patient);
  }

  return (
    <div
      ref={pickerRef}
      className={`patient-picker ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.stopPropagation();
          ref.current?.focus();
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <div className="patient-picker-header">
        <label htmlFor={`${listId}-input`}>Cliente</label>
      </div>
      <input
        id={`${listId}-input`}
        ref={ref}
        role="combobox"
        required={required}
        disabled={disabled}
        maxLength={160}
        placeholder="Buscar por nome ou CPF"
        autoComplete="off"
        value={query ?? selected?.fullName ?? ""}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && choices[active] ? `${listId}-${active}` : undefined
        }
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value.slice(0, 160));
          onChange("");
          setOpen(true);
          setActive(-1);
          setResponse(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              choices.length
                ? event.key === "ArrowDown"
                  ? (index + 1) % choices.length
                  : index <= 0
                    ? choices.length - 1
                    : index - 1
                : -1,
            );
          } else if (event.key === "Enter" && isOpen) {
            event.preventDefault();
            if (choices[active]) choose(choices[active]);
          }
        }}
      />
      {isOpen && (
        <div
          ref={panelRef}
          popover={popover ? "manual" : undefined}
          className="patient-picker-results"
        >
          {loading ? (
            <p role="status">Buscando clientes…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : term && choices.length === 0 ? (
            <p role="status">Nenhum cliente encontrado</p>
          ) : null}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label="Clientes encontrados"
            aria-busy={loading}
          >
            {choices.map((patient, index) => (
              <li
                id={`${listId}-${index}`}
                key={patient.id}
                role="option"
                aria-selected={patient.id === value}
                className={index === active ? "active" : ""}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(patient)}
              >
                {patient.fullName}
              </li>
            ))}
          </ul>
          {onAddPatient && (
            <div className="patient-picker-footer">
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => {
                  setOpen(false);
                  setActive(-1);
                  onAddPatient();
                }}
                disabled={disabled}
              >
                Adicionar cliente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
