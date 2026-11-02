import type {
  GroupClass,
  PatientPlanInput,
  PlanPurchaseInput,
  PatientOption,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import {
  describeGroupSchedule,
  recurringOccurrenceStarts,
  serviceAvailableFor,
  type PackageWeeklySlot,
} from "@crm/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { AppointmentForm, PackageWeeklySlotsFields } from "../agenda/index";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { localIsoDate } from "../../shared/lib/formatting";
import { PlanScheduleSummary } from "./PlanScheduleSummary";
import {
  planScheduleMaxSessions,
  planScheduledSessionCounts,
  plannedServiceSessions,
  type ServiceScheduleConfig,
  type SessionException,
} from "./session-schedule";
const weekdayNames = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
/**
 * A turma é escolhida no próprio formulário do plano (`PlanForm`) e o documento para
 * assinatura no `PlanModal`.
 */
export type PurchaseOptions = Pick<PlanPurchaseInput, "appointments">;
export function PlanPurchaseOptions({
  plan,
  patients,
  services,
  group,
  value,
  onChange,
  onNestedChange,
  onBlockedChange,
}: {
  plan: PatientPlanInput;
  /** Turma escolhida no plano: seus horários fixos entram na contratação. */
  group?: GroupClass | undefined;
  patients: PatientOption[];
  services: Service[];
  value: PurchaseOptions;
  onChange: (value: PurchaseOptions) => void;
  onNestedChange: (open: boolean) => void;
  /** Motivo que impede fechar a contratação (sessões em conflito…); vazio = liberada. */
  onBlockedChange?: ((message: string) => void) | undefined;
}) {
  const { can } = useAuthorization(),
    [expanded, setExpanded] = useState(false),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [professionals, setProfessionals] = useState<Professional[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [scheduling, setScheduling] = useState(false),
    [busy, setBusy] = useState(false),
    [nested, setNested] = useState(false);
  const canAgenda = can("agenda.create");
  const groupSlots = [...(group?.weeklySlots ?? [])].sort(
    (a, b) =>
      ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) ||
      a.startTime.localeCompare(b.startTime),
  );
  // Turma com horários fixos: a seção abre já preenchida com eles.
  const [shownGroupId, setShownGroupId] = useState(group?.id);
  if (shownGroupId !== group?.id) {
    setShownGroupId(group?.id);
    if (group?.weeklySlots.length) setExpanded(true);
  }
  // Plano avulso ou pacote (com saldo de sessões, sem turma): as sessões são geradas pelos
  // dias fixos, exatamente na quantidade contratada. Não dá para adicionar nem remover.
  const counts = group ? undefined : planScheduledSessionCounts(plan);
  const generated = Boolean(counts) && canAgenda;
  const [shownGenerated, setShownGenerated] = useState(false);
  if (shownGenerated !== generated) {
    setShownGenerated(generated);
    if (generated) setExpanded(true);
  }
  const [configs, setConfigs] = useState<
    Record<string, Partial<ServiceScheduleConfig>>
  >({});
  const [exceptions, setExceptions] = useState<
    Record<string, SessionException>
  >({});
  const [notice, setNotice] = useState("");
  const [summaryBlocked, setSummaryBlocked] = useState("");
  const defaultFromDate =
    plan.validFrom > localIsoDate() ? plan.validFrom : localIsoDate();
  const configOf = (serviceId: string): ServiceScheduleConfig => {
    const saved = configs[serviceId] ?? {};
    const fromDate = saved.fromDate || defaultFromDate;
    return {
      professionalId: saved.professionalId ?? "",
      roomId: saved.roomId ?? "",
      fromDate,
      slots: saved.slots ?? [
        {
          weekday: new Date(`${fromDate}T12:00:00`).getDay(),
          time: "09:00",
        },
      ],
    };
  };
  const scheduledServices = Object.entries(counts ?? {});
  const totalSessions = scheduledServices.reduce(
    (total, [, count]) => total + count,
    0,
  );
  const tooMany = totalSessions > planScheduleMaxSessions;
  const sessions =
    generated && !tooMany
      ? scheduledServices.flatMap(([serviceId, count]) =>
          plannedServiceSessions(
            serviceId,
            count,
            configOf(serviceId),
            exceptions,
          ),
        )
      : [];
  const generatedAppointments = sessions.map((session) => ({
    professionalId: session.professionalId,
    roomId: session.roomId,
    serviceId: session.serviceId,
    startsAt: new Date(session.local).toISOString(),
    visitType: "regular" as const,
    notes: "",
  }));
  const generatedKey = generated ? JSON.stringify(generatedAppointments) : "";
  const wasGenerated = useRef(false);
  useEffect(() => {
    if (!generated) {
      // Deixou de ser avulso/pacote (ex.: escolheu turma): as sessões geradas saem.
      if (wasGenerated.current && value.appointments.length)
        onChange({ ...value, appointments: [] });
      wasGenerated.current = false;
      return;
    }
    wasGenerated.current = true;
    if (JSON.stringify(value.appointments) !== generatedKey)
      onChange({ ...value, appointments: generatedAppointments });
    // `generatedKey` resume as sessões geradas: só atualiza quando alguma muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated, generatedKey]);
  const blocked = !generated
    ? ""
    : tooMany
      ? `O plano tem ${totalSessions} sessões: a contratação agenda até ${planScheduleMaxSessions}. Agende as sessões depois, pela agenda.`
      : sessions.length
        ? summaryBlocked
        : "";
  useEffect(() => {
    onBlockedChange?.(blocked);
  }, [blocked, onBlockedChange]);
  useEffect(() => () => onBlockedChange?.(""), [onBlockedChange]);
  const reportSummary = useCallback(
    (message: string) => setSummaryBlocked(message),
    [],
  );
  function changeConfig(
    serviceId: string,
    change: Partial<ServiceScheduleConfig>,
  ) {
    setConfigs((current) => ({
      ...current,
      [serviceId]: { ...configOf(serviceId), ...change },
    }));
    // Os dias fixos mudaram: as sessões são geradas de novo, sem as exceções deste serviço.
    const prefix = `${serviceId}:`;
    if (Object.keys(exceptions).some((key) => key.startsWith(prefix))) {
      setExceptions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !key.startsWith(prefix)),
        ),
      );
      setNotice(
        "Os dias fixos mudaram: as sessões foram geradas de novo e as alterações feitas em sessões específicas foram descartadas.",
      );
    }
  }
  useEffect(() => {
    if (!expanded || !canAgenda) return;
    let alive = true;
    Promise.all([api.professionals(), api.rooms()])
      .then(([staff, places]) => {
        if (alive) {
          setProfessionals(staff);
          setRooms(places);
          setLoaded(true);
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [expanded, attempt, canAgenda]);
  const patient = patients.find((item) => item.id === plan.patientId);
  function schedule(open: boolean) {
    setScheduling(open);
    onNestedChange(open);
  }
  if (!canAgenda && !group) return null;
  // Recorrente/personalizado sem turma continua com a escolha livre de horários.
  return (
    <div className="span-2">
      <details
        open={expanded}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          // Aberto pela turma (já carregando): o evento só confirma o estado.
          if (open === expanded) return;
          setExpanded(open);
          if (open) {
            setLoaded(false);
            setError("");
          }
        }}
      >
        <summary>Horários da contratação</summary>
        {expanded && (
          <div className="clinical-form">
            {group && groupSlots.length > 0 && (
              <section
                className="group-details"
                aria-label={`Horários fixos da turma ${group.name}`}
              >
                <header>
                  <div>
                    <strong>{`Turma ${group.name}`}</strong>
                    <small>{describeGroupSchedule(groupSlots)}</small>
                  </div>
                </header>
                <ul className="group-details-slots">
                  {groupSlots.map((slot) => (
                    <li key={`${slot.weekday}-${slot.startTime}`}>
                      <span>{weekdayNames[slot.weekday]}</span>
                      <span>
                        {`${slot.startTime} às ${slot.endTime} · ${group.professionalName}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="muted-copy">
                  Horários fixos da turma: a matrícula reserva estes horários ao
                  confirmar o plano.
                </p>
              </section>
            )}
            {canAgenda && error && (
              <>
                <ErrorBanner error={error} />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Tentar carregar opções
                </button>
              </>
            )}
            {canAgenda && !loaded && !error && <LoadingBlock />}
            {generated && loaded && (
              <>
                {tooMany ? (
                  <div className="form-error" role="alert">
                    {blocked}
                  </div>
                ) : (
                  scheduledServices.map(([serviceId, count]) => {
                    const service = services.find(
                      (item) => item.id === serviceId,
                    );
                    const config = configOf(serviceId);
                    const starts = sessions
                      .filter((session) => session.serviceId === serviceId)
                      .map((session) => session.local);
                    return (
                      <fieldset
                        key={serviceId}
                        className="plan-service-schedule form-grid"
                      >
                        <legend>
                          {`${service?.name ?? "Serviço"} · ${count} ${count === 1 ? "sessão" : "sessões"}`}
                        </legend>
                        <label>
                          Profissional
                          <select
                            value={config.professionalId}
                            onChange={(event) =>
                              changeConfig(serviceId, {
                                professionalId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {professionals
                              .filter(
                                (item) =>
                                  item.active &&
                                  (!service ||
                                    serviceAvailableFor(service, item.id, "")),
                              )
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.fullName}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Sala
                          <select
                            value={config.roomId}
                            onChange={(event) =>
                              changeConfig(serviceId, {
                                roomId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {rooms
                              .filter(
                                (item) =>
                                  item.active &&
                                  (!service ||
                                    serviceAvailableFor(service, "", item.id)),
                              )
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Primeira data
                          <input
                            type="date"
                            min={plan.validFrom}
                            value={config.fromDate}
                            onChange={(event) =>
                              event.target.value &&
                              changeConfig(serviceId, {
                                fromDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <PackageWeeklySlotsFields
                          slots={config.slots}
                          starts={starts}
                          showPreview={false}
                          onChange={(slots: PackageWeeklySlot[]) =>
                            changeConfig(serviceId, { slots })
                          }
                        />
                        {!starts.length && (
                          <p className="field-hint span-2">
                            Escolha o profissional e a sala para gerar as{" "}
                            {count} sessões.
                          </p>
                        )}
                      </fieldset>
                    );
                  })
                )}
                {notice && (
                  <p className="field-hint" role="status">
                    {notice}
                  </p>
                )}
                <PlanScheduleSummary
                  sessions={sessions}
                  professionals={professionals}
                  rooms={rooms}
                  services={services}
                  validUntil={plan.validUntil || undefined}
                  onException={(key, exception) =>
                    setExceptions((current) => {
                      const next = { ...current };
                      if (exception) next[key] = exception;
                      else delete next[key];
                      return next;
                    })
                  }
                  onBlockedChange={reportSummary}
                  onNestedChange={onNestedChange}
                />
                <p>
                  As sessões serão reservadas junto com o plano e as parcelas.
                </p>
              </>
            )}
            {canAgenda && loaded && !generated && !group && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!patient || !plan.services.length}
                  onClick={() => schedule(true)}
                >
                  Adicionar horários à contratação
                </button>
                {value.appointments.map((item, index) => (
                  <div className="table-row" key={`${index}:${item.startsAt}`}>
                    <span>
                      {new Date(item.startsAt).toLocaleString("pt-BR")} ·{" "}
                      {
                        professionals.find(
                          (professional) =>
                            professional.id === item.professionalId,
                        )?.fullName
                      }
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        onChange({
                          ...value,
                          appointments: value.appointments.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      Remover horário
                    </button>
                  </div>
                ))}
                <p>
                  Os horários serão confirmados junto com o plano e as parcelas.
                </p>
              </>
            )}
          </div>
        )}
      </details>
      {scheduling &&
        patient &&
        createPortal(
          <Modal
            title="Horários da contratação"
            subtitle="Use os mesmos campos e regras da agenda. Os horários serão reservados ao confirmar o plano."
            busy={busy}
            inactive={nested}
            onClose={() => schedule(false)}
          >
            <AppointmentForm
              patients={patients}
              fixedPatient={patient}
              professionals={professionals}
              rooms={rooms}
              services={services.filter((service) =>
                plan.services.some((entry) => entry.serviceId === service.id),
              )}
              onCancel={() => schedule(false)}
              onBusyChange={setBusy}
              onNestedModalChange={setNested}
              onSubmit={async (input, recurrence) => {
                const appointments = (
                  recurrence
                    ? recurringOccurrenceStarts({
                        startsAt: input.startsAt,
                        ...recurrence,
                      })
                    : [input.startsAt]
                ).map((startsAt) => ({
                  professionalId: input.professionalId,
                  roomId: input.roomId,
                  serviceId: input.serviceId,
                  startsAt,
                  visitType: input.visitType,
                  notes: input.notes,
                }));
                if (value.appointments.length + appointments.length > 120)
                  throw new Error(
                    "Uma contratação pode reservar até 120 horários.",
                  );
                onChange({
                  ...value,
                  appointments: [...value.appointments, ...appointments],
                });
                schedule(false);
              }}
            />
          </Modal>,
          document.body,
        )}
    </div>
  );
}
