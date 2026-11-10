import type { ManagementReport } from "@crm/contracts/reports";
import { currency } from "../../shared/lib/formatting";
import { EmptyState } from "../../shared/components/EmptyState";
const money = (value: number) => currency.format(value / 100);
export function ProfitTables({ report }: { report: ManagementReport }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Rentabilidade por serviço</h2>
      </div>
      {!report.profitability.byService.length ? (
        <EmptyState
          title="Sem dados"
          copy="Não houve produção ou recebimento de serviços no período."
        />
      ) : (
        <div className="table-scroll">
          <table className="dre-table">
            <caption>Receita e contribuição por serviço</caption>
            <thead>
              <tr>
                <th scope="col">Serviço</th>
                <th scope="col" className="numeric-value">
                  Receita
                </th>
                <th scope="col" className="numeric-value">
                  Comissões
                </th>
                <th scope="col" className="numeric-value">
                  Contribuição
                </th>
                <th scope="col" className="numeric-value">
                  Margem
                </th>
              </tr>
            </thead>
            <tbody>
              {report.profitability.byService.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    {item.name}
                    <small className="reports-cell-detail">
                      {item.completedAppointments} atendimentos concluídos
                    </small>
                  </th>
                  <td className="numeric-value">
                    {money(item.revenueInCents)}
                  </td>
                  <td className="numeric-value">
                    {money(item.commissionsInCents)}
                  </td>
                  <td className="numeric-value">
                    {money(item.contributionInCents)}
                  </td>
                  <td className="numeric-value">{item.contributionMargin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
