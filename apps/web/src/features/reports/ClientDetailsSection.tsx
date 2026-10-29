import {
  clientDetailsColumnLabels,
  type ClientDetailsColumn,
  type ClientDetailsReport,
  type PatientProfileFilter,
} from "@crm/contracts";
import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";
type Filters = PatientProfileFilter & {
  search: string;
  status?: "active" | "inactive" | undefined;
  discount?: "with" | "without" | undefined;
};
export function ClientDetailsSection({ period }: { period: ReportPeriod }) {
  const { can } = useAuthorization();
  const [filter, setFilter] = useState<Filters>({
      search: "",
    }),
    [applied, setApplied] = useState<Filters>(filter),
    [columns, setColumns] = useState<ClientDetailsColumn[]>([
      "fullName",
      "recordNumber",
      "status",
      "city",
      "activePlans",
      "attendanceCount",
      "attendanceRate",
    ]),
    [exportError, setExportError] = useState({ period, message: "" }),
    [exporting, setBusy] = useState(false),
    [printed, setPrinted] = useState<ClientDetailsReport | null>(null);
  const loader = useCallback(
    (from: string, to: string) =>
      api.clientDetailsReport({ ...applied, from, to }),
    [applied],
  );
  const {
    data: report,
    error: queryError,
    loading,
  } = useReportQuery(period, loader);
  const busy = loading || exporting;
  const error =
    queryError || (exportError.period === period ? exportError.message : "");
  const selectedColumns = columns.filter((column) =>
    report?.availableColumns.includes(column),
  );
  function load() {
    setApplied({ ...filter });
  }
  function display(value: string | number | boolean | undefined) {
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return value.split("-").reverse().join("/");
    return value ?? "";
  }
  function table(
    data: ClientDetailsReport,
    selected: ClientDetailsColumn[],
    printing = false,
  ) {
    return (
      <div className="table-scroll">
        <table className="dre-table">
          <caption>
            Clientes · {display(data.from)} a {display(data.to)} ·{" "}
            {data.rows.length} registros
          </caption>
          <thead>
            <tr>
              {selected.map((column) => (
                <th
                  scope="col"
                  className={
                    typeof data.rows[0]?.values[column] === "number"
                      ? "numeric-value"
                      : undefined
                  }
                  key={column}
                >
                  {clientDetailsColumnLabels[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                {selected.map((column) => (
                  <td
                    className={
                      typeof row.values[column] === "number"
                        ? "numeric-value"
                        : undefined
                    }
                    key={column}
                  >
                    {column === "fullName" &&
                    can("patients.view") &&
                    !printing ? (
                      <Link to={`/clientes/${row.id}`}>
                        {display(row.values[column])}
                      </Link>
                    ) : (
                      display(row.values[column])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  async function exportReport(print = false) {
    if (!selectedColumns.length) {
      setExportError({ period, message: "Selecione pelo menos uma coluna." });
      return;
    }
    setBusy(true);
    setExportError({ period, message: "" });
    try {
      const data = await api.clientDetailsReport(
        {
          ...applied,
          from: period.from,
          to: period.to,
          columns: selectedColumns,
        },
        true,
      );
      if (print) {
        setPrinted(data);
        requestAnimationFrame(() => {
          window.print();
          setPrinted(null);
        });
      } else {
        const escape = (value: unknown) => {
            let text = String(value ?? "");
            if (/^[=+@-]/.test(text)) text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          },
          rows = [
            data.columns.map((column) => clientDetailsColumnLabels[column]),
            ...data.rows.map((row) =>
              data.columns.map((column) => display(row.values[column])),
            ),
          ],
          blob = new Blob(
            [
              "\ufeff" +
                rows.map((row) => row.map(escape).join(";")).join("\r\n"),
            ],
            { type: "text/csv;charset=utf-8" },
          ),
          url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `clientes-${data.from}-${data.to}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      setExportError({ period, message: (cause as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Clientes, frequência, aparelhos e produtos</h2>
          <p className="panel-context">
            Consulte os clientes e escolha os dados que deseja exportar.
          </p>
        </div>
      </div>
      <div className="reports-body">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Buscar cliente
            <input
              maxLength={160}
              value={filter.search}
              onChange={(event) =>
                setFilter({ ...filter, search: event.target.value })
              }
            />
          </label>
          <label>
            Situação
            <select
              value={filter.status ?? ""}
              onChange={(event) =>
                setFilter({
                  ...filter,
                  status: (event.target.value ||
                    undefined) as Filters["status"],
                })
              }
            >
              <option value="">Todas</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          <label>
            Desconto
            <select
              value={filter.discount ?? ""}
              onChange={(event) =>
                setFilter({
                  ...filter,
                  discount: (event.target.value ||
                    undefined) as Filters["discount"],
                })
              }
            >
              <option value="">Todos</option>
              <option value="with">Com desconto</option>
              <option value="without">Sem desconto</option>
            </select>
          </label>
          <details className="report-filter-advanced">
            <summary>Filtros avançados</summary>
            <div className="form-grid">
              {(
                [
                  ["city", "Cidade"],
                  ["neighborhood", "Bairro"],
                  ["occupation", "Profissão"],
                  ["source", "Origem"],
                  ["level", "Nível"],
                  ["interest", "Interesse"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={key === "interest" ? 80 : 120}
                    value={filter[key] ?? ""}
                    onChange={(event) =>
                      setFilter({
                        ...filter,
                        [key]: event.target.value || undefined,
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Gênero
                <select
                  value={filter.gender ?? ""}
                  onChange={(event) =>
                    setFilter({
                      ...filter,
                      gender: (event.target.value ||
                        undefined) as Filters["gender"],
                    })
                  }
                >
                  <option value="">Todos</option>
                  <option value="female">Feminino</option>
                  <option value="male">Masculino</option>
                  <option value="other">Outro</option>
                  <option value="undisclosed">Prefere não informar</option>
                </select>
              </label>
              <label>
                Segmento
                <select
                  value={filter.segment ?? ""}
                  onChange={(event) =>
                    setFilter({
                      ...filter,
                      segment: (event.target.value ||
                        undefined) as Filters["segment"],
                    })
                  }
                >
                  <option value="">Todos</option>
                  <option value="active_plan">Com plano vigente</option>
                  <option value="no_plan">Sem plano vigente</option>
                  <option value="renewal">Renovação em até 30 dias</option>
                  <option value="replacement">Reposição disponível</option>
                  <option value="waiting">Lista de espera</option>
                  {can("finance.view") && (
                    <>
                      <option value="pending">Contas pendentes</option>
                      <option value="overdue">Contas atrasadas</option>
                    </>
                  )}
                </select>
              </label>
            </div>
          </details>
          <button className="primary-button" disabled={busy}>
            Consultar clientes
          </button>
        </form>
        {error && <ErrorBanner error={error} />}
        {loading && <LoadingBlock />}
        {report && (
          <>
            <details>
              <summary>Selecionar colunas</summary>
              <div className="form-grid">
                {report.availableColumns.map((column) => (
                  <label className="checkbox-field" key={column}>
                    <input
                      type="checkbox"
                      checked={columns.includes(column)}
                      onChange={(event) =>
                        setColumns((current) =>
                          event.target.checked
                            ? [...current, column]
                            : current.filter((item) => item !== column),
                        )
                      }
                    />
                    {clientDetailsColumnLabels[column]}
                  </label>
                ))}
              </div>
            </details>
            {report.rows.length ? (
              table(report, selectedColumns)
            ) : (
              <EmptyState
                title="Nenhum cliente encontrado"
                copy="Revise os filtros e o período."
              />
            )}
            {can("reports.clients_export") && (
              <div className="page-actions">
                <button
                  disabled={busy || !selectedColumns.length}
                  className="secondary-button"
                  onClick={() => void exportReport()}
                >
                  Exportar clientes
                </button>
                <button
                  disabled={busy || !columns.length}
                  className="secondary-button"
                  onClick={() => void exportReport(true)}
                >
                  Imprimir clientes
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {printed &&
        createPortal(
          <div className="clinical-print-sheet">
            <h1>Relatório de clientes</h1>
            {table(printed, printed.columns, true)}
          </div>,
          document.body,
        )}
    </section>
  );
}
