import { useState } from "react";
import { BarChart3, Banknote, CalendarDays, Users, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ClientDetailsSection } from "./ClientDetailsSection";
import { ClientInsights } from "./ClientInsights";
import { DreSection } from "./DreSection";
import { FinancialSection } from "./FinancialSection";
import { useAuthorization } from "../../authorization-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { EmptyState } from "../../shared/components/EmptyState";
import { localIsoDate, formatIsoDate } from "../../shared/lib/formatting";
import { ReportsDetails } from "./ReportsDetails";
import { ReportTabs } from "./ReportTabs";
import { SalesInsights } from "./SalesInsights";
import { periodPresets } from "./model";

export function ReportsPage() {
  const { can, canView } = useAuthorization();
  const [params] = useSearchParams();
  const today = localIsoDate();
  const [draft, setDraft] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
  });
  const [period, setPeriod] = useState({ ...draft, version: 0 });
  const presets = periodPresets(today);
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
    {
      key: "finance" as const,
      label: "Financeiro",
      icon: Banknote,
      visible: can("reports.dre"),
    },
  ].filter((tab) => tab.visible);
  const clientTabs = [
    {
      key: "retention" as const,
      label: "Retenção",
      visible: can("reports.retention"),
    },
    {
      key: "rankings" as const,
      label: "Ranking e faixa etária",
      visible: can("reports.clients"),
    },
    {
      key: "no-return" as const,
      label: "Sem retorno",
      visible: can("reports.sales"),
    },
    {
      key: "details" as const,
      label: "Consulta de clientes",
      visible: can("reports.clients"),
    },
  ].filter((tab) => tab.visible);
  const linkedNoReturn =
    params.get("secao") === "sem-retorno" &&
    tabs.some((tab) => tab.key === "clients");
  const noReturn = linkedNoReturn && can("reports.sales");
  const initial = linkedNoReturn ? ("clients" as const) : undefined;
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
            <div
              className="reports-period-presets"
              role="group"
              aria-label="Atalhos de período"
            >
              {presets.map((preset) => {
                const active =
                  preset.from === period.from && preset.to === period.to;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className="secondary-button"
                    aria-pressed={active}
                    onClick={() => {
                      setDraft({ from: preset.from, to: preset.to });
                      setPeriod({
                        from: preset.from,
                        to: preset.to,
                        version: period.version + 1,
                      });
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>
          <ReportTabs
            label="Seções dos relatórios"
            tabs={tabs}
            initial={initial}
          >
            {(tab) =>
              tab === "overview" ? (
                <ReportsDetails period={period} />
              ) : tab === "finance" ? (
                <FinancialSection period={period} />
              ) : tab === "clients" ? (
                <ReportTabs
                  sub
                  label="Relatórios de clientes"
                  tabs={clientTabs}
                  initial={noReturn ? "no-return" : undefined}
                >
                  {(view) =>
                    view === "no-return" ? (
                      <SalesInsights
                        period={period}
                        mode="clients"
                        focusNoReturn={noReturn}
                      />
                    ) : view === "details" ? (
                      <ClientDetailsSection period={period} />
                    ) : (
                      <ClientInsights period={period} view={view} />
                    )
                  }
                </ReportTabs>
              ) : (
                <DreSection period={period} />
              )
            }
          </ReportTabs>
        </>
      )}
    </div>
  );
}
