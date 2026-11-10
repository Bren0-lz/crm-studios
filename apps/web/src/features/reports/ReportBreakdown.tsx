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
        <h2>{title}</h2>
      </div>
      {!items.length ? (
        <EmptyState title="Sem movimento" copy={empty} />
      ) : (
        <div className="table-scroll">
          <table className="dre-table">
            <caption>{title} no período</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col" className="numeric-value">
                  Atendimentos
                </th>
                <th scope="col" className="numeric-value">
                  Faltas
                </th>
                <th scope="col" className="numeric-value">
                  Presença
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.name}</th>
                  <td className="numeric-value">{item.appointments}</td>
                  <td className="numeric-value">{item.noShows}</td>
                  <td className="numeric-value">{item.attendanceRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
