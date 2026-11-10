import type { LeadInsights } from "@crm/contracts";
import { Modal } from "../../shared/components/Modal";

type ConversionRow = LeadInsights["sources"][number];

/** Indicadores do funil com os filtros atuais: conversão por origem/contato e perdas. */
export function LeadAnalysisModal({
  insights,
  onClose,
}: {
  insights: LeadInsights;
  onClose: () => void;
}) {
  const kpis = [
    {
      label: "Leads no filtro",
      value: String(insights.total),
      note: `${insights.open} em aberto`,
    },
    {
      label: "Conversão",
      value: `${insights.conversionRate}%`,
      note: `${insights.won} ${plural(insights.won, "ganho", "ganhos")} · ${insights.lost} ${plural(insights.lost, "perda", "perdas")}`,
    },
    {
      label: "Tarefas abertas",
      value: String(insights.openTasks),
      note: `${insights.overdueTasks} ${plural(insights.overdueTasks, "atrasada", "atrasadas")}`,
      warn: insights.overdueTasks > 0,
    },
    {
      label: "Sem contato",
      value: String(insights.withoutContact),
      note: "nenhum contato registrado",
      warn: insights.withoutContact > 0,
    },
  ];
  const totalLost = insights.lostReasons.reduce(
    (sum, row) => sum + row.leads,
    0,
  );

  return (
    <Modal
      eyebrow="CRM comercial"
      title="Análise do funil"
      subtitle="Indicadores dos leads no filtro atual."
      wide
      onClose={onClose}
    >
      <div className="lead-analysis">
        <div className="lead-analysis-kpis" role="status">
          {kpis.map((kpi) => (
            <article key={kpi.label}>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small className={kpi.warn ? "is-warning" : undefined}>
                {kpi.note}
              </small>
            </article>
          ))}
        </div>
        <ConversionTable
          title="Conversão por origem"
          firstColumn="Origem"
          rows={insights.sources}
        />
        <ConversionTable
          title="Conversão por forma de contato"
          firstColumn="Forma de contato"
          rows={insights.contactMethods}
        />
        <section className="lead-analysis-section">
          <h3>Motivos de perda</h3>
          {insights.lostReasons.length ? (
            <div className="lead-analysis-table-wrap">
              <table
                className="lead-analysis-table"
                aria-label="Motivos de perda"
              >
                <thead>
                  <tr>
                    <th scope="col">Motivo</th>
                    <th scope="col" className="numeric-value">
                      Perdas
                    </th>
                    <th scope="col" className="numeric-value">
                      Participação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {insights.lostReasons.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td className="numeric-value">{row.leads}</td>
                      <td className="numeric-value">
                        {totalLost
                          ? Math.round((100 * row.leads) / totalLost)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="lead-analysis-empty">Nenhuma perda no filtro.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function ConversionTable({
  title,
  firstColumn,
  rows,
}: {
  title: string;
  firstColumn: string;
  rows: ConversionRow[];
}) {
  return (
    <section className="lead-analysis-section">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="lead-analysis-table-wrap">
          <table className="lead-analysis-table" aria-label={title}>
            <thead>
              <tr>
                <th scope="col">{firstColumn}</th>
                <th scope="col" className="numeric-value">
                  Leads
                </th>
                <th scope="col" className="numeric-value">
                  Ganhos
                </th>
                <th scope="col" className="numeric-value">
                  Perdas
                </th>
                <th scope="col" className="numeric-value">
                  Conversão
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td className="numeric-value">{row.leads}</td>
                  <td className="numeric-value">{row.won}</td>
                  <td className="numeric-value">{row.lost}</td>
                  <td className="numeric-value lead-analysis-rate">
                    {row.conversionRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="lead-analysis-empty">Nenhum lead no filtro.</p>
      )}
    </section>
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return count === 1 ? singular : pluralForm;
}
