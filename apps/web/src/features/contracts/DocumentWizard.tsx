import {
  documentContentFromText,
  documentContentText,
  documentDraftInputSchema,
  issuedDocumentInputSchema,
  type ClinicBranding,
  type DocumentContent,
  type DocumentPreview,
  type DocumentTemplate,
  type IssuedDocument,
  type IssuedDocumentInput,
  type PatientOption,
  type PatientPlan,
  type Professional,
} from "@crm/contracts";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { ActionModal } from "../../shared/components/ActionModal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import {
  missingLabels,
  useMissingFields,
} from "../../shared/components/MissingFields";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { useToast } from "../../shared/feedback/toast-context";
import { RichDocumentEditor } from "./RichDocumentEditor";
import { DocumentPdfPreview } from "./DocumentPdfPreview";
import { DocumentPatientCpfNotice } from "./DocumentPatientCpfNotice";
import { professionalWithCrefito } from "./model";

export function DocumentWizard({
  templates,
  patients,
  plans,
  professionals,
  patientId,
  document,
  branding,
  onClose,
  onSaved,
}: {
  templates: DocumentTemplate[];
  patients: PatientOption[];
  plans: PatientPlan[];
  professionals: Professional[];
  patientId: string;
  document: IssuedDocument | null;
  branding: ClinicBranding | null;
  onClose: () => void;
  onSaved: (document: IssuedDocument) => void;
}) {
  const { can, canView } = useAuthorization();
  const toast = useToast();
  const [step, setStep] = useState(document ? 1 : 0);
  const planHintId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    stageRef.current?.focus();
  }, [step]);
  const [form, setForm] = useState({
    templateId: document?.templateId ?? templates[0]?.id ?? "",
    patientId: document?.patientId ?? patientId,
    planId: document?.planId ?? "",
    professionalId: document?.professionalId ?? "",
    title: document?.title ?? "Contrato de prestação de serviços",
  });
  const [content, setContent] = useState<DocumentContent | null>(
    document
      ? (document.snapshotContent ??
          documentContentFromText(document.snapshotBody))
      : null,
  );
  const [saved, setSaved] = useState(document);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [preparedFor, setPreparedFor] = useState("");
  const [preparedContent, setPreparedContent] = useState("");
  const [baseline, setBaseline] = useState(JSON.stringify({ form, content }));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const dirty = JSON.stringify({ form, content }) !== baseline;
  const missing = useMissingFields(
    missingLabels([
      ["Modelo ativo", form.templateId],
      ["Cliente", form.patientId],
      ["Título", form.title],
    ]),
    "field-hint",
  );
  const fingerprint = JSON.stringify({
    templateId: form.templateId,
    patientId: form.patientId,
    planId: form.planId,
    professionalId: form.professionalId,
  });
  function input(): IssuedDocumentInput {
    return {
      templateId: form.templateId,
      patientId: form.patientId,
      title: form.title,
      ...(form.planId ? { planId: form.planId } : {}),
      ...(form.professionalId ? { professionalId: form.professionalId } : {}),
    };
  }
  async function prepare(refresh = false) {
    if (busyRef.current) return;
    if (!refresh && preparedFor === fingerprint && content) {
      setStep(1);
      return;
    }
    if (!issuedDocumentInputSchema.safeParse(input()).success) {
      setError(
        "Escolha o modelo, o cliente e um título com pelo menos 3 caracteres.",
      );
      return;
    }
    const sequence = ++request.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api.previewDocument(input());
      if (request.current !== sequence) return;
      setPreview(next);
      setContent(next.snapshotContent);
      setPreparedContent(JSON.stringify(next.snapshotContent));
      setPreparedFor(fingerprint);
      setStep(1);
    } catch (cause) {
      if (request.current === sequence) setError((cause as Error).message);
    } finally {
      if (request.current === sequence) {
        setBusy(false);
        busyRef.current = false;
      }
    }
  }
  async function save() {
    if (busyRef.current) return;
    if (!content || (!saved && preparedFor !== fingerprint))
      throw new Error("Confira os dados e prepare o conteúdo antes de salvar.");
    const parsed = documentDraftInputSchema.safeParse({
      title: form.title,
      content,
    });
    if (!parsed.success)
      throw new Error(
        "Informe um título de 3 a 160 caracteres e um conteúdo de 20 a 20.000 caracteres.",
      );
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = saved
        ? await api.updateDocumentDraft(saved.id, parsed.data)
        : await api.createDocument({ ...input(), content });
      setSaved(result);
      setBaseline(JSON.stringify({ form, content }));
      onSaved(result);
      toast.success(
        saved
          ? "Rascunho atualizado."
          : "Rascunho criado. Confira o documento antes de emitir.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Contrato",
    dirty,
    busy,
    save,
    discard: () => setBaseline(JSON.stringify({ form, content })),
  });
  const patientPlans = plans.filter(
    (plan) => plan.patientId === form.patientId,
  );
  const cpfMissing =
    preview?.patientCpfMissing ?? saved?.patientCpfMissing ?? false;
  const firstStep = saved ? 1 : 0;
  function goBack(target: number) {
    if (busyRef.current) return;
    setError("");
    setStep(target);
  }
  function next() {
    if (step === 0) {
      if (
        content &&
        preparedFor !== fingerprint &&
        JSON.stringify(content) !== preparedContent
      )
        setReplace(true);
      else void prepare();
    } else {
      if (
        !content ||
        !documentDraftInputSchema.safeParse({ title: form.title, content })
          .success
      ) {
        setError(
          "Informe um título de 3 a 160 caracteres e um conteúdo de 20 a 20.000 caracteres.",
        );
        return;
      }
      setError("");
      setPdfReady(false);
      setStep(2);
    }
  }
  return (
    <>
      <Modal
        title={saved ? "Revisar rascunho" : "Novo documento"}
        subtitle="Prepare o conteúdo, confira o PDF e emita quando estiver pronto."
        eyebrow="Contratos"
        wide
        busy={busy}
        dirty={dirty}
        onClose={onClose}
        className="document-wizard"
      >
        <div
          className="document-wizard-body"
          ref={stageRef}
          tabIndex={-1}
          role="region"
          aria-label={`Etapa ${["Dados", "Conteúdo", "Revisão"][step]}`}
        >
          <ol className="document-steps" aria-label="Etapas do contrato">
            {["Dados", "Conteúdo", "Revisão"].map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
              >
                {index < step && index >= firstStep ? (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    aria-label={`Voltar para a etapa ${label}`}
                    onClick={() => goBack(index)}
                  >
                    <span>{index + 1}</span>
                    {label}
                  </button>
                ) : (
                  <>
                    <span>{index + 1}</span>
                    {label}
                  </>
                )}
              </li>
            ))}
          </ol>
          {error && <ErrorBanner error={error} />}
          {step === 0 && (
            <div className="form-grid">
              <label>
                Modelo ativo
                <select
                  required
                  disabled={busy || Boolean(saved)}
                  value={form.templateId}
                  onChange={(event) =>
                    setForm({ ...form, templateId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · v{template.version}
                    </option>
                  ))}
                </select>
              </label>
              <PatientPicker
                required
                disabled={busy}
                patients={patients}
                value={form.patientId}
                onChange={(patientId) =>
                  setForm({ ...form, patientId, planId: "" })
                }
              />
              {canView("plans") && (
                <div>
                  <label>
                    Plano vinculado
                    <select
                      aria-describedby={planHintId}
                      disabled={busy}
                      value={form.planId}
                      onChange={(event) =>
                        setForm({ ...form, planId: event.target.value })
                      }
                    >
                      <option value="">Sem plano</option>
                      {patientPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="field-hint" id={planHintId}>
                    Opcional. Preenche serviços, valor, parcelas e vigência.
                  </span>
                </div>
              )}
              <label>
                Profissional (opcional)
                <select
                  disabled={busy}
                  value={form.professionalId}
                  onChange={(event) =>
                    setForm({ ...form, professionalId: event.target.value })
                  }
                >
                  <option value="">Sem profissional</option>
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professionalWithCrefito(
                        professional.fullName,
                        professional.crefito,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                Título
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={form.title}
                  disabled={busy}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <div className="span-2">
                {missing.hint}
                {preview && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        content &&
                        JSON.stringify(content) !== preparedContent
                      )
                        setReplace(true);
                      else void prepare(true);
                    }}
                  >
                    Atualizar dados do cadastro
                  </button>
                )}
              </div>
            </div>
          )}
          {step > 0 && cpfMissing && (
            <>
              <DocumentPatientCpfNotice patientId={form.patientId} />
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  if (content && JSON.stringify(content) !== preparedContent)
                    setReplace(true);
                  else void prepare(true);
                }}
              >
                Atualizar dados do cadastro
              </button>
            </>
          )}
          {step > 0 &&
            preview &&
            !cpfMissing &&
            preview.missingFields.length > 0 && (
              <div className="document-data-notice" role="status">
                <strong>Confira os dados que faltam</strong>
                <p>
                  Complete o cadastro e use “Atualizar dados do cadastro” na
                  etapa Dados, ou ajuste o texto deste contrato.
                </p>
                <details>
                  <summary>
                    Ver campos sem preenchimento ({preview.missingFields.length}
                    )
                  </summary>
                  <ul>
                    {preview.missingFields.map((field) => (
                      <li key={field.key}>{field.label}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          {step === 1 && content && (
            <>
              {saved && (
                <p className="field-hint">
                  {saved.patientName} · {saved.templateName}. Os ajustes abaixo
                  alteram apenas este rascunho.
                </p>
              )}
              <label>
                Título
                <input
                  value={form.title}
                  minLength={3}
                  maxLength={160}
                  disabled={busy}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <RichDocumentEditor
                value={content}
                onChange={setContent}
                fields={false}
                disabled={busy}
              />
            </>
          )}
          {step === 2 && content && (
            <DocumentPdfPreview
              title={form.title}
              body={documentContentText(content)}
              content={content}
              branding={saved?.branding ?? preview?.branding ?? branding}
              onReady={setPdfReady}
            />
          )}
          <div className="modal-actions">
            <ModalCancelButton disabled={busy}>Fechar</ModalCancelButton>
            {step > firstStep && (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => goBack(step - 1)}
              >
                Voltar
              </button>
            )}
            {step < 2 ? (
              <button
                className="primary-button"
                type="button"
                disabled={busy || (step === 0 && missing.blocked)}
                aria-describedby={step === 0 ? missing.describedBy : undefined}
                onClick={next}
              >
                {busy
                  ? "Preparando…"
                  : step === 0
                    ? "Preparar conteúdo"
                    : "Conferir PDF"}
              </button>
            ) : (
              <>
                {(!saved || dirty) && (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy || !pdfReady}
                    onClick={() =>
                      void save().catch((cause: Error) =>
                        setError(cause.message),
                      )
                    }
                  >
                    {busy
                      ? "Salvando…"
                      : saved
                        ? "Salvar alterações"
                        : "Criar rascunho"}
                  </button>
                )}
                {saved && !dirty && can("contracts.status") && (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy || !pdfReady || cpfMissing}
                    onClick={() => setIssuing(true)}
                  >
                    Emitir
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
      {prompt.modal}
      {replace && (
        <ActionModal
          eyebrow="Contratos"
          title="Atualizar conteúdo?"
          subtitle="Os dados escolhidos mudaram."
          effect="O texto será preenchido novamente com os novos dados. Os ajustes feitos neste contrato serão substituídos."
          confirmLabel="Atualizar conteúdo"
          onClose={() => setReplace(false)}
          onConfirm={async () => {
            setReplace(false);
            await prepare(true);
          }}
        />
      )}
      {issuing && saved && (
        <ActionModal
          eyebrow="Contratos"
          title="Emitir contrato"
          subtitle={`${saved.title} · ${saved.patientName}`}
          effect="Depois de emitido, o texto do contrato não pode mais ser editado; ele fica disponível para impressão e assinatura."
          confirmLabel="Emitir contrato"
          onClose={() => setIssuing(false)}
          onConfirm={async () => {
            const result = await api.updateDocumentStatus(saved.id, "issued");
            onSaved(result);
            toast.success(`Contrato “${result.title}” emitido.`);
            onClose();
          }}
        />
      )}
    </>
  );
}
