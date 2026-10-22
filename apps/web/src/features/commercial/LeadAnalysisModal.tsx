import type { LeadInsights } from "@crm/contracts";
import { Modal } from "../../shared/components/Modal";

/** Indicadores do funil com os filtros atuais: conversão por origem/contato e perdas. */
export function LeadAnalysisModal({
  insights,
  onClose,
}: {
  insights: LeadInsights;
  onClose: () => void;
}) {
  return (
    <Modal
      eyebrow="CRM comercial"
      title="Análise do funil"
      subtitle="Indicadores dos leads no filtro atual."
      wide
      onClose={onClose}
    >
      <div className="lead-analysis">
        <p role="status">
          {insights.total} leads no filtro · {insights.openTasks} tarefas
          abertas · {insights.overdueTasks} tarefas atrasadas ·{" "}
          {insights.withoutContact} sem contato registrado.
        </p>
        {[
          { title: "Conversão por origem", rows: insights.sources },
          {
            title: "Conversão por forma de contato",
            rows: insights.contactMethods,
          },
        ].map((section) => (
          <div key={section.title}>
            <h3>{section.title}</h3>
            {section.rows.length ? (
              section.rows.map((row) => (
                <div className="table-row" key={row.name}>
                  <strong>{row.name}</strong>
                  <span>
                    {row.leads} leads · {row.won} ganhos · {row.lost} perdas
                  </span>
                  <span className="numeric-value">
                    {row.conversionRate}% de conversão
                  </span>
                </div>
              ))
            ) : (
              <p>Nenhum lead no filtro.</p>
            )}
          </div>
        ))}
        <div>
          <h3>Motivos de perda</h3>
          {insights.lostReasons.length ? (
            insights.lostReasons.map((row) => (
              <div className="table-row" key={row.name}>
                <strong>{row.name}</strong>
                <span className="numeric-value">{row.leads} perdas</span>
              </div>
            ))
          ) : (
            <p>Nenhuma perda no filtro.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
