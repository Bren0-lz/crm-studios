import { useEffect, useId, useState, type FormEvent } from "react";
import type {
  ExternalOperation,
  ExternalOperationInput,
  FinancialWorkspace,
  PatientOption,
} from "@crm/contracts";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { PatientPicker } from "../../PatientPicker";
import {
  readFileBase64,
  downloadBase64File,
} from "../../shared/lib/file-content";
import { localIsoDate, shortDate, currency } from "../../shared/lib/formatting";
export function ExternalOperationsPanel({
  workspace,
}: {
  workspace: FinancialWorkspace;
}) {
  const { can } = useAuthorization(),
    patientId = usePatientContext(),
    [attempt, setAttempt] = useState(0),
    [items, setItems] = useState<ExternalOperation[] | null>(null),
    [patients, setPatients] = useState<PatientOption[]>([]),
    [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    proofHintId = useId();
  const empty = (): ExternalOperationInput => ({
    kind: "fiscal",
    counterpart: "",
    reference: "",
    occurredOn: localIsoDate(),
    ...(patientId ? { patientId } : {}),
    notes: "",
    fileName: "",
    mimeType: "application/pdf",
    sizeInBytes: 0,
    contentBase64: "",
  });
  const [form, setForm] = useState<ExternalOperationInput>(empty),
    [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const missing = useMissingFields(
    [
      form.counterpart.trim().length < 2 &&
        "Emissor ou parceiro (pelo menos 2 caracteres)",
      !form.reference.trim() && "Referência do documento ou operação",
      !form.occurredOn && "Data da operação externa",
      !form.contentBase64 && "Comprovante",
    ].filter((item): item is string => Boolean(item)),
  );
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.externalOperations(patientId || undefined),
      api.patientOptions(),
    ])
      .then(([records, options]) => {
        if (alive) {
          setItems(records);
          setPatients(options);
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [attempt, patientId]);
  const patch = (input: Partial<ExternalOperationInput>) =>
    setForm((current) => ({ ...current, ...input }));
  async function save() {
    setSaving(true);
    setError("");
    try {
      const created = await api.createExternalOperation(form);
      setItems((current) => [created, ...(current ?? [])]);
      setEditing(false);
      setNotice("Operação externa registrada com comprovante.");
    } finally {
      setSaving(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Registro de operação externa",
    dirty: editing && JSON.stringify(form) !== baseline,
    busy: saving,
    save,
    discard: () => {},
  });
  const close = () => prompt.confirmLeave(() => setEditing(false));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    if (
      file.size > 5242880 ||
      !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
    ) {
      setError("Use um comprovante PDF, PNG ou JPEG de até 5 MB.");
      return;
    }
    setSaving(true);
    try {
      patch({
        fileName: file.name,
        mimeType: file.type as ExternalOperationInput["mimeType"],
        sizeInBytes: file.size,
        contentBase64: await readFileBase64(file),
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function download(id: string) {
    setSaving(true);
    setError("");
    try {
      downloadBase64File(await api.externalOperationContent(id));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!can("finance.external_records_view")) return null;
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Documentos fiscais e operações com parceiros</h2>
          </div>
        </div>
        <div className="inventory-body">
          {error && <ErrorBanner error={error} />}
          {notice && <p role="status">{notice}</p>}
          <p>
            Registre operações realizadas externamente com referência e
            comprovante.
          </p>
          {can("finance.external_records_manage") && (
            <button
              className="primary-button"
              disabled={saving}
              onClick={() => {
                const next = empty();
                setForm(next);
                setBaseline(JSON.stringify(next));
                setError("");
                setEditing(true);
              }}
            >
              Registrar operação externa
            </button>
          )}
          {!items ? (
            error ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                Tentar carregar registros
              </button>
            ) : (
              <LoadingBlock />
            )
          ) : !items.length ? (
            <EmptyState
              title="Nenhuma operação externa registrada"
              copy="Os registros e comprovantes realizados pela equipe aparecem aqui."
            />
          ) : (
            items.map((item) => (
              <div className="table-row" key={item.id}>
                <div>
                  <strong>
                    {item.kind === "fiscal"
                      ? "Documento fiscal"
                      : "Operação com parceiro"}{" "}
                    · {item.reference}
                  </strong>
                  <p>
                    {item.counterpart} ·{" "}
                    {shortDate.format(new Date(item.occurredOn + "T12:00:00"))}
                    {item.patientName ? ` · ${item.patientName}` : ""}
                  </p>
                  <small>
                    Registrado por {item.authorName} em{" "}
                    {shortDate.format(new Date(item.createdAt))}
                  </small>
                  {item.notes && <p>{item.notes}</p>}
                </div>
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void download(item.id)}
                >
                  Baixar comprovante
                </button>
              </div>
            ))
          )}
        </div>
      </section>
      {editing && (
        <Modal
          title="Registrar operação externa"
          subtitle="Informe o que foi realizado externamente e anexe a cópia do comprovante."
          busy={saving || Boolean(prompt.modal)}
          inactive={Boolean(prompt.modal)}
          onClose={close}
        >
          <form className="form-grid" onSubmit={submit}>
            <fieldset
              className="form-fields form-grid span-2"
              disabled={saving}
            >
              {error && (
                <div className="span-2">
                  <ErrorBanner error={error} />
                </div>
              )}
              <label>
                Tipo de registro
                <select
                  value={form.kind}
                  onChange={(event) =>
                    patch({
                      kind: event.target
                        .value as ExternalOperationInput["kind"],
                    })
                  }
                >
                  <option value="fiscal">Documento fiscal</option>
                  <option value="partner">Operação com parceiro</option>
                </select>
              </label>
              <label>
                Data da operação externa
                <input
                  required
                  type="date"
                  value={form.occurredOn}
                  onChange={(event) =>
                    patch({ occurredOn: event.target.value })
                  }
                />
              </label>
              <label>
                Emissor ou parceiro
                <input
                  required
                  autoFocus
                  minLength={2}
                  maxLength={160}
                  placeholder={
                    form.kind === "fiscal"
                      ? "Quem emitiu o documento"
                      : "Nome do parceiro"
                  }
                  value={form.counterpart}
                  onChange={(event) =>
                    patch({ counterpart: event.target.value })
                  }
                />
              </label>
              <label>
                Referência do documento ou operação
                <input
                  required
                  maxLength={160}
                  placeholder={
                    form.kind === "fiscal"
                      ? "Número da nota ou do documento"
                      : "Código ou identificação da operação"
                  }
                  value={form.reference}
                  onChange={(event) => patch({ reference: event.target.value })}
                />
              </label>
              <div>
                <PatientPicker
                  patients={patients}
                  value={form.patientId ?? ""}
                  disabled={Boolean(patientId)}
                  onChange={(id) => {
                    const next = { ...form };
                    if (id) next.patientId = id;
                    else delete next.patientId;
                    delete next.receivableId;
                    setForm(next);
                  }}
                />
              </div>
              <label>
                Conta a receber vinculada
                <select
                  value={form.receivableId ?? ""}
                  onChange={(event) => {
                    const invoice = workspace.summary.receivables.find(
                        (item) => item.id === event.target.value,
                      ),
                      next = { ...form };
                    if (invoice) {
                      next.receivableId = invoice.id;
                      next.patientId = invoice.patientId;
                    } else delete next.receivableId;
                    setForm(next);
                  }}
                >
                  <option value="">Sem conta vinculada</option>
                  {workspace.summary.receivables
                    .filter(
                      (item) =>
                        !form.patientId || item.patientId === form.patientId,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.description} ·{" "}
                        {currency.format(item.amountInCents / 100)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="span-2 file-field">
                <label>
                  Comprovante
                  <input
                    required={!form.contentBase64}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    aria-describedby={proofHintId}
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                </label>
                <p className="field-hint" id={proofHintId}>
                  {form.fileName ? (
                    <>
                      Anexado: <strong>{form.fileName}</strong> ·{" "}
                      {Math.max(1, Math.round(form.sizeInBytes / 1024))} KB
                    </>
                  ) : (
                    "PDF, PNG ou JPEG de até 5 MB."
                  )}
                </p>
              </div>
              <label className="span-2">
                Observações do registro
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </label>
            </fieldset>
            {missing.hint}
            <div className="modal-actions span-2">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={close}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={saving || missing.blocked}
                aria-describedby={missing.describedBy}
              >
                Salvar registro manual
              </button>
            </div>
          </form>
        </Modal>
      )}
      {prompt.modal}
    </>
  );
}
