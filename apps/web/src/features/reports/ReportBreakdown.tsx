import type { ManagementReport } from "@crm/contracts";
import { EmptyState } from "../../shared/components/EmptyState";

export function ReportBreakdown({
  title,
  items,
  empty,
}: {
  title: string;
  items: ManagementReport["byProfessional"];
  empty: string;
}) {
  return (
    <section className="panel report-table">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Operação</span>
          <h2>{title}</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Sem movimento" copy={empty} />
      ) : (
        <div className="report-rows">
          {items.map((item) => (
            <div key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.appointments} atendimentos</span>
              <span>{item.noShows} faltas</span>
              <b>{item.attendanceRate}%</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
