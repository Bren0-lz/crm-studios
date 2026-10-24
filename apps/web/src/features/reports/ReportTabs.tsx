import {
  useId,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type ReportTab<K extends string> = {
  key: K;
  label: string;
  icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
};

/**
 * Abas acessíveis dos relatórios. Cada painel só é montado na primeira visita e
 * continua montado depois, preservando filtros e dados já carregados.
 * `sub` usa o visual secundário; com uma única sub-aba, o conteúdo aparece direto.
 */
export function ReportTabs<K extends string>({
  label,
  tabs,
  initial,
  sub = false,
  children,
}: {
  label: string;
  tabs: ReportTab<K>[];
  initial?: K | undefined;
  sub?: boolean;
  children: (key: K) => ReactNode;
}) {
  const id = useId();
  const first =
    initial && tabs.some((tab) => tab.key === initial) ? initial : tabs[0]?.key;
  const [active, setActive] = useState<K | undefined>(first);
  const [visited, setVisited] = useState<K[]>(first ? [first] : []);
  const selected = tabs.some((tab) => tab.key === active)
    ? active
    : tabs[0]?.key;
  if (!tabs.length) return null;
  if (sub && tabs.length === 1) return <>{children(tabs[0]!.key)}</>;
  function select(tab: K) {
    setActive(tab);
    setVisited((current) =>
      current.includes(tab) ? current : [...current, tab],
    );
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(tabs[next]!.key);
    document.getElementById(`${id}-${tabs[next]!.key}-tab`)?.focus();
  }
  return (
    <>
      <div
        className={sub ? "reports-subtabs" : "settings-tabs reports-tabs"}
        role="tablist"
        aria-label={label}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${id}-${tab.key}-tab`}
            type="button"
            role="tab"
            className={sub ? "reports-subtab" : "text-button settings-tab"}
            aria-selected={selected === tab.key}
            aria-controls={`${id}-${tab.key}-panel`}
            tabIndex={selected === tab.key ? 0 : -1}
            onClick={() => select(tab.key)}
            onKeyDown={(event) => keyboard(event, index)}
          >
            {tab.icon && <tab.icon size={sub ? 16 : 18} aria-hidden="true" />}
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`${id}-${tab.key}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${tab.key}-tab`}
          hidden={selected !== tab.key}
          className="reports-tab-panel"
        >
          {(visited.includes(tab.key) || selected === tab.key) &&
            children(tab.key)}
        </div>
      ))}
    </>
  );
}
