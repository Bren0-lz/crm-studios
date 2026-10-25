import {
  financialTotals,
  proLaboreBaseLabels,
  type FinancialEntry,
  type FinancialReport,
  type ProLaboreSettings,
} from "@crm/contracts";
import { Settings2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { getStoredBranchId } from "../../shared/api/branch";
import { currency, formatIsoDate } from "../../shared/lib/formatting";
import { formatCompetence } from "../finance/index";
import { FinancialLedger } from "./FinancialLedger";
import {
  compareBranches,
  drillFilters,
  emptyFinancialFilters,
  entryBranch,
  financialGroupings,
  groupEntries,
  inBranch,
  NO_BRANCH,
  outflowSplit,
  type FinancialFilters,
  type FinancialGrouping,
} from "./financial-model";
import { ProLaboreModal } from "./ProLaboreModal";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";

const money = (value: number) => currency.format(value / 100);
const percent = (share: number) =>
  `${(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function proLaboreLabel(settings: ProLaboreSettings) {
  return `${settings.percentage.toLocaleString("pt-BR")}% ${proLaboreBaseLabels[settings.base]}`;
}

/**
 * Caixa do período em detalhe (regime de caixa): de onde entrou, para onde saiu, quanto
 * cada profissional recebeu, pró-labore e o que fica na empresa, por filial ou consolidado.
 */
export function FinancialSection({ period }: { period: ReportPeriod }) {
  const { user, can } = useAuthorization();
  const { data, error, loading } = useReportQuery(period, api.financialReport);
  const [proLabore, setProLabore] = useState<ProLaboreSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [branchId, setBranchId] = useState(() => getStoredBranchId() ?? "");
  const [filters, setFilters] = useState<FinancialFilters>(
    emptyFinancialFilters,
  );
  const ledgerRef = useRef<HTMLElement>(null);
  const report = useMemo<FinancialReport | null>(
    () => (data && proLabore ? { ...data, proLabore } : data),
    [data, proLabore],
  );
  const branchNames = useMemo(
    () => new Map(report?.branches.map((item) => [item.id, item.name]) ?? []),
    [report],
  );
  const validBranch =
    branchId && report && !branchNames.has(branchId) && branchId !== NO_BRANCH
      ? ""
      : branchId;
  const entries = useMemo(
    () => (report ? inBranch(report.entries, validBranch) : []),
    [report, validBranch],
  );
  const totals = report ? financialTotals(entries, report.proLabore) : null;
  const split = outflowSplit(entries);
  const branches = report ? compareBranches(report) : [];
  const professionals =
    report?.professionals.filter(
      (item) => !validBranch || (item.branchId ?? NO_BRANCH) === validBranch,
    ) ?? [];
  const branchName = (entry: FinancialEntry) =>
    branchNames.get(entryBranch(entry)) ?? "Sem filial";

  function drill(next: FinancialFilters) {
    setFilters(next);
    ledgerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="reports-financial">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Resultado do caixa</h2>
            <p className="panel-context">
              {formatIsoDate(period.from)} a {formatIsoDate(period.to)} · pela
              data em que o dinheiro entrou ou saiu
              {report
                ? ` · pró-labore de ${proLaboreLabel(report.proLabore)}`
                : ""}
            </p>
          </div>
          {report && (
            <div className="financial-head-actions">
              {report.branches.length > 1 && (
                <label>
                  Filial
                  <select
                    value={validBranch}
                    onChange={(event) => setBranchId(event.target.value)}
                  >
                    <option value="">Todas as filiais</option>
                    {report.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {user?.role === "admin" && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(true)}
                >
                  <Settings2 size={16} aria-hidden="true" />
                  Configurar pró-labore
                </button>
              )}
            </div>
          )}
        </div>
        <div className="reports-body">
          {error && <ErrorBanner error={error} />}
          {loading && <LoadingBlock />}
          {report && totals && (
            <>
              <div className="reports-kpis financial-kpis">
                <article>
                  <span>Entradas</span>
                  <strong>{money(totals.inflowInCents)}</strong>
                  <small>Recebido no período, já sem estornos</small>
                </article>
                <article>
                  <span>Saídas</span>
                  <strong>{money(totals.outflowInCents)}</strong>
                  <small>Despesas pagas e pagamento de profissionais</small>
                </article>
                <article>
                  <span>Resultado do caixa</span>
                  <strong
                    className={totals.resultInCents < 0 ? "negative" : ""}
                  >
                    {money(totals.resultInCents)}
                  </strong>
                  <small>
                    {totals.marginPercent === null
                      ? "Sem entradas no período"
                      : `Margem de ${totals.marginPercent.toLocaleString("pt-BR")}%`}
                  </small>
                </article>
                <article>
                  <span>Pró-labore</span>
                  <strong>{money(totals.proLaboreInCents)}</strong>
                  <small>{proLaboreLabel(report.proLabore)}</small>
                </article>
                <article>
                  <span>Lucro no caixa da empresa</span>
                  <strong
                    className={totals.retainedInCents < 0 ? "negative" : ""}
                  >
                    {money(totals.retainedInCents)}
                  </strong>
                  <small>Resultado menos o pró-labore</small>
                </article>
              </div>
              <dl
                className="indicator-lines financial-waterfall"
                aria-label="Composição do resultado"
              >
                <div className="indicator-group">
                  <dt>Entradas</dt>
                  <dd>{money(totals.inflowInCents)}</dd>
                </div>
                <div>
                  <dt>(−) Despesas pagas</dt>
                  <dd>{money(-split.expenses)}</dd>
                </div>
                <div>
                  <dt>(−) Pagamento de profissionais</dt>
                  <dd>{money(-split.professionals)}</dd>
                </div>
                <div className="indicator-group">
                  <dt>(=) Resultado do caixa</dt>
                  <dd>{money(totals.resultInCents)}</dd>
                </div>
                <div>
                  <dt>(−) Pró-labore ({proLaboreLabel(report.proLabore)})</dt>
                  <dd>{money(-totals.proLaboreInCents)}</dd>
                </div>
                <div className="indicator-group">
                  <dt>(=) Fica no caixa da empresa</dt>
                  <dd>{money(totals.retainedInCents)}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>

      {report && (
        <>
          <div className="financial-flows">
            <FinancialBreakdown
              direction="in"
              title="Por onde entrou"
              entries={entries}
              onDrill={drill}
            />
            <FinancialBreakdown
              direction="out"
              title="Por onde saiu"
              entries={entries}
              onDrill={drill}
            />
          </div>

          <section className="panel report-table">
            <div className="panel-head">
              <div>
                <h2>Quanto cada profissional recebeu</h2>
                <p className="panel-context">
                  Pago no período pela data do pagamento; comissões geradas
                  pelas competências{" "}
                  {report.commissionMonths.map(formatCompetence).join(", ")}.
                </p>
              </div>
            </div>
            {!professionals.length ? (
              <EmptyState
                title="Nenhum pagamento a profissionais"
                copy="Comissões pagas ou geradas no período aparecem aqui."
              />
            ) : (
              <div className="table-scroll">
                <table className="dre-table">
                  <caption>Pagamentos e comissões por profissional</caption>
                  <thead>
                    <tr>
                      <th scope="col">Profissional</th>
                      <th scope="col" className="numeric-value">
                        Recebeu no período
                      </th>
                      <th scope="col" className="numeric-value">
                        Comissões geradas
                      </th>
                      <th scope="col" className="numeric-value">
                        A pagar
                      </th>
                      <th scope="col" className="table-actions-head">
                        Detalhe
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {professionals.map((item) => (
                      <tr key={item.id}>
                        <th scope="row">
                          {item.name}
                          {report.branches.length > 1 && (
                            <span className="reports-cell-detail">
                              {branchNames.get(item.branchId ?? "") ??
                                "Sem filial"}
                            </span>
                          )}
                        </th>
                        <td className="numeric-value">
                          {money(item.paidInCents)}
                        </td>
                        <td className="numeric-value">
                          {money(item.generatedInCents)}
                        </td>
                        <td className="numeric-value">
                          {money(item.openInCents)}
                        </td>
                        <td className="numeric-value">
                          <button
                            type="button"
                            className="text-button"
                            disabled={!item.paidInCents}
                            aria-label={`Ver pagamentos de ${item.name}`}
                            onClick={() =>
                              drill({
                                ...emptyFinancialFilters,
                                direction: "out",
                                professionalId: item.id,
                              })
                            }
                          >
                            Ver pagamentos
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      {(
                        [
                          "paidInCents",
                          "generatedInCents",
                          "openInCents",
                        ] as const
                      ).map((key) => (
                        <td className="numeric-value" key={key}>
                          {money(
                            professionals.reduce(
                              (sum, item) => sum + item[key],
                              0,
                            ),
                          )}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {!validBranch && branches.length > 1 && (
            <section className="panel report-table">
              <div className="panel-head">
                <div>
                  <h2>Comparativo das filiais</h2>
                  <p className="panel-context">
                    Cada filial com o mesmo pró-labore; escolha uma para ver o
                    relatório só dela.
                  </p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="dre-table">
                  <caption>Resultado do caixa por filial</caption>
                  <thead>
                    <tr>
                      <th scope="col">Filial</th>
                      <th scope="col" className="numeric-value">
                        Entradas
                      </th>
                      <th scope="col" className="numeric-value">
                        Saídas
                      </th>
                      <th scope="col" className="numeric-value">
                        Resultado
                      </th>
                      <th scope="col" className="numeric-value">
                        Pró-labore
                      </th>
                      <th scope="col" className="numeric-value">
                        Fica no caixa
                      </th>
                      <th scope="col" className="numeric-value">
                        Margem
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((branch) => (
                      <tr key={branch.id}>
                        <th scope="row">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setBranchId(branch.id)}
                          >
                            {branch.name}
                          </button>
                        </th>
                        <td className="numeric-value">
                          {money(branch.totals.inflowInCents)}
                        </td>
                        <td className="numeric-value">
                          {money(branch.totals.outflowInCents)}
                        </td>
                        <td className="numeric-value">
                          {money(branch.totals.resultInCents)}
                        </td>
                        <td className="numeric-value">
                          {money(branch.totals.proLaboreInCents)}
                        </td>
                        <td className="numeric-value">
                          {money(branch.totals.retainedInCents)}
                        </td>
                        <td className="numeric-value">
                          {branch.totals.marginPercent === null
                            ? "—"
                            : `${branch.totals.marginPercent.toLocaleString("pt-BR")}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <FinancialLedger
            ref={ledgerRef}
            entries={entries}
            filters={filters}
            onFilters={setFilters}
            showBranch={!validBranch && report.branches.length > 1}
            branchName={branchName}
            professionals={professionals}
            exportable={can("reports.export")}
            fileName={`financeiro-${report.from}-${report.to}.csv`}
          />
        </>
      )}
      {editing && report && (
        <ProLaboreModal
          settings={report.proLabore}
          onClose={() => setEditing(false)}
          onSaved={(settings) => {
            setProLabore(settings);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function FinancialBreakdown({
  direction,
  title,
  entries,
  onDrill,
}: {
  direction: FinancialEntry["direction"];
  title: string;
  entries: readonly FinancialEntry[];
  onDrill: (filters: FinancialFilters) => void;
}) {
  const options = financialGroupings[direction];
  const [grouping, setGrouping] = useState<FinancialGrouping>(options[0].key);
  const rows = groupEntries(entries, direction, grouping);
  const total = rows.reduce((sum, row) => sum + row.amountInCents, 0);
  return (
    <section className="panel report-table">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p className="panel-context">
            {money(total)} em {rows.reduce((sum, row) => sum + row.count, 0)}{" "}
            lançamentos
          </p>
        </div>
        <label className="financial-grouping">
          Agrupar por
          <select
            value={grouping}
            onChange={(event) =>
              setGrouping(event.target.value as FinancialGrouping)
            }
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!rows.length ? (
        <EmptyState
          title={direction === "in" ? "Nenhuma entrada" : "Nenhuma saída"}
          copy="Não houve movimento no caixa neste período."
        />
      ) : (
        <div className="table-scroll">
          <table className="dre-table">
            <caption>
              {title} · {options.find((item) => item.key === grouping)?.label}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  {options.find((item) => item.key === grouping)?.label}
                </th>
                <th scope="col" className="numeric-value">
                  Lançamentos
                </th>
                <th scope="col" className="numeric-value">
                  Valor
                </th>
                <th scope="col" className="numeric-value">
                  Participação
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    <button
                      type="button"
                      className="text-button"
                      title="Ver os lançamentos no extrato"
                      onClick={() =>
                        onDrill(drillFilters(direction, grouping, row.key))
                      }
                    >
                      {row.label}
                    </button>
                  </th>
                  <td className="numeric-value">{row.count}</td>
                  <td className="numeric-value">{money(row.amountInCents)}</td>
                  <td className="numeric-value">{percent(row.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
