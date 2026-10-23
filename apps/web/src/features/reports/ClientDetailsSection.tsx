import {
  clientDetailsColumnLabels,
  type ClientDetailsColumn,
  type ClientDetailsReport,
  type PatientProfileFilter,
} from "@crm/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { localIsoDate } from "../../shared/lib/formatting";
type Filters = PatientProfileFilter & {
  from: string;
  to: string;
  search: string;
  status?: "active" | "inactive" | undefined;
};
export function ClientDetailsSection() {
  const { can } = useAuthorization();
  const [opened, setOpened] = useState(false),
    [filter, setFilter] = useState<Filters>({
      from: `${localIsoDate().slice(0, 4)}-01-01`,
      to: localIsoDate(),
      search: "",
    }),
    [applied, setApplied] = useState<Filters>(filter),
    [report, setReport] = useState<ClientDetailsReport | null>(null),
    [columns, setColumns] = useState<ClientDetailsColumn[]>([
      "fullName",
      "recordNumber",
      "status",
      "city",
      "activePlans",
      "attendanceCount",
      "attendanceRate",
    ]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [printed, setPrinted] = useState<ClientDetailsReport | null>(null);
  async function load() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const data = await api.clientDetailsReport(filter);
      setApplied({ ...filter });
      setReport(data);
      setColumns((current) =>
        current.filter((column) => data.availableColumns.includes(column)),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
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
                <th scope="col" key={column}>
                  {clientDetailsColumnLabels[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                {selected.map((column) => (
                  <td key={column}>
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
    if (!columns.length) {
      setError("Selecione pelo menos uma coluna.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api.clientDetailsReport({ ...applied, columns }, true);
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
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && !opened) {
            setOpened(true);
            void load();
          }
        }}
      >
        <summary className="panel-head">
          Clientes, frequência, aparelhos e produtos
        </summary>
        {opened && (
          <div className="inventory-body">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
            >
              <label>
                De
                <input
                  required
                  type="date"
                  value={filter.from}
                  onChange={(event) =>
                    setFilter({ ...filter, from: event.target.value })
                  }
                />
              </label>
              <label>
                Até
                <input
                  required
                  type="date"
                  min={filter.from}
                  value={filter.to}
                  onChange={(event) =>
                    setFilter({ ...filter, to: event.target.value })
                  }
                />
              </label>
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
              <button className="primary-button" disabled={busy}>
                Consultar clientes
              </button>
            </form>
            {error && <ErrorBanner error={error} />}
            {busy && <LoadingBlock />}
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
                  table(report, columns)
                ) : (
                  <EmptyState
                    title="Nenhum cliente encontrado"
                    copy="Revise os filtros e o período."
                  />
                )}
                {can("reports.export") && (
                  <div className="page-actions">
                    <button
                      disabled={busy || !columns.length}
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
        )}
      </details>
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
