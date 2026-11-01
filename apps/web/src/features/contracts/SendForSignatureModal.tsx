import {
  documentContentFields,
  type DocumentPreview,
  type DocumentSignatureLinkShare,
  type DocumentTemplate,
  type IssuedDocument,
  type PatientOption,
  type PatientPlan,
  type Supplier,
} from "@crm/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { DocumentPaper } from "./DocumentPaper";
import { SignatureShare } from "./SignatureRequest";

type Signer = "patient" | "supplier";

/** Quem assina, no formato da API: cliente (com plano opcional) ou fornecedor. */
function signerFields(form: {
  signer: Signer;
  patientId: string;
  supplierId: string;
  planId: string;
}) {
  return form.signer === "supplier"
    ? { supplierId: form.supplierId }
    : {
        patientId: form.patientId,
        ...(form.planId ? { planId: form.planId } : {}),
      };
}

/**
 * Envia o contrato pelo WhatsApp com um link para o cliente (ou fornecedor) ler e assinar.
 * Sem `document`, primeiro escolhe quem assina, o modelo e o plano e emite o documento.
 */
export function SendForSignatureModal({
  document,
  templates,
  patients,
  plans,
  patientId,
  onSent,
  onClose,
}: {
  document?: IssuedDocument | null;
  templates: DocumentTemplate[];
  patients: PatientOption[];
  plans: PatientPlan[];
  patientId?: string | null;
  onSent: (document: IssuedDocument) => void;
  onClose: () => void;
}) {
  const { canView } = useAuthorization();
  const planHintId = useId();
  const contractTemplates = templates.filter(
    (template) => template.kind === "contract",
  );
  const choices = contractTemplates.length ? contractTemplates : templates;
  const [form, setForm] = useState({
    signer: "patient" as Signer,
    patientId: patientId ?? "",
    supplierId: "",
    templateId: choices.length === 1 ? choices[0]!.id : "",
    planId: "",
  });
  const forSupplier = form.signer === "supplier";
  const signerId = forSupplier ? form.supplierId : form.patientId;
  // Fornecedores ativos: carregados só quando o envio é para fornecedor.
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [suppliersError, setSuppliersError] = useState("");
  const loadSuppliers = forSupplier && suppliers === null;
  useEffect(() => {
    if (!loadSuppliers) return;
    let active = true;
    api
      .suppliers()
      .then(
        (items) => active && setSuppliers(items.filter((item) => item.active)),
      )
      .catch((cause: Error) => {
        if (!active) return;
        setSuppliers([]);
        setSuppliersError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [loadSuppliers]);

  const [preview, setPreview] = useState<{
    key: string;
    data?: DocumentPreview;
    error?: string;
  } | null>(null);
  const [share, setShare] = useState<DocumentSignatureLinkShare | null>(null);
  const [busy, setBusy] = useState(Boolean(document));
  const [error, setError] = useState("");
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  });

  // Documento já emitido: o link é gerado (ou reaproveitado) ao abrir.
  useEffect(() => {
    if (!document) return;
    let active = true;
    api
      .createDocumentSignatureLink(document.id)
      .then((result) => {
        if (!active) return;
        setShare(result);
        onSentRef.current(result.document);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [document]);

  const previewKey =
    signerId && form.templateId
      ? `${form.signer}:${signerId}:${form.templateId}:${form.planId}`
      : "";
  useEffect(() => {
    if (document || !previewKey) return;
    let active = true;
    api
      .previewDocument({
        ...signerFields(form),
        templateId: form.templateId,
        title: "Prévia do contrato",
      })
      .then((data) => active && setPreview({ key: previewKey, data }))
      .catch(
        (cause: Error) =>
          active && setPreview({ key: previewKey, error: cause.message }),
      );
    return () => {
      active = false;
    };
  }, [document, previewKey, form]);

  const currentPreview = preview?.key === previewKey ? preview : null;
  const manualFields = currentPreview?.data
    ? documentContentFields(currentPreview.data.snapshotContent)
    : [];
  const missing = useMissingFields(
    [
      !signerId && (forSupplier ? "Fornecedor" : "Cliente"),
      !form.templateId && "Modelo do contrato",
      manualFields.length > 0 &&
        "Modelo sem campos para preencher (use Novo documento)",
    ].filter((item): item is string => Boolean(item)),
    "field-hint",
  );
  const patientPlans = plans.filter(
    (plan) => plan.patientId === form.patientId,
  );

  async function send() {
    const template = choices.find((item) => item.id === form.templateId);
    if (!template || !signerId) return;
    setBusy(true);
    setError("");
    try {
      const draft = await api.createDocument({
        ...signerFields(form),
        templateId: template.id,
        title: template.name,
      });
      onSent(draft);
      const issued = await api.updateDocumentStatus(draft.id, "issued");
      onSent(issued);
      const result = await api.createDocumentSignatureLink(issued.id);
      onSent(result.document);
      setShare(result);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = share?.document.title ?? document?.title;
  return (
    <Modal
      eyebrow="Contratos"
      title="Enviar para assinatura"
      subtitle={
        title
          ? `${title} · ${share?.document.patientName ?? document?.patientName ?? ""}`
          : "Escolha quem assina e o modelo do contrato."
      }
      busy={busy}
      dirty={
        !share &&
        !document &&
        Boolean(form.patientId || form.supplierId || form.planId)
      }
      wide={!share && Boolean(currentPreview?.data)}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {share ? (
        <SignatureShare share={share} />
      ) : document ? (
        busy ? (
          <LoadingBlock />
        ) : (
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        )
      ) : (
        <form
          className="clinical-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <fieldset className="form-fields form-grid" disabled={busy}>
            <label className="span-2">
              Quem assina
              <select
                value={form.signer}
                onChange={(event) =>
                  setForm({
                    ...form,
                    signer: event.target.value as Signer,
                    planId: "",
                  })
                }
              >
                <option value="patient">Cliente</option>
                <option value="supplier">Fornecedor</option>
              </select>
            </label>
            {forSupplier ? (
              <div className="field-with-hint">
                <label>
                  Fornecedor
                  <select
                    required
                    disabled={!suppliers}
                    value={form.supplierId}
                    onChange={(event) =>
                      setForm({ ...form, supplierId: event.target.value })
                    }
                  >
                    <option value="">
                      {suppliers ? "Selecione" : "Carregando…"}
                    </option>
                    {suppliers?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {suppliersError && (
                  <small className="field-error">{suppliersError}</small>
                )}
              </div>
            ) : (
              <PatientPicker
                required
                patients={patients}
                value={form.patientId}
                onChange={(next) =>
                  setForm({ ...form, patientId: next, planId: "" })
                }
              />
            )}
            <label>
              Modelo do contrato
              <select
                required
                value={form.templateId}
                onChange={(event) =>
                  setForm({ ...form, templateId: event.target.value })
                }
              >
                <option value="">Selecione</option>
                {choices.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · v{template.version}
                  </option>
                ))}
              </select>
            </label>
            {!forSupplier && canView("plans") && (
              <div>
                <label>
                  Plano vinculado
                  <select
                    aria-describedby={planHintId}
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
            {previewKey && !currentPreview && (
              <div className="span-2">
                <LoadingBlock />
              </div>
            )}
            {currentPreview?.error && (
              <div className="span-2">
                <ErrorBanner error={currentPreview.error} />
              </div>
            )}
            {currentPreview?.data && (
              <div className="span-2">
                {currentPreview.data.missingFields.length > 0 && (
                  <p className="field-hint">
                    Sem dado no cadastro:{" "}
                    {currentPreview.data.missingFields
                      .map((field) => field.label)
                      .join(", ")}
                    .
                  </p>
                )}
                <details>
                  <summary>Conferir o contrato</summary>
                  <DocumentPaper
                    body={currentPreview.data.snapshotBody}
                    content={currentPreview.data.snapshotContent}
                    branding={currentPreview.data.branding}
                  />
                </details>
              </div>
            )}
            <p className="muted-copy span-2">
              O contrato é emitido com este modelo e{" "}
              {forSupplier ? "o fornecedor" : "o cliente"} recebe um link para
              ler e assinar. A visualização e a assinatura ficam registradas no
              documento.
            </p>
          </fieldset>
          {missing.hint}
          <div className="modal-actions">
            <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
            <button
              className="primary-button"
              disabled={busy || missing.blocked || !currentPreview?.data}
              aria-describedby={missing.describedBy}
            >
              Emitir e gerar link
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
