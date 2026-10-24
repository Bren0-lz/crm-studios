import type { ManagementReport, SatisfactionReport } from "@crm/contracts";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { plural, responseTimeLabel, satisfactionLabel } from "./model";

const money = (cents: number) => currency.format(cents / 100);

/** Cartões e painéis da aba Indicadores, em linguagem do dia a dia. */
export function ClinicIndicators({
  report,
  loading,
  satisfaction,
  satisfactionError,
  canAgenda,
  canManagement,
}: {
  report: ManagementReport | null;
  loading: boolean;
  satisfaction: SatisfactionReport | null;
  satisfactionError: string;
  canAgenda: boolean;
  canManagement: boolean;
}) {
  const management = canManagement ? report : null;
  return (
    <>
      <section className="report-metrics clinic-indicators">
        {management && <ManagementCards data={management} />}
        {canManagement && (
          <article>
            <span>Aulas experimentais</span>
            {report ? (
              <>
                <strong>
                  {report.trials.completed
                    ? `${report.trials.conversionRate}%`
                    : "—"}
                </strong>
                <small>
                  {report.trials.completed
                    ? `${report.trials.converted} de ${report.trials.completed} fecharam plano em até 30 dias · ${plural(report.trials.scheduled, "agendada", "agendadas")}`
                    : `${plural(report.trials.scheduled, "agendada", "agendadas")} · nenhuma realizada no período`}
                </small>
              </>
            ) : (
              <small>
                {loading
                  ? "Carregando experimentais…"
                  : "Não foi possível carregar as experimentais."}
              </small>
            )}
          </article>
        )}
        {canAgenda && (
          <article>
            <span>Satisfação dos clientes</span>
            {satisfaction ? (
              <>
                <strong>{satisfactionLabel(satisfaction.summary.nps)}</strong>
                <small>
                  {satisfaction.summary.total
                    ? `${satisfaction.summary.promoters} de ${plural(satisfaction.summary.total, "resposta", "respostas")} recomendariam o estúdio · ${plural(satisfaction.summary.detractors, "insatisfeito", "insatisfeitos")}`
                    : "Nenhuma pesquisa respondida no período"}
                </small>
              </>
            ) : (
              <small>
                {satisfactionError || "Carregando pesquisas de satisfação…"}
              </small>
            )}
          </article>
        )}
      </section>
      {canManagement &&
        (loading ? (
          <LoadingBlock />
        ) : report ? (
          <section className="clinic-indicators-panels">
            <CashPanel data={report} />
            <OperationPanel data={report} />
          </section>
        ) : null)}
    </>
  );
}

function ManagementCards({ data }: { data: ManagementReport }) {
  const { appointments, plans, finance, commercial } = data;
  return (
    <>
      <article>
        <span>Dinheiro recebido</span>
        <strong>{money(finance.paidInPeriodInCents)}</strong>
        <small>
          {finance.overdueInCents
            ? `${money(finance.overdueInCents)} em pagamentos atrasados`
            : "Nenhum pagamento atrasado"}
        </small>
      </article>
      <article>
        <span>Atendimentos</span>
        <strong>{appointments.total}</strong>
        <small>{appointments.attendanceRate}% dos agendados compareceram</small>
      </article>
      <article>
        <span>Sessões ainda por usar</span>
        <strong>{plans.availableSessions}</strong>
        <small>
          Somando {plural(plans.active, "plano ativo", "planos ativos")}
        </small>
      </article>
      <article>
        <span>Novos interessados</span>
        <strong>{commercial.leadsCreated}</strong>
        <small>
          {commercial.leadsCreated
            ? `${commercial.won} ${commercial.won === 1 ? "virou cliente" : "viraram clientes"} (${commercial.conversionRate}%) · primeira resposta em ${responseTimeLabel(commercial.averageFirstResponseMinutes)}`
            : "Nenhum contato novo no período"}
        </small>
      </article>
    </>
  );
}

function CashPanel({ data }: { data: ManagementReport }) {
  const dre = data.profitability.dre;
  const expenses =
    dre.productCostInCents +
    dre.operatingExpensesInCents +
    dre.commissionsInCents;
  const net = dre.netResultInCents;
  return (
    <div className="panel indicator-card">
      <div className="panel-head">
        <div>
          <h2>
            {net >= 0 ? "Quanto sobrou no caixa" : "Quanto faltou no caixa"}
          </h2>
          <p className="panel-context">
            Tudo o que entrou menos tudo o que saiu no período.
          </p>
        </div>
        <strong className={net >= 0 ? "positive" : "negative"}>
          {money(net)}
        </strong>
      </div>
      <div className="cash-body">
        <dl className="indicator-lines">
          <div className="indicator-group">
            <dt>Entrou</dt>
            <dd>{money(dre.grossRevenueInCents)}</dd>
          </div>
          <div>
            <dt>Sessões e planos</dt>
            <dd>{money(dre.serviceRevenueInCents)}</dd>
          </div>
          <div>
            <dt>Venda de produtos</dt>
            <dd>{money(dre.productRevenueInCents)}</dd>
          </div>
          <div className="indicator-group">
            <dt>Saiu</dt>
            <dd>{money(expenses)}</dd>
          </div>
          <div>
            <dt>Compra dos produtos vendidos</dt>
            <dd>{money(dre.productCostInCents)}</dd>
          </div>
          <div>
            <dt>Despesas da clínica</dt>
            <dd>{money(dre.operatingExpensesInCents)}</dd>
          </div>
          <div>
            <dt>Comissões da equipe</dt>
            <dd>{money(dre.commissionsInCents)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function OperationPanel({ data }: { data: ManagementReport }) {
  const operational = data.profitability.operational;
  const free = Math.max(
    operational.totalGroupCapacity - operational.activeGroupSeats,
    0,
  );
  return (
    <div className="panel indicator-card">
      <div className="panel-head">
        <div>
          <h2>Turmas e loja</h2>
          <p className="panel-context">Como estão as vagas e os produtos.</p>
        </div>
      </div>
      <div className="cash-body">
        {operational.totalGroupCapacity > 0 ? (
          <div className="cash-summary">
            <div className="occupancy-line">
              <span>Vagas ocupadas nas turmas</span>
              <strong>
                {operational.activeGroupSeats} de{" "}
                {operational.totalGroupCapacity}
              </strong>
            </div>
            <progress
              max={operational.totalGroupCapacity}
              value={Math.min(
                operational.activeGroupSeats,
                operational.totalGroupCapacity,
              )}
              aria-label="Vagas ocupadas nas turmas"
            />
            <p>
              {Math.round(operational.groupOccupancyRate)}% preenchidas ·{" "}
              {free === 0
                ? "turmas cheias"
                : plural(free, "vaga livre", "vagas livres")}
            </p>
          </div>
        ) : (
          <div className="cash-summary">
            <p>Nenhuma turma com vagas cadastradas.</p>
          </div>
        )}
        <dl className="indicator-lines">
          <div>
            <dt>Pessoas na lista de espera</dt>
            <dd>{operational.waitlistCount}</dd>
          </div>
          <div>
            <dt>Produtos acabando no estoque</dt>
            <dd>{operational.lowStockCount}</dd>
          </div>
          <div>
            <dt>Produtos vendidos</dt>
            <dd>{operational.productUnitsSold}</dd>
          </div>
          <div>
            <dt>Valor médio de cada pagamento</dt>
            <dd>{money(operational.averageReceiptInCents)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
