import type {
  Appointment,
  Patient,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import type { DashboardAppointmentAction } from "../../shared/lib/types";
import {
  AppointmentDetailsModal,
  AppointmentRescheduleHistoryModal,
  AppointmentRescheduleModal,
} from "../agenda/index";

export function DashboardAppointmentDialog({
  action,
  onClose,
  onReschedule,
  onUpdated,
}: {
  action: DashboardAppointmentAction;
  onClose: () => void;
  onReschedule: () => void;
  onUpdated: (appointment: Appointment) => void;
}) {
  const { canView, canEdit } = useAuthorization();
  const canSeePatients = canView("patients");
  const [resources, setResources] = useState<{
    patient: Patient | undefined;
    service: Service | undefined;
    professionals: Professional[];
    rooms: Room[];
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { appointment, kind } = action;

  useEffect(() => {
    // Histórico e edição (QM7) carregam os próprios dados.
    if (kind === "history" || kind === "edit") return;
    let active = true;
    Promise.all([
      kind !== "reschedule" && !appointment.leadId && canSeePatients
        ? api.patients()
        : Promise.resolve([]),
      api.services(),
      kind === "reschedule" ? api.professionals() : Promise.resolve([]),
      kind === "reschedule" ? api.rooms() : Promise.resolve([]),
    ])
      .then(([patients, services, professionals, rooms]) => {
        if (active)
          setResources({
            patient: patients.find((item) => item.id === appointment.patientId),
            service: services.find((item) => item.id === appointment.serviceId),
            professionals,
            rooms,
          });
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os dados do atendimento.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    appointment.patientId,
    appointment.leadId,
    appointment.serviceId,
    kind,
    canSeePatients,
    retry,
  ]);

  if (kind === "history")
    return (
      <AppointmentRescheduleHistoryModal
        appointment={appointment}
        onClose={onClose}
      />
    );
  if (kind === "edit")
    // Abre direto na edição da QM6: fechar ou salvar fecha tudo.
    return (
      <AppointmentDetailsModal
        appointment={appointment}
        patient={undefined}
        service={undefined}
        editable={canEdit("agenda")}
        initialEditing
        onClose={onClose}
        onReschedule={onReschedule}
        onUpdated={onUpdated}
        onEdited={onUpdated}
      />
    );
  if (!resources)
    return (
      <Modal
        title={
          kind === "reschedule"
            ? "Reagendar atendimento"
            : "Detalhes do atendimento"
        }
        subtitle={appointment.patientName}
        onClose={onClose}
      >
        {error ? (
          <>
            <ErrorBanner error={error} />
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                setRetry((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <LoadingBlock />
        )}
      </Modal>
    );
  if (kind === "reschedule")
    return (
      <AppointmentRescheduleModal
        appointment={appointment}
        service={resources.service}
        professionals={resources.professionals}
        rooms={resources.rooms}
        onClose={onClose}
        onSaved={onUpdated}
      />
    );
  return (
    <AppointmentDetailsModal
      appointment={appointment}
      patient={canSeePatients ? resources.patient : undefined}
      service={resources.service}
      editable={canEdit("agenda")}
      initialCancelConfirmation={kind === "cancel"}
      onClose={onClose}
      onReschedule={onReschedule}
      onUpdated={onUpdated}
      onEdited={onUpdated}
    />
  );
}
