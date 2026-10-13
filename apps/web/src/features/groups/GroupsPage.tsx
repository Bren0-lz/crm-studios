import {
  type GroupClass,
  type GroupWorkspace,
  type PatientOption,
  type Professional,
  type Room,
  type Service,
  describeGroupSchedule,
  groupClassName,
} from "@crm/contracts";
import { Plus, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import {
  groupOperationRange,
  groupSlotLabel,
} from "../../shared/lib/formatting";
import { GroupModal } from "./GroupModal";
import { GroupSlotsEditor } from "./GroupSlotsEditor";

export function GroupsPage() {
  const { can, canEdit } = useAuthorization();
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
    patientId: enrollPatientId,
  });
  async function load() {
    setLoading(true);
    setError("");
    try {
      const dates = groupOperationRange();
      const [data, patientData, professionalData, roomData, serviceData] =
        await Promise.all([
          api.groupWorkspace(dates.from, dates.to),
          api.patientOptions(),
          api.professionals(),
          api.rooms(),
          api.services(),
        ]);
      setWorkspace(data);
      setPatients(patientData);
      setProfessionals(professionalData);
      setRooms(roomData);
      setServices(serviceData);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const dates = groupOperationRange();
    Promise.all([
      api.groupWorkspace(dates.from, dates.to),
      api.patientOptions(),
      api.professionals(),
      api.rooms(),
      api.services(),
    ])
      .then(([data, patientData, professionalData, roomData, serviceData]) => {
        if (!active) return;
        setWorkspace(data);
        setPatients(patientData);
        setProfessionals(professionalData);
        setRooms(roomData);
        setServices(serviceData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    setError("");
    setSaving(true);
    try {
      await action();
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
  function openGroup(group: GroupClass) {
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
      <PageHeader
        eyebrow="Operação coletiva"
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
      {error && <ErrorBanner error={error} />}
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
                  (item) => item.status === "scheduled",
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
                        await api.createGroupClass(groupForm);
                        setGroupForm({
                          serviceId: "",
                          professionalId: "",
                          roomId: "",
                          capacity: 1,
                          weeklySlots: [],
                        });
                        closeGroupDialogs();
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
                    <div className="modal-actions group-modal-actions">
                      <button
                        className="primary-button"
                        disabled={groupForm.weeklySlots.length === 0}
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
                        await api.createGroupEnrollment(enrollmentForm);
                        closeGroupDialogs();
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
                      </div>
                    </section>
                    <div className="modal-actions group-modal-actions">
                      <button
                        className="primary-button"
                        disabled={
                          saving ||
                          !enrollmentForm.patientId ||
                          !enrollmentForm.groupId
                        }
                      >
                        Matricular
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </GroupModal>
          )}

          <section className="panel groups-wide">
            <h2>Turmas</h2>
            <p className="group-panel-copy">
              Acompanhe ocupação, participantes e lista de espera.
            </p>
            {workspace?.groups.length === 0 && (
              <p className="group-empty">
                Nenhuma turma cadastrada. Use “Nova turma” para criar a
                primeira.
              </p>
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
                    {group.activeEnrollments}/{group.capacity} vagas
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

          {selectedGroup && (
            <GroupModal
              title={selectedGroup.name}
              subtitle={`${describeGroupSchedule(selectedGroup.weeklySlots ?? [])} · ${selectedGroup.professionalName}`}
              busy={saving}
              onClose={closeGroupDialogs}
            >
              <div className="group-modal-sections">
                {error && <ErrorBanner error={error} />}
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
                              {selectedGroup.activeEnrollments} matriculados ·
                              Sala {selectedGroup.roomName} comporta até{" "}
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
                          <div className="modal-actions group-modal-actions">
                            <button
                              className="primary-button"
                              disabled={editingSlots.length === 0}
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
                                void run(() =>
                                  api.cancelGroupEnrollment(item.id),
                                )
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
            </GroupModal>
          )}
        </div>
      )}
    </>
  );
}
