import { withPrefix } from "@crm/contracts";
import { CommercialToolbar } from "./CommercialToolbar";
import {
  type Lead,
  type LeadContact,
  type LeadFilter,
  type LeadFilterOptions,
  type LeadInsights,
  type LeadStage,
  leadStageColor,
  type LeadStageConfig,
  type LeadStagesInput,
  resolveLeadStages,
  type LeadStagePage,
  inferLeadContactChannel,
  leadContactChannelLabels,
} from "@crm/contracts";
import { FileDown, GripVertical, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import {
  shortDate,
  shortDateTime,
  timeLabel,
  visitTypeLabels,
} from "../../shared/lib/formatting";
import { stageColorStyle } from "../../tag-colors";
import { leadStages } from "../relationship/index";
import { LeadActivityModal } from "./LeadActivityModal";
import { LeadAppointmentModal } from "./LeadAppointmentModal";
import { LeadCard } from "./LeadCard";
import { LeadAnalysisModal } from "./LeadAnalysisModal";
import { LeadConvertModal } from "./LeadConvertModal";
import { LeadDetailsModal } from "./LeadDetailsModal";
import { LeadFiltersModal } from "./LeadFiltersModal";
import { LeadImportModal } from "./LeadImportModal";
import { LeadLostModal } from "./LeadLostModal";
import { LeadModal } from "./LeadModal";
import { LeadStageModal } from "./LeadStageModal";
import { useBoardReorder } from "./useBoardReorder";
import { useToast } from "../../shared/feedback/toast-context";
import { TrashButton } from "../trash";
import { PatientModal } from "../patients/index";
import { usePatientTags } from "../../shared/hooks/usePatientTags";

type Columns = Record<LeadStage, LeadStagePage>;

const defaultStages = resolveLeadStages([]);

const emptyOptions: LeadFilterOptions = {
  sources: [],
  interests: [],
  contactMethods: [],
  lostReasons: [],
  responsibles: [],
};
/** Espera da digitação na busca antes de consultar o funil de novo. */
const FILTER_DEBOUNCE_MS = 300;

/** Tira o lead da coluna em que estava e o põe no topo da etapa atual, ajustando os totais. */
function placeLead(columns: Columns, lead: Lead): Columns {
  const next: Columns = {};
  for (const [stage, column] of Object.entries(columns) as Array<
    [LeadStage, LeadStagePage]
  >) {
    const previous = column.leads.find((item) => item.id === lead.id);
    next[stage] = previous
      ? {
          ...column,
          total: Math.max(0, column.total - 1),
          overdue: Math.max(
            0,
            column.overdue - (previous.overdueTasks > 0 ? 1 : 0),
          ),
          leads: column.leads.filter((item) => item.id !== lead.id),
        }
      : column;
  }
  const target = next[lead.stage] ?? {
    stage: lead.stage,
    total: 0,
    overdue: 0,
    leads: [],
  };
  next[lead.stage] = {
    ...target,
    total: target.total + 1,
    overdue: target.overdue + (lead.overdueTasks > 0 ? 1 : 0),
    leads: [lead, ...target.leads],
  };
  return next;
}

export function CommercialPage() {
  const { can, canEdit, user } = useAuthorization();
  const [columns, setColumns] = useState<Columns>({});
  const [insights, setInsights] = useState<LeadInsights | null>(null);
  const [options, setOptions] = useState<LeadFilterOptions>(emptyOptions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingStage, setLoadingStage] = useState<LeadStage | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [leadContacts, setLeadContacts] = useState<
    Record<string, LeadContact[]>
  >({});
  const [trialLead, setTrialLead] = useState<Lead | null>(null);
  const [notice, setNotice] = useState("");
  const [losingLead, setLosingLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [filter, setFilter] = useState<LeadFilter>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  // Esconde a coluna Perdidos no quadro (só na tela; não muda a consulta).
  const [hideLost, setHideLost] = useState(false);
  // Funil da clínica (etapas, nomes e etapa final); até carregar (ou se falhar), o padrão.
  const [stageConfig, setStageConfig] =
    useState<LeadStageConfig[]>(defaultStages);
  // Etapa em edição pelo lápis da coluna, ou "new" para incluir uma etapa.
  const [stageForm, setStageForm] = useState<LeadStageConfig | "new" | null>(
    null,
  );
  const stages = stageConfig.map((item) => ({
    value: item.stage,
    label: item.label,
    color: leadStageColor(item),
    hint:
      leadStages.find((stage) => stage.value === item.stage)?.hint ??
      "Mova para cá os leads que estão nesta etapa.",
  }));
  const stageLabel = (stage: LeadStage) =>
    stages.find((item) => item.value === stage)?.label ?? stage;
  const canManage = canEdit("crm");
  const toast = useToast();
  // Reordenar o funil arrastando a coluna pelo cabeçalho (desktop). O lead muda de etapa só
  // pelo seletor do cartão; no celular, a posição da etapa fica no modal "Editar etapa".
  const canReorder = can("crm.stages_manage");
  const [draggingStage, setDraggingStage] = useState<LeadStage | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const {
    boardRef,
    reordering,
    capture: captureBoard,
  } = useBoardReorder(stageConfig);
  // Só a resposta da consulta mais recente vale (filtros mudando rápido).
  const requestId = useRef(0);
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const loadBoard = useCallback(async (current: LeadFilter) => {
    const id = ++requestId.current;
    try {
      const [board, summary] = await Promise.all([
        api.leadBoard(current),
        api.leadInsights(current),
      ]);
      if (id !== requestId.current) return;
      setColumns(
        Object.fromEntries(
          board.columns.map((column) => [column.stage, column]),
        ),
      );
      setInsights(summary);
      setError("");
    } catch (cause) {
      if (id === requestId.current) setError((cause as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  const refreshInsights = useCallback(() => {
    api
      .leadInsights(filterRef.current)
      .then(setInsights)
      .catch(() => {});
  }, []);
  const refreshOptions = useCallback(() => {
    api
      .leadFilterOptions()
      .then(setOptions)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshOptions();
  }, [refreshOptions]);
  useEffect(() => {
    api
      .leadStages()
      .then((list) => {
        if (Array.isArray(list) && list.length) setStageConfig(list);
      })
      .catch(() => {});
  }, []);
  const firstLoad = useRef(true);
  useEffect(() => {
    const delay = firstLoad.current ? 0 : FILTER_DEBOUNCE_MS;
    firstLoad.current = false;
    const timer = setTimeout(() => void loadBoard(filter), delay);
    return () => clearTimeout(timer);
  }, [filter, loadBoard]);
  // Invalida respostas pendentes ao sair da página.
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  function replaceLead(lead: Lead) {
    setColumns((current) => placeLead(current, lead));
    setViewingLead((current) => (current?.id === lead.id ? lead : current));
    refreshInsights();
  }
  function rememberContact(leadId: string, contact: LeadContact) {
    setLeadContacts((current) => {
      const existing = current[leadId] ?? [];
      return {
        ...current,
        [leadId]: [
          contact,
          ...existing.filter((item) => item.id !== contact.id),
        ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      };
    });
  }
  async function loadMore(stage: LeadStage) {
    const column = columns[stage];
    if (!column) return;
    setLoadingStage(stage);
    try {
      const page = await api.leadStagePage(
        stage,
        filterRef.current,
        column.leads.length,
      );
      setColumns((current) => {
        const existing = current[stage] ?? column;
        const known = new Set(existing.leads.map((lead) => lead.id));
        return {
          ...current,
          [stage]: {
            ...existing,
            total: page.total,
            leads: [
              ...existing.leads,
              ...page.leads.filter((lead) => !known.has(lead.id)),
            ],
          },
        };
      });
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setLoadingStage(null);
    }
  }
  async function move(lead: Lead, stage: LeadStage) {
    if (stage === "won") return;
    // Perda pede o motivo num modal próprio; o seletor só muda depois de confirmar.
    if (stage === "lost") {
      setLosingLead(lead);
      return;
    }
    setError("");
    try {
      replaceLead(await api.moveLead(lead.id, stage));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  /** Solta a etapa arrastada no lugar da coluna de destino e salva a nova ordem. */
  async function dropStage(target: LeadStage) {
    const source = draggingStage;
    setDraggingStage(null);
    setOverStage(null);
    if (!source || source === target) return;
    const previous = stageConfig;
    const next = [...previous];
    const from = next.findIndex((item) => item.stage === source);
    const to = next.findIndex((item) => item.stage === target);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, ...next.splice(from, 1));
    captureBoard();
    setStageConfig(next);
    setSavingOrder(true);
    try {
      setStageConfig(
        await api.saveLeadStages(
          next.map(({ stage, label, color }) => ({
            stage,
            label,
            ...(color ? { color } : {}),
          })),
        ),
      );
    } catch (cause) {
      captureBoard();
      setStageConfig(previous);
      toast.error((cause as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }
  async function saveStages(
    next: LeadStagesInput["stages"],
    action: "saved" | "removed",
  ) {
    const saved = await api.saveLeadStages(next);
    // A posição pode ter mudado pelo modal: mesma animação, sem pulo na rolagem.
    captureBoard();
    setStageConfig(saved);
    setStageForm(null);
    toast.success(
      action === "removed" ? "Etapa removida do funil." : "Funil atualizado.",
    );
    // A etapa final pode ter mudado de coluna: recarrega o quadro com as etapas novas.
    void loadBoard(filterRef.current);
  }
  /** Botão do cartão: grava o envio da mensagem com a data e a hora de agora. */
  async function markMessageSent(lead: Lead) {
    const method =
      lead.contactMethod?.trim() || leadContactChannelLabels.whatsapp;
    setSendingLeadId(lead.id);
    try {
      const contact = await api.createLeadContact(lead.id, {
        channel: inferLeadContactChannel(method),
        contactMethod: method,
        direction: "outbound",
        notes: "Mensagem enviada.",
      });
      rememberContact(lead.id, contact);
      toast.success(
        `Mensagem para ${lead.fullName} registrada em ${shortDateTime(contact.occurredAt)}.`,
      );
      replaceLead({
        ...lead,
        lastContactAt: contact.occurredAt,
        lastMessageSentAt: contact.occurredAt,
        contactCount: (lead.contactCount ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setSendingLeadId(null);
    }
  }
  async function markLost(lead: Lead, reason: string) {
    replaceLead(await api.moveLead(lead.id, "lost", reason));
    setLosingLead(null);
  }
  // LC1: a conversão usa o cadastro completo de cliente (plano, experimental, produtos…).
  const configuredTags = usePatientTags();
  function converted(lead: Lead, converted: Lead | undefined, notice: string) {
    replaceLead(converted ?? { ...lead, stage: "won" });
    setConvertingLead(null);
    toast.success(notice);
  }
  const totalLeads = Object.values(columns).reduce(
    (sum, column) => sum + column.total,
    0,
  );
  const filtering = Object.keys(filter).length > 0;
  const permissions = {
    manage: canManage,
    stage: can("crm.stage"),
    update: can("crm.update"),
    convert: can("crm.convert", "patients.create"),
    schedule: can("crm.appointments_create", "agenda.create"),
    contact: can("crm.contacts_create"),
  };
  return (
    <>
      <PageHeader
        title="CRM comercial"
        description="Acompanhe cada oportunidade desde o primeiro contato até a conversão."
        action={
          can("crm.stages_manage") ||
          (canManage && can("crm.create")) ||
          can("trash.view") ? (
            <div className="page-actions">
              <TrashButton
                kind="leads"
                onChanged={() => void loadBoard(filterRef.current)}
              />
              {can("crm.stages_manage") && (
                <button
                  className="secondary-button"
                  onClick={() => setStageForm("new")}
                >
                  <Plus size={18} />
                  Adicionar etapa
                </button>
              )}
              {canManage && can("crm.create") && (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => setImportOpen(true)}
                  >
                    <FileDown size={18} aria-hidden="true" />
                    Importar leads
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setModalOpen(true)}
                  >
                    <Plus size={18} />
                    Novo lead
                  </button>
                </>
              )}
            </div>
          ) : undefined
        }
      />
      {!canManage && <ReadOnlyNotice module="crm" />}
      {error && <ErrorBanner error={error} />}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <CommercialToolbar
            filter={filter}
            search={filter.search ?? ""}
            options={options}
            insights={insights}
            {...(user ? { userId: user.id } : {})}
            hideLost={hideLost}
            stages={stages}
            onSearch={(value) =>
              setFilter((current) => {
                const next = { ...current };
                if (value) next.search = value;
                else delete next.search;
                return next;
              })
            }
            onChange={setFilter}
            onOpenFilters={() => setFiltersOpen(true)}
            onOpenAnalysis={() => setAnalysisOpen(true)}
            onToggleLost={() => setHideLost((current) => !current)}
          />
          {totalLeads === 0 ? (
            !error && (
              <section className="panel">
                <EmptyState
                  title={
                    filtering
                      ? "Nenhum lead no filtro"
                      : "Nenhum lead cadastrado"
                  }
                  copy={
                    filtering
                      ? "Ajuste ou limpe os filtros do funil para ver outros leads."
                      : canManage
                        ? "Cadastre o primeiro interessado para acompanhar o contato até a conversão."
                        : "Os leads cadastrados pela equipe aparecem aqui."
                  }
                  action={
                    canManage && !filtering
                      ? can("crm.create") && (
                          <button
                            className="primary-button"
                            onClick={() => setModalOpen(true)}
                          >
                            <Plus size={18} />
                            Cadastrar primeiro lead
                          </button>
                        )
                      : undefined
                  }
                />
              </section>
            )
          ) : (
            <div
              ref={boardRef}
              className={`kanban-board${reordering ? " reordering" : ""}`}
            >
              {stages
                .filter((stage) => !hideLost || stage.value !== "lost")
                .map((stage) => {
                  const column = columns[stage.value] ?? {
                    stage: stage.value,
                    total: 0,
                    overdue: 0,
                    leads: [],
                  };
                  const remaining = column.total - column.leads.length;
                  return (
                    <section
                      className={`kanban-column${overStage === stage.value ? " drag-over" : ""}${draggingStage === stage.value ? " dragging" : ""}`}
                      key={stage.value}
                      data-stage={stage.value}
                      aria-label={stage.label}
                      style={stageColorStyle(stage.color)}
                      onDragOver={(event) => {
                        if (!draggingStage || draggingStage === stage.value)
                          return;
                        event.preventDefault();
                        if (event.dataTransfer)
                          event.dataTransfer.dropEffect = "move";
                        if (overStage !== stage.value)
                          setOverStage(stage.value);
                      }}
                      onDragLeave={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        )
                          setOverStage((current) =>
                            current === stage.value ? null : current,
                          );
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void dropStage(stage.value);
                      }}
                    >
                      <header
                        draggable={canReorder && !savingOrder}
                        title={
                          canReorder
                            ? "Arraste para mudar a posição da etapa"
                            : undefined
                        }
                        onDragStart={(event) => {
                          if (event.dataTransfer) {
                            event.dataTransfer.setData(
                              "text/plain",
                              stage.value,
                            );
                            event.dataTransfer.effectAllowed = "move";
                            // A imagem arrastada é a coluna inteira, não só o cabeçalho.
                            const column = event.currentTarget.parentElement;
                            if (column && event.dataTransfer.setDragImage)
                              event.dataTransfer.setDragImage(column, 24, 16);
                          }
                          setDraggingStage(stage.value);
                        }}
                        onDragEnd={() => {
                          setDraggingStage(null);
                          setOverStage(null);
                        }}
                      >
                        {canReorder && (
                          <GripVertical
                            className="kanban-stage-grip"
                            size={14}
                            aria-hidden="true"
                          />
                        )}
                        <i className="kanban-stage-dot" aria-hidden="true" />
                        <strong>{stage.label}</strong>
                        {can("crm.stages_manage") && (
                          <button
                            type="button"
                            className="icon-button button-sm kanban-stage-edit"
                            aria-label={`Editar ${withPrefix("etapa", stage.label)}`}
                            title="Editar etapa"
                            onClick={() =>
                              setStageForm(
                                stageConfig.find(
                                  (item) => item.stage === stage.value,
                                ) ?? null,
                              )
                            }
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                        )}
                        <span>{column.total}</span>
                      </header>
                      {column.overdue > 0 && (
                        <p className="kanban-column-alert">
                          {column.overdue} com tarefa atrasada
                        </p>
                      )}
                      <div className="kanban-column-list">
                        {column.leads.length === 0 && (
                          <p className="kanban-empty-hint">{stage.hint}</p>
                        )}
                        {column.leads.map((lead) => (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            contacts={leadContacts[lead.id]}
                            permissions={permissions}
                            stages={stages}
                            onMove={(next) => void move(lead, next)}
                            onOpen={() => setViewingLead(lead)}
                            onActivity={() => setActivityLead(lead)}
                            onEdit={() => setEditingLead(lead)}
                            onConvert={() => setConvertingLead(lead)}
                            onSchedule={() => {
                              setNotice("");
                              setTrialLead(lead);
                            }}
                            onMessageSent={() => void markMessageSent(lead)}
                            sendingMessage={sendingLeadId === lead.id}
                          />
                        ))}
                        {remaining > 0 && (
                          <button
                            className="secondary-button button-sm kanban-load-more"
                            disabled={loadingStage === stage.value}
                            onClick={() => void loadMore(stage.value)}
                          >
                            {loadingStage === stage.value
                              ? "Carregando..."
                              : `Carregar mais (${remaining})`}
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })}
            </div>
          )}
        </>
      )}
      {stageForm && (
        <LeadStageModal
          stages={stageConfig}
          {...(stageForm === "new" ? {} : { editing: stageForm })}
          onClose={() => setStageForm(null)}
          onSave={(next, action) => saveStages(next, action)}
        />
      )}
      {filtersOpen && (
        <LeadFiltersModal
          filter={filter}
          options={options}
          stages={stages}
          onApply={(next) => {
            setFilter(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
      {analysisOpen && insights && (
        <LeadAnalysisModal
          insights={insights}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
      {viewingLead && (
        <LeadDetailsModal
          lead={viewingLead}
          contacts={leadContacts[viewingLead.id]}
          stageLabel={stageLabel(viewingLead.stage)}
          canEdit={permissions.update}
          onClose={() => setViewingLead(null)}
          onEdit={() => {
            setEditingLead(viewingLead);
            setViewingLead(null);
          }}
        />
      )}
      {editingLead && (
        <LeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onTrashed={(lead) => {
            toast.success(`Lead ${lead.fullName} foi para a lixeira.`);
            setEditingLead(null);
            void loadBoard(filterRef.current);
          }}
          onCreated={(lead) => {
            toast.success(`Lead ${lead.fullName} atualizado.`);
            replaceLead(lead);
            refreshOptions();
            setEditingLead(null);
          }}
        />
      )}
      {modalOpen && (
        <LeadModal
          onClose={() => setModalOpen(false)}
          onCreated={(lead) => {
            toast.success(`Lead ${lead.fullName} cadastrado.`);
            replaceLead(lead);
            refreshOptions();
            setModalOpen(false);
          }}
        />
      )}
      {importOpen && canManage && can("crm.create") && (
        <LeadImportModal
          stages={stageConfig}
          onClose={() => setImportOpen(false)}
          onImported={(result) => {
            toast.success(`${result.created} lead(s) importado(s).`);
            refreshOptions();
            void loadBoard(filterRef.current);
          }}
        />
      )}
      {losingLead && (
        <LeadLostModal
          lead={losingLead}
          columnLabel={stageLabel("lost")}
          onClose={() => setLosingLead(null)}
          onConfirm={(reason) => markLost(losingLead, reason)}
        />
      )}
      {convertingLead && (
        <LeadConvertModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
        >
          <PatientModal
            patient={undefined}
            lead={convertingLead}
            configuredTags={configuredTags}
            onClose={() => setConvertingLead(null)}
            onSaved={(patient, notice, result) =>
              converted(
                convertingLead,
                result?.lead,
                notice ??
                  `Lead convertido: cadastro de ${patient.fullName} salvo.`,
              )
            }
          />
        </LeadConvertModal>
      )}
      {trialLead && (
        <LeadAppointmentModal
          lead={trialLead}
          onClose={() => setTrialLead(null)}
          onCreated={(appointment) => {
            const startsAt = new Date(appointment.startsAt);
            setNotice(
              `${visitTypeLabels[appointment.visitType]} agendada para ${trialLead.fullName} em ${shortDate.format(startsAt)} às ${timeLabel.format(startsAt)}.`,
            );
            setTrialLead(null);
          }}
        />
      )}
      {activityLead && (
        <LeadActivityModal
          lead={activityLead}
          editable={canManage}
          onClose={() => setActivityLead(null)}
          onChanged={(contact) => {
            if (contact) rememberContact(activityLead.id, contact);
            void loadBoard(filterRef.current);
          }}
        />
      )}
    </>
  );
}
