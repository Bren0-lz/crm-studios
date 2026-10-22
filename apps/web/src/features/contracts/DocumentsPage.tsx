import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import { DocumentSignatureActions } from "./DocumentSignatureActions";
import type {
  DocumentKind,
  DocumentTemplate,
  DocumentTemplateInput,
  IssuedDocument,
  PatientOption,
  PatientPlan,
  Professional,
} from "@crm/contracts";
import { FileDown, MessageCircle, Printer } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Logo } from "../../shared/components/Logo";
import {
  missingLabels,
  useMissingFields,
} from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { ActionModal } from "../../shared/components/ActionModal";
import { CancelDocumentModal } from "./CancelDocumentModal";
import {
  documentKindLabels,
  fetchContractsPageData,
  issuedDocumentWhatsappLink,
  professionalWithCrefito,
} from "./model";
import { TemplateBodyEditor } from "./TemplateBodyEditor";
import { TemplateVersionModal } from "./TemplateVersionModal";
import { useToast } from "../../shared/feedback/toast-context";

const emptyTemplateForm: DocumentTemplateInput = {
  name: "",
  kind: "contract",
  body: "",
};

export function DocumentsPage() {
  const { can, canView, canEdit } = useAuthorization();
  const contextPatientId = usePatientContext();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [issuing, setIssuing] = useState<IssuedDocument | null>(null);
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [plans, setPlans] = useState<PatientPlan[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printing, setPrinting] = useState<{
    document: IssuedDocument;
    pdf: boolean;
  } | null>(null);
  // "Salvar PDF" abre a impressão do navegador assim que o documento está na tela.
  useEffect(() => {
    if (!printing?.pdf) return;
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
  }, [printing]);
  const [versioning, setVersioning] = useState<DocumentTemplate | null>(null);
  const [cancelling, setCancelling] = useState<IssuedDocument | null>(null);
  const canManage = canEdit("contracts");
  const [templateForm, setTemplateForm] =
    useState<DocumentTemplateInput>(emptyTemplateForm);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const toast = useToast();
  const [documentForm, setDocumentForm] = useState({
    templateId: "",
    patientId: contextPatientId,
    planId: "",
    professionalId: "",
    title: "Contrato de prestação de serviços",
  });
  // O que falta para criar o modelo e o documento (QM14).
  const templateMissing = useMissingFields(
    missingLabels([
      ["Nome", templateForm.name],
      ["Conteúdo", templateForm.body],
    ]),
    "field-hint",
  );
  const documentMissing = useMissingFields(
    missingLabels([
      ["Modelo ativo", documentForm.templateId],
      ["Cliente", documentForm.patientId],
      ["Título", documentForm.title],
    ]),
    "field-hint",
  );

  // Carga única da página: usada na abertura e depois de criar modelos ou documentos.
  // Só usa setters de estado (estáveis), por isso o useCallback não tem dependências.
  const applyPageData = useCallback(
    ([
      templateData,
      documentData,
      patientData,
      planData,
      professionalData,
    ]: Awaited<ReturnType<typeof fetchContractsPageData>>) => {
      setTemplates(templateData);
      setDocuments(documentData);
      setPatients(patientData);
      setPlans(planData);
      setProfessionals(
        professionalData.filter((item) => item.active !== false),
      );
      setDocumentForm((current) => ({
        ...current,
        templateId:
          current.templateId ||
          templateData.find((item) => item.active)?.id ||
          "",
        patientId: current.patientId,
      }));
    },
    [],
  );

  async function load() {
    applyPageData(await fetchContractsPageData(canView("plans")));
  }

  useEffect(() => {
    let active = true;
    fetchContractsPageData(canView("plans"))
      .then((data) => {
        if (active) applyPageData(data);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [applyPageData, canView]);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    if (creatingTemplate) return;
    setCreatingTemplate(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createDocumentTemplate(templateForm);
      // Limpa o formulário: um segundo clique não cria o mesmo modelo de novo.
      setTemplateForm(emptyTemplateForm);
      toast.success(`Modelo “${created.name}” criado com a versão 1.`);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function templateVersioned(template: DocumentTemplate) {
    setVersioning(null);
    setError("");
    setNotice(`Nova versão de “${template.name}” criada.`);
    try {
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function createDocument(event: FormEvent) {
    event.preventDefault();
    if (!documentForm.patientId) return;
    setError("");
    setNotice("");
    try {
      await api.createDocument({
        templateId: documentForm.templateId,
        patientId: documentForm.patientId,
        ...(documentForm.planId ? { planId: documentForm.planId } : {}),
        ...(documentForm.professionalId
          ? { professionalId: documentForm.professionalId }
          : {}),
        title: documentForm.title,
      });
      setNotice("Documento criado como rascunho com snapshot preservado.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function replaceDocument(updated: IssuedDocument) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === updated.id ? updated : document,
      ),
    );
  }

  const patientPlans = plans.filter(
    (plan) => plan.patientId === documentForm.patientId,
  );
  const activeTemplates = templates.filter((template) => template.active);
  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      <PageHeader
        title="Contratos"
        description="Emita contratos e documentos administrativos com conteúdo e versão preservados."
      />
      {!canManage && <ReadOnlyNotice module="contracts" />}
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="documents-layout">
          {canManage && (
            <>
              <section className="panel document-form-panel">
                <div className="panel-head">
                  <div>
                    <h2>Novo modelo</h2>
                  </div>
                </div>
                {can("contracts.templates_create") && (
                  <form className="document-form" onSubmit={createTemplate}>
                    <label>
                      Nome
                      <input
                        required
                        value={templateForm.name}
                        onChange={(event) =>
                          setTemplateForm({
                            ...templateForm,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        value={templateForm.kind}
                        onChange={(event) =>
                          setTemplateForm({
                            ...templateForm,
                            kind: event.target.value as DocumentKind,
                          })
                        }
                      >
                        {Object.entries(documentKindLabels).map(
                          ([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <TemplateBodyEditor
                      value={templateForm.body}
                      disabled={creatingTemplate}
                      onChange={(body) =>
                        setTemplateForm((current) => ({ ...current, body }))
                      }
                    />
                    {templateMissing.hint}
                    <div className="modal-actions">
                      <button
                        className="primary-button"
                        disabled={creatingTemplate || templateMissing.blocked}
                        aria-describedby={templateMissing.describedBy}
                      >
                        {creatingTemplate ? "Criando…" : "Criar modelo"}
                      </button>
                    </div>
                  </form>
                )}
              </section>
              <section className="panel document-form-panel">
                <div className="panel-head">
                  <div>
                    <h2>Novo documento</h2>
                  </div>
                </div>
                {can("contracts.issue") && (
                  <form className="document-form" onSubmit={createDocument}>
                    <label>
                      Modelo ativo
                      <select
                        required
                        value={documentForm.templateId}
                        onChange={(event) =>
                          setDocumentForm({
                            ...documentForm,
                            templateId: event.target.value,
                          })
                        }
                      >
                        <option value="">Selecione</option>
                        {activeTemplates.map((template) => (
                          <option value={template.id} key={template.id}>
                            {template.name} · v{template.version}
                          </option>
                        ))}
                      </select>
                    </label>
                    <PatientPicker
                      required
                      patients={patients}
                      value={documentForm.patientId}
                      onChange={(patientId) =>
                        setDocumentForm({
                          ...documentForm,
                          patientId,
                          planId: "",
                        })
                      }
                    />
                    <label>
                      Plano vinculado
                      <select
                        value={documentForm.planId}
                        onChange={(event) =>
                          setDocumentForm({
                            ...documentForm,
                            planId: event.target.value,
                          })
                        }
                      >
                        <option value="">Sem plano</option>
                        {patientPlans.map((plan) => (
                          <option value={plan.id} key={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Profissional (opcional)
                      <select
                        value={documentForm.professionalId}
                        onChange={(event) =>
                          setDocumentForm({
                            ...documentForm,
                            professionalId: event.target.value,
                          })
                        }
                      >
                        <option value="">Sem profissional</option>
                        {professionals.map((professional) => (
                          <option value={professional.id} key={professional.id}>
                            {professionalWithCrefito(
                              professional.fullName,
                              professional.crefito,
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Título
                      <input
                        required
                        value={documentForm.title}
                        onChange={(event) =>
                          setDocumentForm({
                            ...documentForm,
                            title: event.target.value,
                          })
                        }
                      />
                    </label>
                    {documentMissing.hint}
                    <div className="modal-actions">
                      <button
                        className="primary-button"
                        disabled={documentMissing.blocked}
                        aria-describedby={documentMissing.describedBy}
                      >
                        Criar rascunho
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </>
          )}
          <section className="panel template-library">
            <div className="panel-head">
              <div>
                <h2>Modelos cadastrados</h2>
              </div>
              <span className="list-count">{templates.length}</span>
            </div>
            {templates.length === 0 ? (
              <EmptyState
                title="Nenhum modelo"
                copy="Crie o primeiro modelo acima."
              />
            ) : (
              <div className="template-list">
                {templates.map((template) => (
                  <article key={template.id}>
                    <div>
                      <strong>{template.name}</strong>
                      <span>
                        {documentKindLabels[template.kind]} · versão{" "}
                        {template.version}
                      </span>
                    </div>
                    <span
                      className={`status-pill ${template.active ? "active" : "cancelled"}`}
                    >
                      {template.active ? "Ativa" : "Histórica"}
                    </span>
                    {canManage &&
                      template.active &&
                      can("contracts.templates_version") && (
                        <button
                          className="secondary-button button-sm"
                          onClick={() => setVersioning(template)}
                        >
                          Nova versão
                        </button>
                      )}
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="panel issued-documents">
            <div className="panel-head">
              <div>
                <h2>Emissões e rascunhos</h2>
              </div>
              <span className="list-count">{documents.length}</span>
            </div>
            {documents.length === 0 ? (
              <EmptyState
                title="Nenhum documento"
                copy="Crie um rascunho a partir de um modelo."
              />
            ) : (
              <div className="issued-document-list">
                {documents
                  .filter(
                    (item) =>
                      !contextPatientId || item.patientId === contextPatientId,
                  )
                  .map((item) => (
                    <article key={item.id}>
                      <div className="document-summary">
                        <strong>{item.title}</strong>
                        <span>
                          {item.patientName} · {item.templateName} v
                          {item.templateVersion}
                        </span>
                        <details>
                          <summary>Ver conteúdo preservado</summary>
                          <pre>{item.snapshotBody}</pre>
                        </details>
                      </div>
                      <span className={`status-pill ${item.status}`}>
                        {item.status === "draft"
                          ? "Rascunho"
                          : item.status === "issued"
                            ? "Emitido"
                            : "Cancelado"}
                      </span>
                      <DocumentSignatureActions
                        document={item}
                        onChanged={replaceDocument}
                      />
                      <div className="document-actions">
                        {item.status === "issued" && (
                          <>
                            <a
                              className="whatsapp-button button-sm"
                              href={issuedDocumentWhatsappLink(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <MessageCircle size={15} aria-hidden="true" />
                              WhatsApp
                            </a>
                            <button
                              className="secondary-button button-sm"
                              onClick={() =>
                                setPrinting({ document: item, pdf: true })
                              }
                            >
                              <FileDown size={15} /> Salvar PDF
                            </button>
                            <button
                              className="secondary-button button-sm"
                              onClick={() =>
                                setPrinting({ document: item, pdf: false })
                              }
                            >
                              <Printer size={15} /> Imprimir
                            </button>
                          </>
                        )}
                        {canManage &&
                          item.status === "draft" &&
                          can("contracts.status") && (
                            <button
                              className="primary-button button-sm"
                              onClick={() => setIssuing(item)}
                            >
                              Emitir
                            </button>
                          )}
                        {canManage &&
                          item.status !== "cancelled" &&
                          can("contracts.cancel") && (
                            <button
                              className="danger-button button-sm"
                              onClick={() => setCancelling(item)}
                            >
                              Cancelar
                            </button>
                          )}
                      </div>
                    </article>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
      {versioning && (
        <TemplateVersionModal
          template={versioning}
          onClose={() => setVersioning(null)}
          onCreated={() => void templateVersioned(versioning)}
        />
      )}
      {issuing && (
        <ActionModal
          eyebrow="Contratos"
          title="Emitir contrato"
          subtitle={`${issuing.title} · ${issuing.patientName}`}
          effect="Depois de emitido, o texto do contrato não pode mais ser editado; ele fica disponível para impressão e assinatura."
          confirmLabel="Emitir contrato"
          onClose={() => setIssuing(null)}
          onConfirm={async () => {
            replaceDocument(
              await api.updateDocumentStatus(issuing.id, "issued"),
            );
            setIssuing(null);
            toast.success(`Contrato “${issuing.title}” emitido.`);
          }}
        />
      )}
      {cancelling && (
        <CancelDocumentModal
          document={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(updated) => {
            replaceDocument(updated);
            setCancelling(null);
            toast.success(`Documento “${updated.title}” cancelado.`);
          }}
        />
      )}
      {printing && (
        <Modal
          title={printing.document.title}
          subtitle={printing.document.patientName}
          eyebrow="Documento emitido"
          onClose={() => setPrinting(null)}
        >
          <div className="receipt-content">
            {printing.pdf && (
              <p className="muted-copy print-hidden">
                Na janela de impressão, escolha “Salvar como PDF” como destino.
              </p>
            )}
            <Logo />
            <p className="document-print-body">
              {printing.document.snapshotBody}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPrinting(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Imprimir documento
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
