import type { ManagementReport, SatisfactionReport } from "@crm/contracts";
import { Link } from "react-router-dom";
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
                    ? `${report.trials.converted} de ${report.trials.completed} ${report.trials.completed === 1 ? "pessoa fechou" : "pessoas fecharam"} plano (30 dias antes ou depois) · ${plural(report.trials.scheduled, "agendada", "agendadas")}`
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
          <OperationPanel data={report} />
        ) : null)}
    </>
  );
}

function ManagementCards({ data }: { data: ManagementReport }) {
  const { appointments, plans, finance, commercial } = data;
  return (
    <>
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
        <span>Pagamentos atrasados</span>
        <strong>{money(finance.overdueInCents)}</strong>
        <small>
          {finance.overdueInCents ? (
            <Link to="/financeiro">Ver no Financeiro</Link>
          ) : (
            "Nenhum pagamento atrasado"
          )}
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
            <dt>Produtos para repor</dt>
            <dd>{operational.lowStockCount}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
