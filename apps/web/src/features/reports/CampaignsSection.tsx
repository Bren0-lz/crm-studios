import { useEffect, useState } from "react";
import type { CampaignReportKind, CampaignReportRow } from "@crm/contracts";
import { Download, Megaphone } from "lucide-react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { formatIsoDate, shortDate } from "../../shared/lib/formatting";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";

const kindLabels: Record<CampaignReportKind, string> = {
  manual: "Manual",
  automatic: "Automática",
};

function situation(row: CampaignReportRow) {
  if (row.kind === "automatic") return row.active ? "Ligada" : "Desligada";
  return row.active ? "Em andamento" : "Concluída";
}

export function CampaignsSection({ period }: { period: ReportPeriod }) {
  const { can } = useAuthorization();
  // Envio marcado na fila (ou agendamento com promoção) atualiza os números na hora;
  // ao voltar para a aba, recarrega o que foi marcado em outra janela.
  const version = useDataVersion("communications", "agenda");
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden")
        setFocusTick((value) => value + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const {
    data: report,
    error,
    loading,
  } = useReportQuery(period, api.campaignReport, true, version + focusTick);
  const [kind, setKind] = useState<CampaignReportKind | "">("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState({ period, message: "" });
  async function exportXlsx() {
    setExporting(true);
    setExportError({ period, message: "" });
    try {
      const blob = await api.campaignReportXlsx(period.from, period.to);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `campanhas-${period.from}-${period.to}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError({ period, message: (cause as Error).message });
    } finally {
      setExporting(false);
    }
  }
  const rows =
    report?.campaigns.filter((row) => !kind || row.kind === kind) ?? [];
  return (
    <section className="panel reports-campaigns">
      <div className="panel-head">
        <div>
          <h2>Campanhas</h2>
          <p className="panel-context">
            Campanhas manuais criadas e mensagens automáticas marcadas no
            período.
          </p>
        </div>
        {can("reports.campaigns_export") && (
          <button
            type="button"
            className="secondary-button"
            disabled={!report || exporting}
            onClick={() => void exportXlsx()}
          >
            <Download size={16} aria-hidden="true" />
            {exporting ? "Exportando…" : "Exportar planilha"}
          </button>
        )}
      </div>
      {error && <ErrorBanner error={error} />}
      {exportError.period === period && exportError.message && (
        <ErrorBanner error={exportError.message} />
      )}
      {loading && <LoadingBlock />}
      {report && (
        <div className="reports-body">
          <div className="reports-kpis">
            <article>
              <span>Campanhas</span>
              <strong>
                {report.summary.manualCampaigns +
                  report.summary.automaticCampaigns}
              </strong>
              <small>
                {report.summary.manualCampaigns} manuais ·{" "}
                {report.summary.automaticCampaigns} automáticas
              </small>
            </article>
            <article>
              <span>Mensagens enviadas</span>
              <strong>{report.summary.sent}</strong>
              <small>
                {report.summary.skipped} não enviadas · {report.summary.pending}{" "}
                pendentes
              </small>
            </article>
            <article>
              <span>Promoções usadas</span>
              <strong>{report.summary.redemptions}</strong>
              <small>Agendamentos com promoção, sem os cancelados</small>
            </article>
          </div>
          {!report.campaigns.length ? (
            <EmptyState
              icon={Megaphone}
              title="Nenhuma campanha no período."
              copy="Campanhas criadas ou mensagens marcadas em Comunicação aparecem aqui."
            />
          ) : (
            <>
              <label className="filter-group">
                <span className="filter-label">Tipo de campanha</span>
                <select
                  value={kind}
                  onChange={(event) =>
                    setKind(event.target.value as CampaignReportKind | "")
                  }
                >
                  <option value="">Todas</option>
                  <option value="automatic">Automáticas</option>
                  <option value="manual">Manuais</option>
                </select>
              </label>
              {!rows.length ? (
                <EmptyState
                  icon={Megaphone}
                  title="Nenhuma campanha desse tipo no período."
                  copy="Escolha outro tipo ou altere o período."
                />
              ) : (
                <div className="table-scroll">
                  <table className="dre-table">
                    <caption>
                      Campanhas · {formatIsoDate(report.from)} a{" "}
                      {formatIsoDate(report.to)}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Campanha</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Situação</th>
                        <th scope="col" className="numeric-value">
                          Enviadas
                        </th>
                        <th scope="col" className="numeric-value">
                          Não enviadas
                        </th>
                        <th scope="col" className="numeric-value">
                          Pendentes
                        </th>
                        <th scope="col" className="numeric-value">
                          Promoções usadas
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.campaignId}>
                          <th scope="row">
                            {row.name}
                            <span className="reports-cell-detail">
                              {row.origin} · criada em{" "}
                              {shortDate.format(new Date(row.createdAt))} por{" "}
                              {row.createdByName}
                            </span>
                          </th>
                          <td>{kindLabels[row.kind]}</td>
                          <td>
                            <span className="status-pill">
                              {situation(row)}
                            </span>
                          </td>
                          <td className="numeric-value">{row.sent}</td>
                          <td className="numeric-value">{row.skipped}</td>
                          <td className="numeric-value">
                            {row.kind === "manual" || report.queueDate
                              ? row.pending
                              : "—"}
                          </td>
                          <td className="numeric-value">
                            {row.promotional ? row.redemptions : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
