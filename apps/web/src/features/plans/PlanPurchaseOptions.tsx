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
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { AppointmentForm } from "../agenda/index";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
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
}: {
  plan: PatientPlanInput;
  /** Turma escolhida no plano: seus horários fixos entram na contratação. */
  group?: GroupClass | undefined;
  patients: PatientOption[];
  services: Service[];
  value: PurchaseOptions;
  onChange: (value: PurchaseOptions) => void;
  onNestedChange: (open: boolean) => void;
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
            {canAgenda && loaded && (
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
              packageSessions={
                plan.kind === "fixed_package"
                  ? Object.fromEntries(
                      plan.services.map((entry) => [
                        entry.serviceId,
                        entry.totalSessions,
                      ]),
                    )
                  : undefined
              }
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
