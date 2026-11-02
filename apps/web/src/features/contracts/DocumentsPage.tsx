import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import { DocumentDetailsModal } from "./DocumentDetailsModal";
import { SendForSignatureModal } from "./SendForSignatureModal";
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
  FilePen,
  FileText,
  Files,
  MessageCircle,
  Plus,
  Printer,
  Search,
  History,
  Trash2,
  X,
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
import {
  documentKindLabels,
  documentSituation,
  documentSituationLabels,
  documentSituationPills,
  emptyDocumentFilters,
  fetchContractsPageData,
  filterDocuments,
  type DocumentFilters,
  type DocumentSituation,
} from "./model";
import { shortDate } from "../../shared/lib/formatting";
import { DocumentPaper } from "./DocumentPaper";
import { DocumentWizard } from "./DocumentWizard";
import { DocumentPdfPreview } from "./DocumentPdfPreview";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { TemplateBodyEditor } from "./TemplateBodyEditor";
import { TemplateVersionModal } from "./TemplateVersionModal";
import { TemplateHistoryModal } from "./TemplateHistoryModal";
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

/** Data mais relevante do documento para a lista: cancelamento, emissão ou criação. */
function documentDateLabel(document: IssuedDocument) {
  const [label, iso] = document.cancelledAt
    ? ["Cancelado em", document.cancelledAt]
    : document.issuedAt
      ? ["Emitido em", document.issuedAt]
      : ["Criado em", document.createdAt];
  const date = new Date(iso ?? "");
  return Number.isNaN(date.getTime())
    ? ""
    : `${label} ${shortDate.format(date)}`;
}

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
  const [historyOf, setHistoryOf] = useState<DocumentTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] =
    useState<DocumentTemplate | null>(null);
  const [cancelling, setCancelling] = useState<IssuedDocument | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocumentFilters>(emptyDocumentFilters);
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
  const canDeleteTemplate = canManage && can("contracts.templates_delete");
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
  // Erro ao criar modelo: aparece junto do botão "Criar modelo", não no topo da página.
  const [templateError, setTemplateError] = useState("");
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
      // Rótulos explícitos: o editor também mostra "Nome do cliente", "Nome da clínica"…
      ["Nome do modelo", templateForm.name],
      ["Conteúdo do modelo", templateForm.body],
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
    setTemplateError("");
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
      void saveTemplate().catch((cause: Error) =>
        setTemplateError(cause.message),
      );
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

  async function templateRestored(
    template: DocumentTemplate,
    fromVersion: number,
  ) {
    setHistoryOf(null);
    setError("");
    setNotice(
      `Versão ${fromVersion} de “${template.name}” restaurada como versão ${template.version}.`,
    );
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
  const templateVersions = (template: DocumentTemplate) =>
    templates.filter(
      (item) =>
        item.name.toLocaleLowerCase() === template.name.toLocaleLowerCase(),
    );
  const visibleDocuments = documents.filter(
    (item) => !contextPatientId || item.patientId === contextPatientId,
  );
  const filteredDocuments = filterDocuments(visibleDocuments, filters);
  const filtersActive = Boolean(
    filters.search.trim() || filters.situation || filters.template,
  );
  const documentTemplateNames = [
    ...new Set(visibleDocuments.map((item) => item.templateName)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const detailsDocument = documents.find((item) => item.id === detailsId);
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
                  <span className="list-count">
                    {filtersActive
                      ? `${filteredDocuments.length} de ${visibleDocuments.length}`
                      : visibleDocuments.length}
                  </span>
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
                <>
                  <div className="list-toolbar documents-toolbar">
                    <label className="search-box">
                      <Search size={18} aria-hidden="true" />
                      <input
                        type="search"
                        aria-label="Buscar documentos"
                        placeholder="Buscar por cliente, título ou modelo"
                        value={filters.search}
                        onChange={(event) =>
                          setFilters({ ...filters, search: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Situação
                      <select
                        value={filters.situation}
                        onChange={(event) =>
                          setFilters({
                            ...filters,
                            situation: event.target
                              .value as DocumentFilters["situation"],
                          })
                        }
                      >
                        <option value="">Todas</option>
                        {(
                          Object.keys(
                            documentSituationLabels,
                          ) as DocumentSituation[]
                        ).map((key) => (
                          <option key={key} value={key}>
                            {documentSituationLabels[key]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Modelo
                      <select
                        value={filters.template}
                        onChange={(event) =>
                          setFilters({
                            ...filters,
                            template: event.target.value,
                          })
                        }
                      >
                        <option value="">Todos</option>
                        {documentTemplateNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {filtersActive && (
                      <button
                        type="button"
                        className="text-button button-sm"
                        onClick={() => setFilters(emptyDocumentFilters)}
                      >
                        <X size={15} aria-hidden="true" /> Limpar filtros
                      </button>
                    )}
                  </div>
                  {filteredDocuments.length === 0 ? (
                    <EmptyState
                      title="Nenhum documento encontrado"
                      copy="Ajuste a busca ou os filtros para ver outros documentos."
                    />
                  ) : (
                    <div className="issued-document-list">
                      {filteredDocuments.map((item) => {
                        const situation = documentSituation(item);
                        return (
                          <article key={item.id}>
                            <div className="document-summary">
                              <strong>{item.patientName}</strong>
                              <span>
                                {item.title}
                                {item.supplierId ? " (fornecedor)" : ""}
                                {item.templateName === item.title
                                  ? ` · v${item.templateVersion}`
                                  : ` · ${item.templateName} v${item.templateVersion}`}
                              </span>
                            </div>
                            <span className="document-date">
                              {documentDateLabel(item)}
                            </span>
                            <span
                              className={`status-pill ${documentSituationPills[situation]}`}
                            >
                              {documentSituationLabels[situation]}
                            </span>
                            <button
                              type="button"
                              className="secondary-button button-sm"
                              aria-label={`Ver detalhes de ${item.title} · ${item.patientName}`}
                              onClick={() => setDetailsId(item.id)}
                            >
                              Ver detalhes
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
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
                  <span className="list-count">{activeTemplates.length}</span>
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
              {activeTemplates.length === 0 ? (
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
                  {activeTemplates.map((template) => (
                    <article key={template.id}>
                      <div>
                        <strong>{template.name}</strong>
                        <span>
                          {documentKindLabels[template.kind]} · versão{" "}
                          {template.version}
                        </span>
                      </div>
                      <div className="template-actions">
                        <button
                          type="button"
                          className="secondary-button button-sm"
                          aria-label={`Histórico do modelo ${template.name}`}
                          onClick={() => setHistoryOf(template)}
                        >
                          <History size={15} aria-hidden="true" /> Histórico
                        </button>
                        {canManage && can("contracts.templates_version") && (
                          <button
                            className="secondary-button button-sm"
                            onClick={() => setVersioning(template)}
                          >
                            Nova versão
                          </button>
                        )}
                        {canDeleteTemplate && (
                          <button
                            type="button"
                            className="text-button button-sm"
                            aria-label={`Excluir modelo ${template.name}`}
                            onClick={() => setDeletingTemplate(template)}
                          >
                            <Trash2 size={15} aria-hidden="true" /> Excluir
                          </button>
                        )}
                      </div>
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
                      Nome do modelo
                      <input
                        required
                        value={templateForm.name}
                        disabled={creatingTemplate}
                        onChange={(event) => {
                          setTemplateError("");
                          setTemplateForm({
                            ...templateForm,
                            name: event.target.value,
                          });
                        }}
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
                  {templateError && (
                    <p className="form-error" role="alert">
                      {templateError}
                    </p>
                  )}
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
      {deletingTemplate && (
        <ActionModal
          eyebrow="Modelos"
          title="Excluir modelo"
          subtitle={`${deletingTemplate.name} · versão ${deletingTemplate.version}`}
          effect="O modelo e todas as versões anteriores saem da lista e não poderão mais ser usados em novos contratos. Os contratos já criados com ele continuam disponíveis."
          confirmLabel="Excluir modelo"
          danger
          onClose={() => setDeletingTemplate(null)}
          onConfirm={async () => {
            await api.deleteDocumentTemplate(deletingTemplate.id);
            const name = deletingTemplate.name.toLocaleLowerCase();
            setTemplates((current) =>
              current.filter((item) => item.name.toLocaleLowerCase() !== name),
            );
            setDeletingTemplate(null);
            setNotice(`Modelo “${deletingTemplate.name}” excluído.`);
          }}
        />
      )}
      {detailsDocument && (
        <DocumentDetailsModal
          document={detailsDocument}
          branding={branding}
          inactive={Boolean(
            preparing || sending || issuing || cancelling || printing,
          )}
          onChanged={replaceDocument}
          onReview={() => setPreparing({ document: detailsDocument })}
          onIssue={() => {
            setIssueReady(false);
            setIssuing(detailsDocument);
          }}
          onSend={() => setSending({ document: detailsDocument })}
          onPrint={(pdf) => setPrinting({ document: detailsDocument, pdf })}
          onCancel={() => setCancelling(detailsDocument)}
          onClose={() => setDetailsId(null)}
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
      {historyOf && (
        <TemplateHistoryModal
          versions={templateVersions(historyOf)}
          canRestore={canManage && can("contracts.templates_version")}
          onClose={() => setHistoryOf(null)}
          onRestored={(template, fromVersion) =>
            void templateRestored(template, fromVersion)
          }
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
