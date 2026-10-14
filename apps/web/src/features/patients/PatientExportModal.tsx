import {
  type PatientExportColumn,
  patientExportColumns,
  patientDefaultExportColumns,
  saoPauloToday,
} from "@crm/contracts";
import { FileUp } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type PatientExportParams, api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import {
  defaultPatientFilters,
  patientExportColumnNames,
  patientRecordFilterLabels,
} from "./model";

export function PatientExportModal({
  filters,
  search,
  tagColor,
  onClose,
}: {
  filters: typeof defaultPatientFilters;
  search: string;
  tagColor: (name: string) => string;
  onClose: () => void;
}) {
  const { can } = useAuthorization();
  const [format, setFormat] = useState<PatientExportParams["format"]>("csv");
  const [columns, setColumns] = useState<PatientExportColumn[]>([
    ...patientDefaultExportColumns,
  ]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const params: PatientExportParams = {
    ...filters.profile,
    format,
    columns,
    tags: filters.tags,
  };
  if (search.trim()) params.search = search.trim();
  if (filters.status !== "all") params.status = filters.status;
  if (filters.record === "birthday_month") params.birthdayMonth = true;
  if (filters.withoutGroup) params.withoutGroup = true;
  if (filters.record === "with_email" || filters.record === "without_email")
    params.record = filters.record;

  const scope = [
    params.record
      ? `Cadastro: ${patientRecordFilterLabels[filters.record]}`
      : "",
    params.search ? `Busca: “${params.search}”` : "",
    params.status
      ? `Situação: ${params.status === "active" ? "ativos" : "inativos"}`
      : "",
    params.birthdayMonth ? "Aniversariantes do mês" : "",
    params.withoutGroup ? "Assinantes sem turma vinculada" : "",
  ].filter(Boolean);
  function toggleColumn(column: PatientExportColumn) {
    setColumns((current) =>
      current.includes(column)
        ? current.filter((item) => item !== column)
        : patientExportColumns.filter(
            (item) => item === column || current.includes(item),
          ),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (columns.length === 0) {
      setError("Selecione pelo menos uma coluna.");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const blob = await api.exportPatients(params);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `clientes-${saoPauloToday()}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
      setExporting(false);
    }
  }

  return (
    <Modal
      eyebrow="Exportação"
      title="Exportar clientes"
      subtitle="Baixe a base de clientes em planilha, com os filtros aplicados na tela."
      busy={exporting}
      onClose={onClose}
    >
      {can("patients.export") && (
        <form
          className="patient-export"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <div className="patient-export-scope">
            <span className="filter-label">Clientes exportados</span>
            {(scope.length > 0 || filters.tags.length === 0) && (
              <p>
                {scope.length
                  ? scope.join(" · ")
                  : "Nenhum filtro: todos os clientes serão exportados."}
              </p>
            )}
            {filters.tags.length > 0 && (
              <div className="patient-export-tags">
                <span>Etiquetas (qualquer uma):</span>
                {filters.tags.map((tag) => (
                  <PatientTagBadge key={tag} name={tag} color={tagColor(tag)} />
                ))}
              </div>
            )}
            {filters.sort !== "name_asc" && (
              <small>
                A ordenação da tela não se aplica: o arquivo sai em ordem
                alfabética.
              </small>
            )}
          </div>
          <fieldset className="form-fieldset">
            <legend>Formato</legend>
            <div className="form-fieldset-grid">
              {(
                [
                  ["csv", "CSV (.csv)"],
                  ["xlsx", "Excel (.xlsx)"],
                ] as const
              ).map(([value, label]) => (
                <label className="checkbox-field" key={value}>
                  <input
                    type="radio"
                    name="patient-export-format"
                    value={value}
                    checked={format === value}
                    onChange={() => setFormat(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="form-fieldset">
            <legend>Colunas</legend>
            <div className="patient-export-bulk">
              <button
                className="text-button button-sm"
                type="button"
                onClick={() => setColumns([...patientExportColumns])}
              >
                Marcar todas
              </button>
              <button
                className="text-button button-sm"
                type="button"
                onClick={() => setColumns([])}
              >
                Desmarcar todas
              </button>
            </div>
            <div className="form-fieldset-grid">
              {patientExportColumns.map((column) => (
                <label className="checkbox-field" key={column}>
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={() => toggleColumn(column)}
                  />
                  {patientExportColumnNames[column]}
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={exporting}
            >
              Voltar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={exporting}
            >
              <FileUp size={18} aria-hidden="true" />
              {exporting ? "Exportando..." : "Exportar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
