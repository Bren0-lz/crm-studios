import type {
  Appointment,
  GroupClass,
  GroupEnrollment,
  Patient,
  PatientPlan,
} from "@crm/contracts";
import { CalendarDays, PackageOpen } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { FixedPatient } from "../../shared/components/FixedPatient";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { PlanGroupPicker } from "../../shared/components/PlanGroupPicker";
import {
  currency,
  groupOperationRange,
  shortDate,
  timeLabel,
} from "../../shared/lib/formatting";
import type { GroupChoices } from "../../shared/workflows/types";
import { AppointmentForm } from "../agenda/index";
import { PlanForm } from "../plans/index";
import type { NextStepResources, PatientRegistrationResult } from "./types";

export function PatientNextSteps({
  patient,
  initialResult,
  onClose,
}: {
  patient: Patient;
  initialResult?: PatientRegistrationResult;
  onClose: () => void;
}) {
  const { can } = useAuthorization();
  const canPlan = can("plans.create");
  const canAppointment = can("agenda.create") || can("agenda.recurring");
  const canEnroll = can("groups.enroll");
  const [step, setStep] = useState<
    "choice" | "plan" | "appointment" | "enrollment"
  >("choice");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const setFlowBusy = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);
  const [plan, setPlan] = useState<PatientPlan | null>(
    initialResult?.plan ?? null,
  );
  const [appointments, setAppointments] = useState<Appointment[] | null>(
    initialResult?.appointment ? [initialResult.appointment] : null,
  );
  const [enrollment, setEnrollment] = useState<GroupEnrollment | null>(
    initialResult?.enrollment ?? null,
  );
  const [enrollmentGroup, setEnrollmentGroup] = useState<GroupClass | null>(
    initialResult?.group ?? null,
  );
  const [pendingGroup, setPendingGroup] = useState("");
  const [enrollmentError, setEnrollmentError] = useState("");
  const [resourceAttempt, setResourceAttempt] = useState(0);
  const [resourceResult, setResourceResult] = useState<{
    key: string;
    data?: NextStepResources;
    error?: string;
  } | null>(null);
  const resourceKey = `${step}/${resourceAttempt}`;
  const resources =
    resourceResult?.key === resourceKey ? resourceResult.data : undefined;
  const resourceError =
    resourceResult?.key === resourceKey ? resourceResult.error : undefined;
  useEffect(() => {
    if (!(
      (step === "plan" && canPlan) ||
      (step === "appointment" && canAppointment)
    ))
      return;
    let active = true;
    const request =
      step === "plan"
        ? api
            .services()
            .then((services) => ({ services, professionals: [], rooms: [] }))
        : Promise.all([api.services(), api.professionals(), api.rooms()]).then(
            ([services, professionals, rooms]) => ({
              services,
              professionals,
              rooms,
            }),
          );
    request
      .then((data) => {
        if (active) setResourceResult({ key: resourceKey, data });
      })
      .catch((cause: Error) => {
        if (active)
          setResourceResult({ key: resourceKey, error: cause.message });
      });
    return () => {
      active = false;
    };
  }, [step, canPlan, canAppointment, resourceKey]);

  const [groupAttempt, setGroupAttempt] = useState(0);
  const [groupResult, setGroupResult] = useState<{
    attempt: number;
    items?: GroupClass[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!canEnroll || !((step === "plan" && canPlan) || step === "enrollment"))
      return;
    let active = true;
    const range = groupOperationRange();
    api
      .groupWorkspace(range.from, range.to)
      .then((data) => {
        if (active)
          setGroupResult({ attempt: groupAttempt, items: data.groups });
      })
      .catch((cause: Error) => {
        if (active)
          setGroupResult({ attempt: groupAttempt, error: cause.message });
      });
    return () => {
      active = false;
    };
  }, [step, canPlan, canEnroll, groupAttempt]);
  const groups: GroupChoices = {
    items:
      groupResult?.attempt === groupAttempt
        ? (groupResult.items ?? null)
        : null,
    error:
      groupResult?.attempt === groupAttempt ? (groupResult.error ?? "") : "",
    retry: () => setGroupAttempt((value) => value + 1),
  };

  function back() {
    if (!busyRef.current) setStep("choice");
  }
  function close() {
    if (!busyRef.current) onClose();
  }
  async function saveEnrollment(savedPlan: PatientPlan, groupId: string) {
    const group = groups.items?.find(
      (item) =>
        item.id === groupId &&
        item.active &&
        savedPlan.services.some(
          (service) => service.serviceId === item.serviceId,
        ),
    );
    if (!canEnroll || !group)
      throw new Error(
        "Escolha uma turma compatível disponível para concluir a matrícula.",
      );
    const saved = await api.createGroupEnrollment({
      patientId: patient.id,
      groupId,
    });
    setEnrollment(saved);
    setEnrollmentGroup(group);
    setPendingGroup("");
    setEnrollmentError("");
    setStep("choice");
  }
  async function retryEnrollment(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || !plan) return;
    setFlowBusy(true);
    setEnrollmentError("");
    try {
      await saveEnrollment(plan, pendingGroup);
    } catch (cause) {
      setEnrollmentError((cause as Error).message);
    } finally {
      setFlowBusy(false);
    }
  }
  const allowed =
    step === "plan"
      ? canPlan
      : step === "appointment"
        ? canAppointment
        : step === "enrollment"
          ? canEnroll
          : true;
  const title = {
    choice: "Cliente cadastrado",
    plan: "Vincular a plano",
    appointment: "Agendar atendimento",
    enrollment: "Concluir matrícula",
  }[step];
  return (
    <Modal
      key={step}
      title={title}
      eyebrow="Próximos passos"
      subtitle={
        step === "choice"
          ? "Escolha como continuar. O cadastro já está salvo."
          : "O cliente já está cadastrado. Você pode voltar para escolher outra ação."
      }
      initialFocus={
        step === "choice"
          ? "[data-next-step-action]"
          : "select:not(:disabled), input:not(:disabled), button[type=submit]:not(:disabled)"
      }
      busy={busy}
      onClose={close}
    >
      {step === "choice" ? (
        <div className="next-step-content">
          <FixedPatient patient={patient} />
          <div className="next-step-options">
            {(canPlan || plan) && (
              <section className="next-step-card">
                <PackageOpen size={24} aria-hidden="true" />
                <h3>{plan ? "Plano vinculado" : "Vincular a plano"}</h3>
                {plan ? (
                  <>
                    <p>
                      {plan.name} ·{" "}
                      {currency.format(plan.totalValueInCents / 100)}
                    </p>
                    {enrollment && (
                      <p role="status">
                        {enrollment.status === "waitlisted"
                          ? `Na lista de espera de ${enrollmentGroup?.name ?? "turma"}${enrollment.queuePosition ? ` · posição ${enrollment.queuePosition}` : ""}`
                          : `Matriculado na turma ${enrollmentGroup?.name ?? "escolhida"}`}
                      </p>
                    )}
                    {pendingGroup && (
                      <>
                        <p>Matrícula não concluída.</p>
                        {canEnroll && (
                          <button
                            type="button"
                            className="secondary-button"
                            data-next-step-action
                            onClick={() => setStep("enrollment")}
                          >
                            Retomar matrícula
                          </button>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p>
                      Escolha um plano e, se quiser, uma turma para o cliente.
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      data-next-step-action
                      onClick={() => setStep("plan")}
                    >
                      Vincular a plano
                    </button>
                  </>
                )}
              </section>
            )}
            {(canAppointment || appointments) && (
              <section className="next-step-card">
                <CalendarDays size={24} aria-hidden="true" />
                <h3>
                  {appointments
                    ? "Atendimento agendado"
                    : "Agendar atendimento"}
                </h3>
                {appointments ? (
                  <div role="status">
                    {appointments.map((appointment) => (
                      <p key={appointment.id}>
                        {appointment.serviceName} ·{" "}
                        {shortDate.format(new Date(appointment.startsAt))} às{" "}
                        {timeLabel.format(new Date(appointment.startsAt))}
                      </p>
                    ))}
                  </div>
                ) : (
                  <>
                    <p>
                      Marque um atendimento, uma avaliação ou uma aula
                      experimental.
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      data-next-step-action
                      onClick={() => setStep("appointment")}
                    >
                      Agendar atendimento
                    </button>
                  </>
                )}
              </section>
            )}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="primary-button"
              data-next-step-action
              onClick={close}
            >
              Concluir
            </button>
          </div>
        </div>
      ) : !allowed ? (
        <div className="next-step-content">
          <p className="muted-copy">Seu acesso não permite mais esta ação.</p>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={back}>
              Voltar
            </button>
          </div>
        </div>
      ) : step === "enrollment" && plan ? (
        <form className="form-grid" onSubmit={retryEnrollment}>
          <FixedPatient patient={patient} />
          <p className="success-banner span-2" role="status">
            Plano vinculado; matrícula não concluída. {plan.name}
          </p>
          <PlanGroupPicker
            groups={groups}
            services={plan.services}
            value={pendingGroup}
            onChange={setPendingGroup}
            disabled={busy}
          />
          {enrollmentError && (
            <p className="form-error span-2" role="alert">
              {enrollmentError}
            </p>
          )}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={back}
            >
              Voltar
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setPendingGroup("");
                setEnrollmentError("");
                setStep("choice");
              }}
            >
              Continuar sem turma
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={
                busy ||
                Boolean(groups.error) ||
                !groups.items?.some(
                  (group) =>
                    group.id === pendingGroup &&
                    group.active &&
                    plan.services.some(
                      (item) => item.serviceId === group.serviceId,
                    ),
                )
              }
            >
              {busy ? "Matriculando…" : "Tentar matrícula novamente"}
            </button>
          </div>
        </form>
      ) : resourceError || !resources ? (
        <div className="next-step-content">
          <FixedPatient patient={patient} />
          {resourceError ? (
            <div className="form-error" role="alert">
              {resourceError}{" "}
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => setResourceAttempt((value) => value + 1)}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <LoadingBlock />
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={back}>
              Voltar
            </button>
          </div>
        </div>
      ) : step === "plan" ? (
        <PlanForm
          patients={[patient]}
          fixedPatient={patient}
          services={resources.services}
          groups={canEnroll ? groups : undefined}
          onCancel={back}
          onBusyChange={setFlowBusy}
          onSubmit={async (input, groupId) => {
            const saved = await api.createPlan(input);
            setPlan(saved);
            if (groupId) {
              setPendingGroup(groupId);
              try {
                await saveEnrollment(saved, groupId);
              } catch (cause) {
                setEnrollmentError((cause as Error).message);
                setStep("enrollment");
              }
            } else setStep("choice");
          }}
        />
      ) : !resources.services.length ||
        !resources.professionals.length ||
        !resources.rooms.length ? (
        <div className="next-step-content">
          <FixedPatient patient={patient} />
          <p className="muted-copy">
            Para agendar, é necessário ter um serviço, um profissional e uma
            sala ativos cadastrados.
          </p>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={back}>
              Voltar
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setResourceAttempt((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <AppointmentForm
          patients={[patient]}
          fixedPatient={patient}
          professionals={resources.professionals}
          rooms={resources.rooms}
          services={resources.services}
          onCancel={back}
          onBusyChange={setFlowBusy}
          onSubmit={async (input, recurrence) => {
            const saved = recurrence
              ? await api.createRecurringAppointments({
                  ...input,
                  ...recurrence,
                })
              : [await api.createAppointment(input)];
            setAppointments(saved);
            setStep("choice");
          }}
        />
      )}
    </Modal>
  );
}
