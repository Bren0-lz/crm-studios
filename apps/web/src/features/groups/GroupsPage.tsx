import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import { GroupDetailsModal } from "./GroupDetailsModal";
import {
  type GroupClass,
  type GroupWorkspace,
  type PatientOption,
  type Professional,
  type Room,
  type Service,
  describeGroupSchedule,
  groupClassName,
  patientFirstName,
  saoPauloToday,
} from "@crm/contracts";
import { useToast } from "../../shared/feedback/toast-context";
import {
  LayoutList,
  Plus,
  Table2,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { EmptyState } from "../../shared/components/EmptyState";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import {
  clinicIsoDate,
  groupEnrollmentToast,
  groupOperationRange,
  groupSeatsLabel,
  groupSlotLabel,
} from "../../shared/lib/formatting";
import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { GroupModal } from "./GroupModal";
import { GroupSlotsEditor } from "./GroupSlotsEditor";
import { GroupsOverviewTab } from "./GroupsOverviewTab";
import { groupCalendarRange } from "./model";
import {
  missingLabels,
  useMissingFields,
} from "../../shared/components/MissingFields";

const groupTabs = [
  { key: "turmas", label: "Turmas", icon: LayoutList },
  { key: "visao-geral", label: "Visão geral", icon: Table2 },
] as const;
type GroupTabKey = (typeof groupTabs)[number]["key"];

/**
 * Consultas independentes: se o workspace falhar, serviços, profissionais, salas e clientes
 * continuam disponíveis para "Nova turma" e "Matricular cliente".
 */
function fetchGroupsData(month: string) {
  const dates = groupCalendarRange(month);
  return Promise.allSettled([
    api.groupWorkspace(dates.from, dates.to),
    api.patientOptions(),
    api.professionals(),
    api.rooms(),
    api.services(),
  ]);
}

export function GroupsPage() {
  const { can, canEdit, canView } = useAuthorization();
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<GroupTabKey>("turmas");
  function moveTabFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % groupTabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + groupTabs.length) % groupTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = groupTabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(groupTabs[next]!.key);
    document.getElementById(`${tabsId}-${groupTabs[next]!.key}-tab`)?.focus();
  }
  const toast = useToast();
  const contextPatientId = usePatientContext();
  const weekDayNames = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  const [workspace, setWorkspace] = useState<GroupWorkspace | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canManage = canEdit("groups");
  // Atalho de Clientes ("Assinantes sem turma vinculada"): `?matricular=<cliente>` abre a matrícula.
  const [searchParams] = useSearchParams();
  const enrollPatientId = canManage
    ? (searchParams.get("matricular") ?? "")
    : "";
  const [groupDialog, setGroupDialog] = useState<"create" | "enroll" | null>(
    () => (enrollPatientId ? "enroll" : null),
  );
  const [saving, setSaving] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const timezone = useClinicTimezone();
  // Mês do calendário de aulas e mês cujo período está carregado no workspace.
  const [calendarMonth, setCalendarMonth] = useState(() =>
    saoPauloToday().slice(0, 7),
  );
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<{
    month: string;
    message: string;
  } | null>(null);
  const [monthAttempt, setMonthAttempt] = useState(0);
  // Só a consulta mais recente do workspace é aplicada (navegação rápida entre meses).
  const workspaceRequest = useRef(0);
  const [initialSessionId, setInitialSessionId] = useState<
    string | undefined
  >();
  const [handledSessionId, setHandledSessionId] = useState<
    string | undefined
  >();
  const linkedSessionId = searchParams.get("sessionId") ?? undefined;
  const [editingCapacity, setEditingCapacity] = useState(1);
  const [editingSlots, setEditingSlots] = useState<GroupClass["weeklySlots"]>(
    [],
  );
  const [groupForm, setGroupForm] = useState({
    serviceId: "",
    professionalId: "",
    roomId: "",
    capacity: 1,
    weeklySlots: [] as GroupClass["weeklySlots"],
  });
  const [enrollmentForm, setEnrollmentForm] = useState({
    groupId: "",
    patientId: enrollPatientId || contextPatientId,
    startsOn: saoPauloToday(),
  });
  const createDirty = useFormDirty(groupForm, groupDialog === "create");
  const createMissing = useMissingFields(
    [
      ...missingLabels([
        ["Serviço", groupForm.serviceId],
        ["Profissional", groupForm.professionalId],
        ["Sala", groupForm.roomId],
      ]),
      ...(groupForm.weeklySlots.length ? [] : ["Horários semanais"]),
    ],
    "field-hint",
  );
  const editMissing = useMissingFields(
    editingSlots.length ? [] : ["Horários semanais"],
    "field-hint",
  );
  const enrollDirty = useFormDirty(enrollmentForm, groupDialog === "enroll");
  const enrollMissing = useMissingFields(
    missingLabels([
      ["Turma", enrollmentForm.groupId],
      ["Cliente", enrollmentForm.patientId],
    ]),
    "field-hint",
  );
  function applyGroupsData(
    results: Awaited<ReturnType<typeof fetchGroupsData>>,
    month: string,
    request: number,
  ) {
    const [data, patientData, professionalData, roomData, serviceData] =
      results;
    if (data.status === "fulfilled" && request === workspaceRequest.current) {
      setWorkspace(data.value);
      setLoadedMonth(month);
    }
    if (patientData.status === "fulfilled") setPatients(patientData.value);
    if (professionalData.status === "fulfilled")
      setProfessionals(professionalData.value);
    if (roomData.status === "fulfilled") setRooms(roomData.value);
    if (serviceData.status === "fulfilled") setServices(serviceData.value);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) setError((failure.reason as Error).message);
  }
  /** Recarrega tudo no período do mês visível, preservando mês e dia escolhidos. */
  async function load() {
    setLoading(true);
    setError("");
    const request = ++workspaceRequest.current;
    try {
      applyGroupsData(await fetchGroupsData(calendarMonth), calendarMonth, request);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const month = saoPauloToday().slice(0, 7);
    const request = ++workspaceRequest.current;
    void fetchGroupsData(month).then((results) => {
      if (!active) return;
      applyGroupsData(results, month, request);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  // Navegação do calendário: consulta o período do novo mês; respostas antigas são descartadas.
  useEffect(() => {
    if (loadedMonth === null || calendarMonth === loadedMonth) return;
    let active = true;
    const request = ++workspaceRequest.current;
    const dates = groupCalendarRange(calendarMonth);
    api.groupWorkspace(dates.from, dates.to).then(
      (data) => {
        if (!active || request !== workspaceRequest.current) return;
        setWorkspace(data);
        setLoadedMonth(calendarMonth);
      },
      (cause: unknown) => {
        if (!active || request !== workspaceRequest.current) return;
        setMonthError({
          month: calendarMonth,
          message: (cause as Error).message,
        });
      },
    );
    return () => {
      active = false;
    };
  }, [calendarMonth, loadedMonth, monthAttempt]);
  function changeCalendarMonth(month: string) {
    setMonthError(null);
    setCalendarMonth(month);
  }
  function retryCalendarMonth() {
    setMonthError(null);
    setMonthAttempt((value) => value + 1);
  }
  const calendarError =
    monthError?.month === calendarMonth ? monthError.message : "";
  const calendarLoading =
    loadedMonth !== null && calendarMonth !== loadedMonth && !calendarError;
  // Indicadores gerais seguem o recorte operacional, qualquer que seja o mês visível.
  const operationRange = groupOperationRange();
  /** Executa a gravação; o texto devolvido pela ação vira o aviso de sucesso. */
  async function run(action: () => Promise<string>) {
    setError("");
    setSaving(true);
    try {
      toast.success(await action());
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const activeEnrollments =
    workspace?.enrollments.filter((item) => item.status === "active") ?? [];
  const selectedGroup = workspace?.groups.find(
    (item) => item.id === selectedGroupId,
  );
  const newGroupService = services.find(
    (item) => item.id === groupForm.serviceId,
  );
  const nextGroupSequence =
    Math.max(
      0,
      ...(workspace?.groups ?? [])
        .filter((item) => item.serviceId === groupForm.serviceId)
        .map((item) => item.sequence),
    ) + 1;
  const groupOptionLabel = (group: GroupClass) =>
    `${group.name} — ${describeGroupSchedule(group.weeklySlots ?? [])}`;
  const editDirty = useFormDirty(
    { editingCapacity, editingSlots },
    Boolean(selectedGroup),
  );
  // Sincroniza uma nova URL com os dados carregados, sem reabrir após gravações.
  if (linkedSessionId !== handledSessionId) {
    const session = workspace?.sessions.find(
      (item) => item.id === linkedSessionId,
    );
    const group = workspace?.groups.find(
      (item) => item.id === session?.groupId,
    );
    if (!linkedSessionId || group) {
      setHandledSessionId(linkedSessionId);
      if (group && session) {
        changeCalendarMonth(
          clinicIsoDate(session.startsAt, timezone).slice(0, 7),
        );
        setGroupDialog(null);
        setInitialSessionId(linkedSessionId);
        setSelectedGroupId(group.id);
        setEditingCapacity(group.capacity);
        setEditingSlots(group.weeklySlots ?? []);
      }
    }
  }
  function openGroup(group: GroupClass) {
    changeCalendarMonth(clinicIsoDate(new Date(), timezone).slice(0, 7));
    setInitialSessionId(undefined);
    setSelectedGroupId(group.id);
    setEditingCapacity(group.capacity);
    setEditingSlots(group.weeklySlots ?? []);
  }
  function closeGroupDialogs() {
    setGroupDialog(null);
    setSelectedGroupId(null);
  }
  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      <PageHeader
        title="Turmas"
        description="Capacidade, lista de espera e horários fixos reservados na agenda."
        action={
          canManage && (
            <div className="page-actions">
              {can("groups.enroll") && (
                <button
                  className="secondary-button"
                  onClick={() => setGroupDialog("enroll")}
                >
                  <UserPlus size={18} /> Matricular cliente
                </button>
              )}
              {can("groups.create") && (
                <button
                  className="primary-button"
                  onClick={() => setGroupDialog("create")}
                >
                  <Plus size={18} /> Nova turma
                </button>
              )}
            </div>
          )
        }
      />
      {!canManage && <ReadOnlyNotice module="groups" />}
      {error && !selectedGroup && !groupDialog && <ErrorBanner error={error} />}
      {loading && !workspace ? (
        <LoadingBlock />
      ) : (
        <div className="groups-layout">
          <div className="group-overview">
            <div>
              <span>Turmas</span>
              <strong>{workspace?.groups.length ?? 0}</strong>
              <small>cadastradas</small>
            </div>
            <div>
              <span>Matrículas ativas</span>
              <strong>{activeEnrollments.length}</strong>
              <small>clientes inscritos</small>
            </div>
            <div>
              <span>Encontros</span>
              <strong>
                {workspace?.sessions.filter(
                  (item) =>
                    item.status === "scheduled" &&
                    new Date(item.startsAt) >= new Date(operationRange.from) &&
                    new Date(item.startsAt) <= new Date(operationRange.to),
                ).length ?? 0}
              </strong>
              <small>agendados</small>
            </div>
          </div>
          {groupDialog === "create" && (
            <GroupModal
              title="Nova turma"
              subtitle="Configure os dados e horários fixos."
              busy={saving}
              dirty={createDirty}
              onClose={closeGroupDialogs}
            >
              <section className="group-modal-sections group-form-panel">
                {error && <ErrorBanner error={error} />}
                {can("groups.create") && (
                  <form
                    className="group-modal-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        const created = await api.createGroupClass(groupForm);
                        setGroupForm({
                          serviceId: "",
                          professionalId: "",
                          roomId: "",
                          capacity: 1,
                          weeklySlots: [],
                        });
                        closeGroupDialogs();
                        return `Turma ${created.name} criada.`;
                      });
                    }}
                  >
                    <section className="group-modal-section">
                      <h3>Dados da turma</h3>
                      <p>
                        Escolha o serviço, quem conduz a turma, a sala e o
                        número de vagas.
                      </p>
                      <div className="group-modal-field-grid">
                        <label>
                          Serviço
                          <select
                            required
                            value={groupForm.serviceId}
                            onChange={(event) =>
                              setGroupForm({
                                ...groupForm,
                                serviceId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {services.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Profissional
                          <select
                            required
                            value={groupForm.professionalId}
                            onChange={(event) =>
                              setGroupForm({
                                ...groupForm,
                                professionalId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {professionals.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.fullName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Sala
                          <select
                            required
                            value={groupForm.roomId}
                            onChange={(event) =>
                              setGroupForm({
                                ...groupForm,
                                roomId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {rooms.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.capacity})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Vagas
                          <input
                            type="number"
                            min={1}
                            max={
                              rooms.find((item) => item.id === groupForm.roomId)
                                ?.capacity ?? 100
                            }
                            value={groupForm.capacity}
                            onChange={(event) =>
                              setGroupForm({
                                ...groupForm,
                                capacity: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </section>
                    <section className="group-modal-section">
                      <h3>Horários semanais</h3>
                      <p>
                        Adicione os dias e horários em que a turma se reúne.
                      </p>
                      <GroupSlotsEditor
                        slots={groupForm.weeklySlots}
                        onChange={(weeklySlots) =>
                          setGroupForm({ ...groupForm, weeklySlots })
                        }
                        weekDayNames={weekDayNames}
                      />
                    </section>
                    <section className="group-modal-section">
                      <h3>Resumo da turma</h3>
                      <div className="group-next-session" aria-live="polite">
                        {newGroupService ? (
                          <strong>
                            {groupClassName(
                              newGroupService.name,
                              nextGroupSequence,
                            )}
                          </strong>
                        ) : (
                          "Selecione o serviço para ver o nome da turma"
                        )}
                        <br />
                        {describeGroupSchedule(groupForm.weeklySlots)}
                      </div>
                    </section>
                    {createMissing.hint}
                    <div className="modal-actions group-modal-actions">
                      <button
                        className="primary-button"
                        disabled={createMissing.blocked}
                        aria-describedby={createMissing.describedBy}
                      >
                        Criar turma
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </GroupModal>
          )}
          {groupDialog === "enroll" && (
            <GroupModal
              title="Nova matrícula"
              subtitle="Escolha a turma e o cliente."
              busy={saving}
              dirty={enrollDirty}
              onClose={closeGroupDialogs}
            >
              <section className="group-modal-sections group-form-panel">
                {error && <ErrorBanner error={error} />}
                {can("groups.enroll") && (
                  <form
                    className="group-modal-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!enrollmentForm.patientId) return;
                      void run(async () => {
                        const enrollment =
                          await api.createGroupEnrollment(enrollmentForm);
                        closeGroupDialogs();
                        return groupEnrollmentToast(
                          enrollment,
                          workspace?.groups.find(
                            (item) => item.id === enrollment.groupId,
                          )?.name,
                        );
                      });
                    }}
                  >
                    <section className="group-modal-section">
                      <h3>Dados da matrícula</h3>
                      <p>
                        Escolha uma turma ativa e o cliente que deseja
                        matricular.
                      </p>
                      <div className="group-modal-field-grid">
                        <label>
                          Turma
                          <select
                            required
                            value={enrollmentForm.groupId}
                            onChange={(event) =>
                              setEnrollmentForm({
                                ...enrollmentForm,
                                groupId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {workspace?.groups
                              .filter((item) => item.active)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {groupOptionLabel(item)}
                                </option>
                              ))}
                          </select>
                        </label>
                        <PatientPicker
                          required
                          patients={patients}
                          value={enrollmentForm.patientId}
                          disabled={saving}
                          onChange={(patientId) =>
                            setEnrollmentForm({ ...enrollmentForm, patientId })
                          }
                        />
                        <label>
                          Início da matrícula
                          <input
                            type="date"
                            required
                            disabled={saving}
                            value={enrollmentForm.startsOn}
                            onChange={(event) =>
                              setEnrollmentForm({
                                ...enrollmentForm,
                                startsOn: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </section>
                    {enrollMissing.hint}
                    <div className="modal-actions group-modal-actions">
                      <button
                        className="primary-button"
                        disabled={saving || enrollMissing.blocked}
                        aria-describedby={enrollMissing.describedBy}
                      >
                        Matricular
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </GroupModal>
          )}

          <div
            className="settings-tabs groups-tabs"
            role="tablist"
            aria-label="Seções de turmas"
          >
            {groupTabs.map((tab, index) => (
              <button
                key={tab.key}
                id={`${tabsId}-${tab.key}-tab`}
                type="button"
                role="tab"
                className="text-button settings-tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`${tabsId}-${tab.key}-panel`}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => moveTabFocus(event, index)}
              >
                <tab.icon size={18} aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === "visao-geral" && workspace && (
            <GroupsOverviewTab
              id={`${tabsId}-visao-geral-panel`}
              labelledBy={`${tabsId}-visao-geral-tab`}
              workspace={workspace}
              services={services}
              weekDayNames={weekDayNames}
              showRevenue={canView("plans")}
            />
          )}
          <section
            className="panel groups-wide"
            id={`${tabsId}-turmas-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-turmas-tab`}
            hidden={activeTab !== "turmas"}
          >
            <h2>Turmas</h2>
            <p className="group-panel-copy">
              Acompanhe ocupação, participantes e lista de espera.
            </p>
            {workspace?.groups.length === 0 && (
              <EmptyState
                icon={UsersRound}
                title="Nenhuma turma cadastrada"
                copy="Crie a primeira turma para matricular clientes e controlar a ocupação."
                action={
                  can("groups.create") ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setGroupDialog("create")}
                    >
                      <Plus size={18} /> Criar primeira turma
                    </button>
                  ) : undefined
                }
              />
            )}
            <div className="group-card-grid">
              {workspace?.groups.map((group) => (
                <article className="group-card" key={group.id}>
                  <div>
                    <strong>{group.name}</strong>
                    <span className="group-card-schedule">
                      {describeGroupSchedule(group.weeklySlots ?? [])}
                    </span>
                    <small>
                      {group.professionalName} · {group.roomName}
                    </small>
                  </div>
                  <span>
                    {groupSeatsLabel(group.activeEnrollments, group.capacity)}
                  </span>
                  <small>{group.waitlistCount} em espera</small>
                  <div className="group-slot-summary">
                    {(group.weeklySlots ?? []).length ? (
                      group.weeklySlots.map((slot) => (
                        <span key={`${slot.weekday}-${slot.startTime}`}>
                          {groupSlotLabel(slot, weekDayNames)}
                        </span>
                      ))
                    ) : (
                      <small>Horários ainda não definidos</small>
                    )}
                  </div>
                  <button
                    className="secondary-button button-sm"
                    onClick={() => openGroup(group)}
                  >
                    Abrir turma
                  </button>
                </article>
              ))}
            </div>
          </section>

          {selectedGroup && workspace && (
            <GroupDetailsModal
              key={`${selectedGroup.id}-${initialSessionId ?? ""}`}
              group={selectedGroup}
              workspace={workspace}
              professionals={professionals}
              initialSessionId={initialSessionId}
              calendar={{
                month: calendarMonth,
                loading: calendarLoading,
                error: calendarError,
                onMonthChange: changeCalendarMonth,
                onRetry: retryCalendarMonth,
              }}
              onChanged={load}
              busy={saving}
              dirty={editDirty}
              error={error}
              onClose={closeGroupDialogs}
            >
              <div className="group-modal-sections">
                <section className="group-modal-section">
                  <h3>Dados da turma</h3>
                  <dl className="patient-detail-fields">
                    <div>
                      <dt>Serviço</dt>
                      <dd>{selectedGroup.serviceName}</dd>
                    </div>
                    <div>
                      <dt>Profissional</dt>
                      <dd>{selectedGroup.professionalName}</dd>
                    </div>
                    <div>
                      <dt>Sala</dt>
                      <dd>{selectedGroup.roomName}</dd>
                    </div>
                    <div>
                      <dt>Horário</dt>
                      <dd>
                        {(selectedGroup.weeklySlots ?? []).length
                          ? selectedGroup.weeklySlots
                              .map((slot) => groupSlotLabel(slot, weekDayNames))
                              .join(", ")
                          : "Horários ainda não definidos"}
                      </dd>
                    </div>
                    <div>
                      <dt>Matriculados</dt>
                      <dd>
                        {groupSeatsLabel(
                          selectedGroup.activeEnrollments,
                          selectedGroup.capacity,
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>
                {canManage && (
                  <>
                    <div className="group-modal-quick-actions">
                      {can("groups.enroll") && (
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setEnrollmentForm({
                              ...enrollmentForm,
                              groupId: selectedGroup.id,
                            });
                            setSelectedGroupId(null);
                            setGroupDialog("enroll");
                          }}
                        >
                          Matricular cliente
                        </button>
                      )}
                    </div>
                    <section className="group-modal-section">
                      <h3>Capacidade e horários</h3>
                      <p>
                        Ao salvar, os próximos encontros são refeitos nos novos
                        horários. Encontros com presença registrada são
                        mantidos.
                      </p>
                      {can("groups.update") && (
                        <form
                          className="group-modal-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void run(async () => {
                              await api.updateGroupClass(selectedGroup.id, {
                                capacity: editingCapacity,
                                weeklySlots: editingSlots,
                              });
                              closeGroupDialogs();
                              return `Turma ${selectedGroup.name} atualizada.`;
                            });
                          }}
                        >
                          <div className="group-modal-capacity">
                            <label>
                              Máximo de pessoas
                              <input
                                type="number"
                                min={selectedGroup.activeEnrollments}
                                max={
                                  rooms.find(
                                    (item) => item.id === selectedGroup.roomId,
                                  )?.capacity ?? 100
                                }
                                required
                                value={editingCapacity}
                                onChange={(event) =>
                                  setEditingCapacity(Number(event.target.value))
                                }
                              />
                            </label>
                            <div className="group-modal-note">
                              {selectedGroup.activeEnrollments}{" "}
                              {selectedGroup.activeEnrollments === 1
                                ? "matriculado"
                                : "matriculados"}{" "}
                              · Sala {selectedGroup.roomName} comporta até{" "}
                              {rooms.find(
                                (item) => item.id === selectedGroup.roomId,
                              )?.capacity ?? "—"}{" "}
                              pessoas
                            </div>
                          </div>
                          <GroupSlotsEditor
                            slots={editingSlots}
                            onChange={setEditingSlots}
                            weekDayNames={weekDayNames}
                          />
                          {editMissing.hint}
                          <div className="modal-actions group-modal-actions">
                            <button
                              className="primary-button"
                              disabled={editMissing.blocked}
                              aria-describedby={editMissing.describedBy}
                            >
                              Salvar alterações
                            </button>
                          </div>
                        </form>
                      )}
                    </section>
                  </>
                )}
                <section className="group-modal-section">
                  <h3>Participantes</h3>
                  <div className="group-members">
                    {workspace?.enrollments
                      .filter(
                        (item) =>
                          item.groupId === selectedGroup.id &&
                          item.status !== "cancelled",
                      )
                      .map((item) => (
                        <div key={item.id}>
                          <span>
                            {item.patientName} ·{" "}
                            {item.status === "active"
                              ? "Matriculado"
                              : `Espera ${item.queuePosition}`}
                          </span>
                          {canManage && can("groups.cancel_enrollment") && (
                            <button
                              type="button"
                              className="danger-button button-sm"
                              aria-label={`Cancelar matrícula de ${item.patientName}`}
                              onClick={() =>
                                void run(async () => {
                                  await api.cancelGroupEnrollment(item.id);
                                  return `Matrícula de ${patientFirstName(item.patientName)} cancelada.`;
                                })
                              }
                            >
                              <UserMinus size={14} aria-hidden="true" />
                              Cancelar matrícula
                            </button>
                          )}
                        </div>
                      ))}
                    {!workspace?.enrollments.some(
                      (item) =>
                        item.groupId === selectedGroup.id &&
                        item.status !== "cancelled",
                    ) && <p>Nenhum participante matriculado.</p>}
                  </div>
                </section>
              </div>
            </GroupDetailsModal>
          )}
        </div>
      )}
    </>
  );
}
