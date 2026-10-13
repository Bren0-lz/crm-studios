import {
  type PatientImportAnalysis,
  type PatientImportFileInput,
  type PatientImportResult,
  formatPhone,
} from "@crm/contracts";
import { Download, FileDown } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  countLabel,
  describeImportDuplicate,
  patientImportStatusLabels,
  patientImportTemplateHref,
  readFileAsBase64,
} from "./model";

export function PatientImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { can } = useAuthorization();
  const [file, setFile] = useState<PatientImportFileInput | null>(null);
  const [analysis, setAnalysis] = useState<PatientImportAnalysis | null>(null);
  const [result, setResult] = useState<PatientImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function selectFile(selected: File | undefined) {
    setAnalysis(null);
    setResult(null);
    setFile(null);
    setError("");
    if (!selected) return;
    setLoading(true);
    try {
      const input = {
        fileName: selected.name,
        contentBase64: await readFileAsBase64(selected),
      };
      setAnalysis(await api.previewPatientImport(input));
      setFile(input);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setResult(await api.importPatients(file));
      setAnalysis(null);
      setFile(null);
      onImported();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const validCount = analysis?.totals.valid ?? 0;
  return (
    <Modal
      eyebrow="Importação"
      title="Importar clientes"
      subtitle="Envie uma planilha .csv ou .xlsx, confira a prévia e confirme a importação."
      busy={loading}
      onClose={onClose}
    >
      <div className="patient-import">
        {error && <ErrorBanner error={error} />}
        {result && (
          <div className="success-banner" role="status">
            {`${countLabel(result.created, "cliente importado", "clientes importados")}, ${countLabel(result.skipped, "ignorado", "ignorados")} por duplicidade e ${result.errors} com erro.`}
          </div>
        )}
        <div className="patient-import-file">
          <div className="field-with-hint">
            <label htmlFor="patient-import-file">Planilha de clientes</label>
            <input
              id="patient-import-file"
              type="file"
              accept=".csv,.xlsx"
              aria-describedby="patient-import-hint"
              disabled={loading}
              onChange={(event) => void selectFile(event.target.files?.[0])}
            />
            <span className="field-hint" id="patient-import-hint">
              Colunas aceitas: nome, cpf, telefone, whatsapp, email, nascimento
              (dd/mm/aaaa), etiquetas (separadas por vírgula) e observações. Até
              2 MB.
            </span>
          </div>
          <a
            className="text-link"
            href={patientImportTemplateHref}
            download="modelo-clientes.csv"
          >
            <Download size={16} aria-hidden="true" />
            Baixar modelo CSV
          </a>
        </div>
        {loading && <LoadingBlock />}
        {analysis && (
          <>
            {analysis.errors.map((message) => (
              <ErrorBanner key={message} error={message} />
            ))}
            <div className="patient-import-totals" aria-live="polite">
              <span className="status-pill import-valid">
                {countLabel(analysis.totals.valid, "válido", "válidos")}
              </span>
              <span className="status-pill import-error">{`${analysis.totals.error} com erro`}</span>
              <span className="status-pill import-duplicate">
                {countLabel(
                  analysis.totals.duplicate,
                  "duplicado",
                  "duplicados",
                )}
              </span>
            </div>
            {analysis.rows.length > 0 && (
              <div className="patient-import-table">
                <div className="table-row table-head">
                  <span>Linha</span>
                  <span>Nome</span>
                  <span>Telefone</span>
                  <span>Situação</span>
                  <span>Detalhes</span>
                </div>
                {analysis.rows.map((row) => (
                  <div className="table-row" key={row.line}>
                    <span>{row.line}</span>
                    <strong>{row.fullName || "—"}</strong>
                    <span>{row.phone ? formatPhone(row.phone) : "—"}</span>
                    <span>
                      <span className={`status-pill import-${row.status}`}>
                        {patientImportStatusLabels[row.status]}
                      </span>
                    </span>
                    <small>
                      {row.status === "error"
                        ? (row.errors ?? []).join(" ")
                        : row.duplicateOf
                          ? describeImportDuplicate(row.duplicateOf)
                          : "Pronta para importar"}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            {result ? "Fechar" : "Cancelar"}
          </button>
          {!result && can("patients.import") && (
            <button
              type="button"
              className="primary-button"
              disabled={loading || !file || validCount === 0}
              onClick={() => void confirmImport()}
            >
              <FileDown size={18} aria-hidden="true" />
              {`Importar ${countLabel(validCount, "cliente", "clientes")}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
