import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import { DocumentSignatureActions } from "./DocumentSignatureActions";
import { SendForSignatureModal } from "./SendForSignatureModal";
import { SignatureLinkRecord } from "./SignatureLinkRecord";
import {
  defaultContractTemplateBody,
  documentContentFromText,
  documentTemplateInputSchema,
  defaultContractTemplateName,
  type ClinicBranding,
  type DocumentKind,
  type DocumentTemplate,
  type DocumentTemplateInput,
  type IssuedDocument,
  type PatientOption,
  type PatientPlan,
  type Professional,
} from "@crm/contracts";
import {
  FileDown,
  FilePen,
  FileText,
  Files,
  MessageCircle,
  Plus,
  Printer,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  missingLabels,
  useMissingFields,
} from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { ActionModal } from "../../shared/components/ActionModal";
import { CancelDocumentModal } from "./CancelDocumentModal";
import { documentKindLabels, fetchContractsPageData } from "./model";
import { DocumentPaper } from "./DocumentPaper";
import { DocumentWizard } from "./DocumentWizard";
import { DocumentPdfPreview } from "./DocumentPdfPreview";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { TemplateBodyEditor } from "./TemplateBodyEditor";
import { TemplateVersionModal } from "./TemplateVersionModal";
import { useToast } from "../../shared/feedback/toast-context";

const emptyTemplateForm: DocumentTemplateInput = {
  name: "",
  kind: "contract",
  body: "",
  content: documentContentFromText(""),
};

/** O editor já abre com o contrato padrão (dados da empresa e cláusulas usuais). */
const defaultTemplateForm: DocumentTemplateInput = {
  name: defaultContractTemplateName,
  kind: "contract",
  body: defaultContractTemplateBody,
  content: documentContentFromText(defaultContractTemplateBody),
};

type ContractsTab = "documentos" | "modelos" | "criar-modelo";

export function DocumentsPage() {
  const { can, canView, canEdit } = useAuthorization();
  const contextPatientId = usePatientContext();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [issuing, setIssuing] = useState<IssuedDocument | null>(null);
  const [issueReady, setIssueReady] = useState(false);
  const [preparing, setPreparing] = useState<{
    document: IssuedDocument | null;
  } | null>(null);
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
  const [versioning, setVersioning] = useState<DocumentTemplate | null>(null);
  const [cancelling, setCancelling] = useState<IssuedDocument | null>(null);
  const [sending, setSending] = useState<{
    document: IssuedDocument | null;
  } | null>(null);
  const canManage = canEdit("contracts");
  const [templateForm, setTemplateForm] =
    useState<DocumentTemplateInput>(defaultTemplateForm);
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [activeTab, setActiveTab] = useState<ContractsTab>("documentos");
  const tabsId = useId();
  const canCreateTemplate = canManage && can("contracts.templates_create");
  // Enviar pelo WhatsApp emite o contrato e gera o link: exige emitir e alterar situação.
  const canSendForSignature =
    canManage && can("contracts.issue") && can("contracts.status");
  const tabs: Array<{ key: ContractsTab; label: string; icon: LucideIcon }> = [
    { key: "documentos", label: "Documentos", icon: FileText },
    { key: "modelos", label: "Modelos", icon: Files },
    ...(canCreateTemplate
      ? [{ key: "criar-modelo" as const, label: "Criar modelo", icon: FilePen }]
      : []),
  ];
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const creatingTemplateRef = useRef(false);
  const [templateBaseline, setTemplateBaseline] = useState(
    JSON.stringify(defaultTemplateForm),
  );
  const [replacingTemplate, setReplacingTemplate] =
    useState<DocumentTemplateInput | null>(null);
  const toast = useToast();
  // O que falta para criar o modelo e o documento (QM14).
  const templateMissing = useMissingFields(
    missingLabels([
      ["Nome", templateForm.name],
      ["Conteúdo", templateForm.body],
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

  // Logo, razão social e CNPJ para o cabeçalho da prévia e da impressão.
  useEffect(() => {
    let active = true;
    api
      .clinicBranding()
      .then((data) => active && setBranding(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function moveTabFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    templatePrompt.confirmLeave(() => setActiveTab(tabs[next]!.key));
    document.getElementById(`${tabsId}-${tabs[next]!.key}-tab`)?.focus();
  }

  function tabPanelProps(key: ContractsTab) {
    return {
      id: `${tabsId}-${key}-panel`,
      role: "tabpanel",
      "aria-labelledby": `${tabsId}-${key}-tab`,
      hidden: activeTab !== key,
    } as const;
  }

  async function saveTemplate() {
    if (creatingTemplateRef.current)
      throw new Error("Aguarde o salvamento em andamento.");
    const parsed = documentTemplateInputSchema.safeParse(templateForm);
    if (!parsed.success)
      throw new Error(
        "Informe um nome de 3 a 120 caracteres e conteúdo de 20 a 20.000 caracteres.",
      );
    creatingTemplateRef.current = true;
    setCreatingTemplate(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createDocumentTemplate(parsed.data);
      setTemplateForm(emptyTemplateForm);
      setTemplateBaseline(JSON.stringify(emptyTemplateForm));
      setTemplates((current) => [created, ...current]);
      toast.success(`Modelo “${created.name}” criado com a versão 1.`);
      setActiveTab("modelos");
    } finally {
      creatingTemplateRef.current = false;
      setCreatingTemplate(false);
    }
  }
  function createTemplate(event: FormEvent) {
    event.preventDefault();
    if (!creatingTemplateRef.current)
      void saveTemplate().catch((cause: Error) => setError(cause.message));
  }
  const templateDirty = JSON.stringify(templateForm) !== templateBaseline;
  const templatePrompt = useUnsavedChangesPrompt({
    section: "Modelo de contrato",
    dirty: templateDirty,
    busy: creatingTemplate,
    save: saveTemplate,
    discard: () => {
      setTemplateForm(JSON.parse(templateBaseline) as DocumentTemplateInput);
    },
  });
  function choosePreset(next: DocumentTemplateInput) {
    if (templateDirty) setReplacingTemplate(next);
    else setTemplateForm(next);
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

  function upsertDocument(updated: IssuedDocument) {
    setDocuments((current) =>
      current.some((item) => item.id === updated.id)
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...current],
    );
  }

  function replaceDocument(updated: IssuedDocument) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === updated.id ? updated : document,
      ),
    );
  }

  const activeTemplates = templates.filter((template) => template.active);
  const visibleDocuments = documents.filter(
    (item) => !contextPatientId || item.patientId === contextPatientId,
  );
  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      <PageHeader
        title="Contratos"
        description="Prepare contratos, confira o documento e emita para seus clientes."
      />
      {!canManage && <ReadOnlyNotice module="contracts" />}
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <div
            className="settings-tabs contracts-tabs"
            role="tablist"
            aria-label="Seções de contratos"
          >
            {tabs.map((tab, index) => (
              <button
                key={tab.key}
                id={`${tabsId}-${tab.key}-tab`}
                type="button"
                role="tab"
                className="text-button settings-tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`${tabsId}-${tab.key}-panel`}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() =>
                  templatePrompt.confirmLeave(() => setActiveTab(tab.key))
                }
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                <tab.icon size={18} aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>
          <div className="documents-layout" {...tabPanelProps("documentos")}>
            <section className="panel issued-documents">
              <div className="panel-head">
                <div>
                  <h2>Emissões e rascunhos</h2>
                </div>
                <div className="page-actions">
                  <span className="list-count">{visibleDocuments.length}</span>
                  {canSendForSignature && (
                    <button
                      type="button"
                      className="whatsapp-button"
                      disabled={!activeTemplates.length}
                      onClick={() => setSending({ document: null })}
                    >
                      <MessageCircle size={16} aria-hidden="true" />
                      Enviar pelo WhatsApp
                    </button>
                  )}
                  {canManage && can("contracts.issue") && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!activeTemplates.length}
                      onClick={() => setPreparing({ document: null })}
                    >
                      <Plus size={16} aria-hidden="true" />
                      Novo documento
                    </button>
                  )}
                </div>
              </div>
              {canManage &&
                can("contracts.issue") &&
                !activeTemplates.length && (
                  <div className="document-start-notice">
                    <p>
                      Para preparar um documento, você precisa de um modelo
                      ativo.
                    </p>
                    {canCreateTemplate ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          templatePrompt.confirmLeave(() =>
                            setActiveTab("criar-modelo"),
                          )
                        }
                      >
                        Criar primeiro modelo
                      </button>
                    ) : (
                      <p className="field-hint">
                        Peça à pessoa responsável pelos modelos para cadastrar
                        um.
                      </p>
                    )}
                  </div>
                )}
              {visibleDocuments.length === 0 ? (
                <EmptyState
                  title="Nenhum documento"
                  copy="Use Novo documento para escolher o cliente, ajustar o texto e conferir o PDF."
                />
              ) : (
                <div className="issued-document-list">
                  {visibleDocuments.map((item) => (
                    <article key={item.id}>
                      <div className="document-summary">
                        <strong>{item.title}</strong>
                        <span>
                          {item.patientName}
                          {item.supplierId ? " (fornecedor)" : ""} ·{" "}
                          {item.templateName} v{item.templateVersion}
                        </span>
                        <details>
                          <summary>Ver conteúdo</summary>
                          <DocumentPaper
                            body={item.snapshotBody}
                            content={item.snapshotContent}
                            branding={item.branding ?? branding}
                          />
                        </details>
                        <SignatureLinkRecord document={item} />
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
                        {canManage &&
                          item.status === "draft" &&
                          can("contracts.issue") && (
                            <button
                              className="secondary-button button-sm"
                              onClick={() => setPreparing({ document: item })}
                            >
                              Revisar rascunho
                            </button>
                          )}
                        {item.status === "issued" && (
                          <>
                            {canManage && can("contracts.status") && (
                              <button
                                type="button"
                                className="whatsapp-button button-sm"
                                onClick={() => setSending({ document: item })}
                              >
                                <MessageCircle size={15} aria-hidden="true" />
                                WhatsApp
                              </button>
                            )}
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
                              onClick={() => {
                                setIssueReady(false);
                                setIssuing(item);
                              }}
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
          <div className="documents-layout" {...tabPanelProps("modelos")}>
            <section className="panel template-library">
              <div className="panel-head">
                <div>
                  <h2>Modelos cadastrados</h2>
                </div>
                <div className="page-actions">
                  <span className="list-count">{templates.length}</span>
                  {canCreateTemplate && (
                    <button
                      type="button"
                      className="primary-button button-sm"
                      onClick={() =>
                        templatePrompt.confirmLeave(() =>
                          setActiveTab("criar-modelo"),
                        )
                      }
                    >
                      <Plus size={15} aria-hidden="true" /> Novo modelo
                    </button>
                  )}
                </div>
              </div>
              {templates.length === 0 ? (
                <EmptyState
                  title="Nenhum modelo"
                  copy={
                    canCreateTemplate
                      ? "Crie o primeiro modelo na aba Criar modelo — ela já abre com o contrato padrão."
                      : "Nenhum modelo foi criado ainda."
                  }
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
          </div>
          {canCreateTemplate && (
            <div {...tabPanelProps("criar-modelo")}>
              <section className="panel template-studio-panel">
                <div className="panel-head">
                  <div>
                    <h2>Novo modelo</h2>
                    <p className="panel-context">
                      Comece pelo contrato padrão, ajuste o texto e use Inserir
                      campo automático para os dados que mudam entre clientes.
                      Confira a apresentação na prévia.
                    </p>
                  </div>
                </div>
                <form
                  className="document-form template-studio-form"
                  onSubmit={createTemplate}
                >
                  <div className="template-studio-meta">
                    <label>
                      Nome
                      <input
                        required
                        value={templateForm.name}
                        disabled={creatingTemplate}
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
                        disabled={creatingTemplate}
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
                    <div className="template-studio-presets">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          creatingTemplate ||
                          templateForm.body === defaultContractTemplateBody
                        }
                        onClick={() =>
                          choosePreset({
                            ...defaultTemplateForm,
                            name: templateForm.name || defaultTemplateForm.name,
                          })
                        }
                      >
                        Usar contrato padrão
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          creatingTemplate ||
                          (!templateForm.name && !templateForm.body)
                        }
                        onClick={() => choosePreset(emptyTemplateForm)}
                      >
                        Começar em branco
                      </button>
                    </div>
                  </div>
                  <TemplateBodyEditor
                    studio
                    rows={28}
                    value={templateForm.body}
                    content={templateForm.content}
                    disabled={creatingTemplate}
                    branding={branding}
                    onChange={(body, content) =>
                      setTemplateForm((current) => ({
                        ...current,
                        body,
                        content,
                      }))
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
              </section>
            </div>
          )}
        </>
      )}
      {templatePrompt.modal}
      {replacingTemplate && (
        <ActionModal
          eyebrow="Modelos"
          title="Substituir conteúdo?"
          subtitle="Você tem alterações neste modelo."
          effect="O conteúdo atual será substituído pela opção escolhida."
          confirmLabel="Substituir conteúdo"
          onClose={() => setReplacingTemplate(null)}
          onConfirm={async () => {
            setTemplateForm(replacingTemplate);
            setReplacingTemplate(null);
          }}
        />
      )}
      {preparing && (
        <DocumentWizard
          templates={activeTemplates}
          patients={patients}
          plans={plans}
          professionals={professionals}
          patientId={contextPatientId}
          document={preparing.document}
          branding={branding}
          onClose={() => setPreparing(null)}
          onSaved={upsertDocument}
        />
      )}
      {sending && (
        <SendForSignatureModal
          document={sending.document}
          templates={activeTemplates}
          patients={patients}
          plans={plans}
          patientId={contextPatientId}
          onSent={upsertDocument}
          onClose={() => setSending(null)}
        />
      )}
      {versioning && (
        <TemplateVersionModal
          template={versioning}
          branding={branding}
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
          missing={issueReady ? [] : ["Prévia do PDF"]}
          onClose={() => setIssuing(null)}
          onConfirm={async () => {
            replaceDocument(
              await api.updateDocumentStatus(issuing.id, "issued"),
            );
            setIssuing(null);
            toast.success(`Contrato “${issuing.title}” emitido.`);
          }}
        >
          <div className="span-2">
            <DocumentPdfPreview
              title={issuing.title}
              body={issuing.snapshotBody}
              content={issuing.snapshotContent}
              branding={issuing.branding ?? branding}
              onReady={setIssueReady}
            />
          </div>
        </ActionModal>
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
          wide
        >
          <div className="receipt-content">
            {printing.pdf ? (
              <DocumentPdfPreview
                title={printing.document.title}
                body={printing.document.snapshotBody}
                content={printing.document.snapshotContent}
                branding={printing.document.branding ?? branding}
                download
              />
            ) : (
              <DocumentPaper
                body={printing.document.snapshotBody}
                content={printing.document.snapshotContent}
                branding={printing.document.branding ?? branding}
              />
            )}
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
                hidden={printing.pdf}
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
