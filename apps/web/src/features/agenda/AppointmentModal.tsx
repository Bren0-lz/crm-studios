import { useState } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { AppointmentForm } from "./AppointmentForm";
import type { AppointmentModalProps } from "./types";

export function AppointmentModal({
  onClose,
  onCreated,
  ...props
}: AppointmentModalProps) {
  const [busy, setBusy] = useState(false);
  const [inactive, setInactive] = useState(false);
  return (
    <Modal
      title="Novo atendimento"
      subtitle="A duração e o valor seguem o serviço selecionado."
      busy={busy}
      inactive={inactive}
      onClose={onClose}
    >
      <AppointmentForm
        {...props}
        offerPromotions
        onCancel={onClose}
        onBusyChange={setBusy}
        onNestedModalChange={setInactive}
        onSubmit={async (input, recurrence) => {
          onCreated(
            recurrence
              ? await api.createRecurringAppointments({
                  ...input,
                  ...recurrence,
                })
              : [await api.createAppointment(input)],
          );
        }}
      />
    </Modal>
  );
}
