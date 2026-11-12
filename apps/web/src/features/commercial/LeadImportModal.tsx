import { withPrefix } from "@crm/contracts";
import {
  EVENT_IMPORT_EXTRA_FIELD,
  LEAD_IMPORT_DEFAULT_SOURCE,
  leadImportFieldLabels,
  type LeadImportAnalysis,
  type LeadImportField,
  type LeadImportPreviewInput,
  type LeadImportResult,
  type LeadStageConfig,
} from "@crm/contracts";
import { Download, FileDown } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { CatalogSelect } from "../../shared/components/CatalogSelect";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { readFileAsBase64 } from "../../shared/lib/import-file";

const template = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿nome;telefone;whatsapp;email;origem;interesse;observações\r\nMaria da Silva;11999990000;;;Instagram;Pilates;Prefere contato à tarde\r\n")}`;
const mappingKey = "crm.leadImportMapping";

/**
 * LI1: importa leads de uma planilha direto no funil, sem evento. Origem e etapa valem para
 * todas as linhas (a coluna "Origem", se mapeada, vale por linha). Contato repetido só avisa.
 */
export function LeadImportModal({
  stages,
  onClose,
  onImported,
}: {
  stages: LeadStageConfig[];
  onClose: () => void;
  onImported: (result: LeadImportResult) => void;
}) {
  const openStages = stages.filter((item) => item.kind === "open");
  const [file, setFile] = useState<LeadImportPreviewInput | null>(null);
  const [analysis, setAnalysis] = useState<LeadImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<(LeadImportField | null)[]>([]);
  const [source, setSource] = useState(LEAD_IMPORT_DEFAULT_SOURCE);
  const [stage, setStage] = useState(openStages[0]?.stage ?? "");
  const [result, setResult] = useState<LeadImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function selectFile(selected?: File) {
    setFile(null);
    setAnalysis(null);
    setResult(null);
    setMapping([]);
    setError("");
    if (!selected) return;
    setLoading(true);
    try {
      const input = {
        fileName: selected.name,
        contentBase64: await readFileAsBase64(selected),
      };
      let preview = await api.previewLeadImport(input);
      const signature = preview.columns.map((column) => column.title).join("|");
      let savedMapping: (LeadImportField | null)[] | undefined;
      try {
        const saved = JSON.parse(
          localStorage.getItem(mappingKey) ?? "null",
        ) as { signature: string; mapping: (LeadImportField | null)[] } | null;
        if (
          saved?.signature === signature &&
          Array.isArray(saved.mapping) &&
          saved.mapping.length === preview.columns.length &&
          saved.mapping.every(
            (field) =>
              field === null || Object.hasOwn(leadImportFieldLabels, field),
          )
        )
          savedMapping = saved.mapping;
      } catch {
        /* O armazenamento do navegador pode estar indisponível. */
      }
      if (savedMapping)
        preview = await api.previewLeadImport({
          ...input,
          mapping: savedMapping,
        });
      setFile(input);
      setMapping(preview.mapping);
      setAnalysis(preview);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function changeColumn(index: number, field: LeadImportField | null) {
    if (!file) return;
    // "Outros" pode ficar em várias colunas; os demais campos, em uma só.
    const next = mapping.map((current, position) =>
      position === index
        ? field
        : field && field !== EVENT_IMPORT_EXTRA_FIELD && current === field
          ? null
          : current,
    );
    setMapping(next);
    setAnalysis((current) =>
      current
        ? {
            ...current,
            errors: ["Atualize a prévia antes de importar."],
            totals: { valid: 0, error: 0 },
          }
        : null,
    );
    setLoading(true);
    setError("");
    try {
      setAnalysis(await api.previewLeadImport({ ...file, mapping: next }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!file || !analysis) return;
    setLoading(true);
    setError("");
    try {
      const imported = await api.importLeads({
        ...file,
        mapping,
        source,
        stage,
      });
      try {
        localStorage.setItem(
          mappingKey,
          JSON.stringify({
            signature: analysis.columns.map((column) => column.title).join("|"),
            mapping,
          }),
        );
      } catch {
        /* A importação não depende do armazenamento local. */
      }
      setResult(imported);
      setAnalysis(null);
      setFile(null);
      onImported(imported);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const warned =
    analysis?.rows.filter((row) => row.warnings?.length).length ?? 0;
  return (
    <Modal
      eyebrow="CRM comercial"
      title="Importar leads"
      subtitle="Os leads entram no funil com a origem e a etapa escolhidas."
      busy={loading}
      onClose={onClose}
    >
      <div className="patient-import">
        {error && <ErrorBanner error={error} />}
        {result && (
          <div className="success-banner" role="status">
            {`${result.created} lead(s) importado(s), ${result.warnings} com aviso de contato já cadastrado e ${result.errors} com erro.`}
          </div>
        )}
        <div className="patient-import-file">
          <div className="field-with-hint">
            <label htmlFor="lead-import-file">Planilha de leads</label>
            <input
              id="lead-import-file"
              type="file"
              accept=".csv,.xlsx"
              disabled={loading}
              aria-describedby="lead-import-hint"
              onChange={(e) => void selectFile(e.target.files?.[0])}
            />
            <span className="field-hint" id="lead-import-hint">
              Envie um arquivo .csv ou .xlsx de até 2 MB, com os títulos na
              primeira linha. Escolha o campo de cada coluna e confira a prévia.
              Nenhum campo é obrigatório. Quem já é cliente ou lead (mesmo
              telefone, e-mail ou CPF) é importado com aviso. Linhas vazias ou
              com dados apenas em colunas ignoradas não são importadas.
            </span>
          </div>
          <a className="text-link" href={template} download="modelo-leads.csv">
            <Download size={16} aria-hidden="true" />
            Baixar modelo CSV
          </a>
        </div>
        {!result && (
          <div className="form-grid">
            <CatalogSelect
              kind="lead_source"
              label="Origem"
              required
              value={source}
              onChange={setSource}
            />
            <label>
              Etapa do funil
              <select
                required
                value={stage}
                disabled={loading}
                onChange={(e) => setStage(e.target.value)}
              >
                {openStages.map((item) => (
                  <option key={item.stage} value={item.stage}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {analysis && analysis.columns.length > 0 && (
          <section
            className="patient-import-mapping"
            aria-labelledby="lead-import-mapping-title"
          >
            <div className="patient-import-mapping-head">
              <h3 id="lead-import-mapping-title">Colunas da planilha</h3>
              <span className="field-hint">
                Escolha o dado do sistema para cada coluna. “Não importar”
                ignora a coluna; “Outros” guarda o valor com o título da coluna.
                A coluna “Origem”, se escolhida, vale no lugar da origem acima.
              </span>
            </div>
            <div className="patient-import-mapping-list">
              {analysis.columns.map((column) => {
                const title = column.title || `Coluna ${column.index + 1}`;
                return (
                  <div
                    className="patient-import-mapping-row"
                    key={column.index}
                  >
                    <div className="patient-import-mapping-column">
                      <strong>{title}</strong>
                      <small>
                        {column.samples.length
                          ? `Ex.: ${column.samples.join(" · ")}`
                          : "Sem valores"}
                      </small>
                    </div>
                    <select
                      aria-label={`Dado do sistema para a ${withPrefix("coluna", title)}`}
                      value={mapping[column.index] ?? ""}
                      disabled={loading}
                      onChange={(e) =>
                        void changeColumn(
                          column.index,
                          (e.target.value || null) as LeadImportField | null,
                        )
                      }
                    >
                      <option value="">Não importar</option>
                      {Object.entries(leadImportFieldLabels).map(
                        ([field, label]) => (
                          <option key={field} value={field}>
                            {label}
                          </option>
                        ),
                      )}
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
                {analysis.totals.valid} válida(s)
              </span>
              {warned > 0 && (
                <span className="status-pill import-duplicate">
                  {warned} com aviso
                </span>
              )}
              <span className="status-pill import-error">
                {analysis.totals.error} com erro
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
                    <strong>{row.fullName || "Não informado"}</strong>
                    <span>{row.phone || "Não informado"}</span>
                    <span
                      className={`status-pill import-${row.status === "valid" && row.warnings?.length ? "duplicate" : row.status}`}
                    >
                      {row.status === "error"
                        ? "Erro"
                        : row.warnings?.length
                          ? "Aviso"
                          : "Válida"}
                    </span>
                    <small>
                      {row.errors.length
                        ? row.errors.join(" ")
                        : row.warnings?.length
                          ? `${row.warnings.join(" ")} Será importada.`
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
            disabled={loading}
            onClick={onClose}
          >
            {result ? "Fechar" : "Cancelar"}
          </button>
          {!result && (
            <button
              type="button"
              className="primary-button"
              disabled={
                loading ||
                !file ||
                source.trim().length < 2 ||
                !stage ||
                !analysis?.totals.valid ||
                analysis.errors.length > 0
              }
              onClick={() => void confirmImport()}
            >
              <FileDown size={18} aria-hidden="true" />
              Importar {analysis?.totals.valid ?? 0} lead(s)
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
