import type { Appointment, IssuedDocument } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import {
  issueDocumentForSignature,
  SignatureSendStep,
  SignatureTemplateField,
  useCanRequestSignature,
  useSignatureTemplates,
  type SignatureRequest,
} from "../contracts/index";
import { AppointmentForm } from "./AppointmentForm";
import type { AppointmentModalProps } from "./types";

export function AppointmentModal({
  onClose,
  onCreated,
  ...props
}: AppointmentModalProps) {
  const [busy, setBusy] = useState(false);
  const [inactive, setInactive] = useState(false);
  const canSign = useCanRequestSignature();
  const templates = useSignatureTemplates(canSign);
  const [signature, setSignature] = useState<SignatureRequest | null>(null);
  // Atendimento salvo com documento: o modal passa para o envio do link de assinatura.
  const [sending, setSending] = useState<{
    appointments: Appointment[];
    prepare: () => Promise<IssuedDocument>;
  } | null>(null);
  return (
    <Modal
      title="Novo atendimento"
      subtitle={
        sending
          ? `Atendimento agendado. Envie o documento para ${sending.appointments[0]?.patientName ?? "o cliente"} assinar.`
          : "A duração e o valor seguem o serviço selecionado."
      }
      busy={busy}
      inactive={inactive}
      onClose={sending ? () => onCreated(sending.appointments) : onClose}
    >
      {sending ? (
        <SignatureSendStep
          prepare={sending.prepare}
          onBusyChange={setBusy}
          onDone={() => onCreated(sending.appointments)}
        />
      ) : (
        <AppointmentForm
          {...props}
          offerPromotions
          onCancel={onClose}
          onBusyChange={setBusy}
          onNestedModalChange={setInactive}
          additionalDirty={Boolean(signature)}
          additional={
            canSign && (
              <SignatureTemplateField
                state={templates}
                value={signature}
                onChange={setSignature}
              />
            )
          }
          onSubmit={async (input, recurrence) => {
            const appointments = recurrence
              ? await api.createRecurringAppointments({
                  ...input,
                  ...recurrence,
                })
              : [await api.createAppointment(input)];
            if (!signature) return onCreated(appointments);
            setSending({
              appointments,
              prepare: () =>
                issueDocumentForSignature({
                  ...signature,
                  patientId: input.patientId,
                  professionalId: input.professionalId,
                }),
            });
          }}
        />
      )}
    </Modal>
  );
}
