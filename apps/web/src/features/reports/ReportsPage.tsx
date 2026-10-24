import { useId, useState, type KeyboardEvent } from "react";
import { BarChart3, CalendarDays, Users, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ClientDetailsSection } from "./ClientDetailsSection";
import { ClientInsights } from "./ClientInsights";
import { DreSection } from "./DreSection";
import { useAuthorization } from "../../authorization-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { EmptyState } from "../../shared/components/EmptyState";
import { localIsoDate, formatIsoDate } from "../../shared/lib/formatting";
import { ReportsDetails } from "./ReportsDetails";
import { SalesInsights } from "./SalesInsights";

type Tab = "overview" | "clients" | "dre";
export function ReportsPage() {
  const { can, canView } = useAuthorization();
  const [params] = useSearchParams();
  const id = useId();
  const today = localIsoDate();
  const [draft, setDraft] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
  });
  const [period, setPeriod] = useState({ ...draft, version: 0 });
  const hasClientReports = can("reports.retention") || can("reports.clients");
  const tabs = [
    {
      key: "overview" as const,
      label: "Visão geral",
      icon: BarChart3,
      visible:
        can("reports.sales") ||
        can("reports.management") ||
        (hasClientReports && canView("agenda")),
    },
    {
      key: "clients" as const,
      label: "Clientes",
      icon: Users,
      visible: hasClientReports || can("reports.sales"),
    },
    {
      key: "dre" as const,
      label: "DRE",
      icon: Wallet,
      visible: can("reports.dre"),
    },
  ].filter((tab) => tab.visible);
  const initial =
    params.get("secao") === "sem-retorno" &&
    tabs.some((tab) => tab.key === "clients")
      ? "clients"
      : (tabs[0]?.key ?? "overview");
  const [active, setActive] = useState<Tab>(initial);
  const [visited, setVisited] = useState<Tab[]>([initial]);
  const selected = tabs.some((tab) => tab.key === active)
    ? active
    : tabs[0]?.key;
  function select(tab: Tab) {
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
    <div className="reports-page">
      <PageHeader
        title="Relatórios gerenciais"
        description="Acompanhe os resultados da clínica e os clientes no período que você escolher."
      />
      {!tabs.length ? (
        <EmptyState
          title="Nenhum relatório foi liberado para seu usuário."
          copy=""
        />
      ) : (
        <>
          <section className="panel reports-period">
            <div className="reports-period-context">
              <CalendarDays size={20} aria-hidden="true" />
              <div>
                <h2>Período de análise</h2>
                <p className="panel-context" aria-live="polite">
                  {formatIsoDate(period.from)} a {formatIsoDate(period.to)}
                </p>
              </div>
            </div>
            <form
              className="reports-period-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.from && draft.to && draft.from <= draft.to)
                  setPeriod({ ...draft, version: period.version + 1 });
              }}
            >
              <label>
                De
                <input
                  type="date"
                  required
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(event) =>
                    setDraft({ ...draft, from: event.target.value })
                  }
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  required
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(event) =>
                    setDraft({ ...draft, to: event.target.value })
                  }
                />
              </label>
              <button
                className="primary-button"
                disabled={!draft.from || !draft.to || draft.from > draft.to}
              >
                Atualizar
              </button>
            </form>
          </section>
          <div
            className="settings-tabs reports-tabs"
            role="tablist"
            aria-label="Seções dos relatórios"
          >
            {tabs.map((tab, index) => (
              <button
                key={tab.key}
                id={`${id}-${tab.key}-tab`}
                type="button"
                role="tab"
                className="text-button settings-tab"
                aria-selected={selected === tab.key}
                aria-controls={`${id}-${tab.key}-panel`}
                tabIndex={selected === tab.key ? 0 : -1}
                onClick={() => select(tab.key)}
                onKeyDown={(event) => keyboard(event, index)}
              >
                <tab.icon size={18} aria-hidden="true" />
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
                (tab.key === "overview" ? (
                  <>
                    {can("reports.sales") && (
                      <SalesInsights period={period} mode="overview" />
                    )}
                    <ReportsDetails period={period} />
                  </>
                ) : tab.key === "clients" ? (
                  <>
                    <ClientInsights period={period} />
                    {can("reports.sales") && (
                      <SalesInsights
                        period={period}
                        mode="clients"
                        focusNoReturn={
                          selected === "clients" &&
                          params.get("secao") === "sem-retorno"
                        }
                      />
                    )}
                    {can("reports.clients") && (
                      <ClientDetailsSection period={period} />
                    )}
                  </>
                ) : (
                  <DreSection period={period} />
                ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
