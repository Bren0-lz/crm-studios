import {
  type PatientImportAnalysis,
  type PatientImportField,
  type PatientImportFileInput,
  type PatientImportResult,
  formatPhone,
  INCOMPLETE_REGISTRATION_TAG,
  lacksEmail,
  lacksRequiredContact,
  MISSING_CPF_TAG,
  INVALID_CPF_TAG,
  MISSING_EMAIL_TAG,
} from "@crm/contracts";
import { Download, FileDown } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import {
  type PatientImportMapping,
  assignImportColumn,
  countLabel,
  describeImportDuplicate,
  importMergeCount,
  patientImportColumnTitle,
  patientImportFieldOptions,
  patientImportStatusLabels,
  patientImportTemplateHref,
  importRowNotes,
  readFileAsBase64,
  storeImportMapping,
  storedImportMapping,
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
  const [mapping, setMapping] = useState<PatientImportMapping>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function selectFile(selected: File | undefined) {
    setAnalysis(null);
    setResult(null);
    setFile(null);
    setMapping([]);
    setError("");
    if (!selected) return;
    setLoading(true);
    try {
      const input = {
        fileName: selected.name,
        contentBase64: await readFileAsBase64(selected),
      };
      let preview = await api.previewPatientImport(input);
      // Mesma planilha de antes (mesmos títulos): reaplica o mapeamento escolhido da última vez.
      const saved = storedImportMapping(preview.columns);
      if (saved && saved.join() !== preview.mapping.join())
        preview = await api.previewPatientImport({ ...input, mapping: saved });
      setAnalysis(preview);
      setMapping(preview.mapping);
      setFile(input);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function changeColumn(index: number, field: PatientImportField | null) {
    if (!file) return;
    const next = assignImportColumn(mapping, index, field);
    setMapping(next);
    setLoading(true);
    setError("");
    try {
      setAnalysis(await api.previewPatientImport({ ...file, mapping: next }));
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
      setResult(await api.importPatients({ ...file, mapping }));
      if (analysis) storeImportMapping(analysis.columns, mapping);
      setAnalysis(null);
      setFile(null);
      setMapping([]);
      onImported();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const validCount = analysis?.totals.valid ?? 0;
  const mergeCount = analysis ? importMergeCount(analysis.rows) : 0;
  // B6-05: linhas válidas sem CPF entram com a etiqueta automática "Falta CPF".
  const validInputs =
    analysis?.rows.flatMap((row) =>
      row.status === "valid" && row.input ? [row.input] : [],
    ) ?? [];
  // CPF errado também entra sem CPF, mas com a etiqueta "CPF inválido" (contado à parte).
  const withoutCpfCount = validInputs.filter(
    (input) => !input.cpf && !input.invalidCpf,
  ).length;
  const invalidCpfCount = validInputs.filter((input) => input.invalidCpf).length;
  // CD3: sem WhatsApp/contato de emergência ou sem e-mail entram com as etiquetas automáticas.
  const incompleteCount = validInputs.filter(lacksRequiredContact).length;
  const withoutEmailCount = validInputs.filter(lacksEmail).length;
  // Sem planilha, Importar fica desativado dizendo o que falta; sem linhas válidas, a prévia explica.
  const missing = useMissingFields(
    file || analysis ? [] : ["Planilha de clientes"],
    "field-hint",
  );
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
            {`${countLabel(result.created, "cliente importado", "clientes importados")}, ${result.updated ? `${countLabel(result.updated, "cliente atualizado", "clientes atualizados")} em “Outros”, ` : ""}${countLabel(result.skipped, "ignorado", "ignorados")} por duplicidade e ${result.errors} com erro.`}
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
              A primeira linha deve ter os títulos das colunas. Depois de
              enviar, escolha a que dado do sistema corresponde cada coluna
              (nome e telefone são obrigatórios). Quem vier sem CPF recebe a
              etiqueta “{MISSING_CPF_TAG}”; com CPF errado, entra sem CPF e
              recebe “{INVALID_CPF_TAG}”; sem WhatsApp ou contato de
              emergência, “{INCOMPLETE_REGISTRATION_TAG}”; sem e-mail,
              “{MISSING_EMAIL_TAG}”. Elas saem sozinhas quando o dado for
              preenchido. Datas em dd/mm/aaaa e etiquetas separadas por
              vírgula. Até 2 MB.
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
        {analysis && analysis.columns.length > 0 && (
          <section
            className="patient-import-mapping"
            aria-labelledby="patient-import-mapping-title"
          >
            <div className="patient-import-mapping-head">
              <h3 id="patient-import-mapping-title">Colunas da planilha</h3>
              <span className="field-hint">
                Escolha a que dado do sistema corresponde cada coluna. As
                colunas marcadas como “Não importar” são ignoradas; as
                marcadas como “Outros” ficam na ficha com o título da coluna
                (e atualizam quem já está cadastrado).
              </span>
            </div>
            <div className="patient-import-mapping-list">
              {analysis.columns.map((column) => {
                const title = patientImportColumnTitle(column);
                return (
                  <div
                    className="patient-import-mapping-row"
                    key={column.index}
                  >
                    <div className="patient-import-mapping-column">
                      <strong>{title}</strong>
                      <small>
                        {column.samples.length > 0
                          ? `Ex.: ${column.samples.join(" · ")}`
                          : "Sem valores"}
                      </small>
                    </div>
                    <select
                      aria-label={`Dado do sistema para a coluna ${title}`}
                      value={mapping[column.index] ?? ""}
                      disabled={loading}
                      onChange={(event) =>
                        void changeColumn(
                          column.index,
                          (event.target.value ||
                            null) as PatientImportField | null,
                        )
                      }
                    >
                      <option value="">Não importar</option>
                      {patientImportFieldOptions.values.map((option) => (
                        <option key={option.field} value={option.field}>
                          {option.label}
                        </option>
                      ))}
                      <optgroup label="DDD em coluna separada">
                        {patientImportFieldOptions.areaCodes.map((option) => (
                          <option key={option.field} value={option.field}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                );
              })}
            </div>
          </section>
        )}
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
              {withoutCpfCount > 0 && (
                <span className="status-pill">{`${withoutCpfCount} sem CPF`}</span>
              )}
              {invalidCpfCount > 0 && (
                <span className="status-pill">
                  {countLabel(
                    invalidCpfCount,
                    "CPF inválido",
                    "CPFs inválidos",
                  )}
                </span>
              )}
              {incompleteCount > 0 && (
                <span className="status-pill">
                  {countLabel(
                    incompleteCount,
                    "cadastro incompleto",
                    "cadastros incompletos",
                  )}
                </span>
              )}
              {withoutEmailCount > 0 && (
                <span className="status-pill">{`${withoutEmailCount} sem e-mail`}</span>
              )}
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
                          ? describeImportDuplicate(row.duplicateOf, row.input)
                          : ["Pronta para importar", ...importRowNotes(row.input)].join(" · ")}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {!result && can("patients.import") && missing.hint}
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
              disabled={loading || !file || validCount + mergeCount === 0}
              aria-describedby={missing.describedBy}
              onClick={() => void confirmImport()}
            >
              <FileDown size={18} aria-hidden="true" />
              {`Importar ${countLabel(validCount, "cliente", "clientes")}${mergeCount ? ` e atualizar ${mergeCount}` : ""}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
