import { useEffect, useState } from "react";
import {
  type GroupEnrollment,
  type GroupClass,
  type Patient,
  whatsappLink,
} from "@crm/contracts";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { ActionModal } from "../../shared/components/ActionModal";

/** Contato para oferecer a vaga: abrir o aviso nunca altera a matrícula. */
export function WaitlistContactModal({
  enrollment,
  group,
  canConfirm,
  onConfirmed,
  onClose,
}: {
  enrollment: GroupEnrollment | undefined;
  group: GroupClass | undefined;
  canConfirm: boolean;
  onConfirmed: () => Promise<void>;
  onClose: () => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!enrollment) return;
    let active = true;
    api
      .patient(enrollment.patientId)
      .then((value) => {
        if (active) setPatient(value);
      })
      .catch((cause: unknown) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [enrollment]);
  const available = Boolean(
    group?.active &&
    group.capacity > group.activeEnrollments &&
    enrollment?.status === "waitlisted",
  );
  return (
    <Modal
      title={enrollment?.patientName ?? "Lista de espera"}
      subtitle={group ? `Oferecer vaga · ${group.name}` : "Oferta de vaga"}
      onClose={onClose}
    >
      <div className="form-grid">
        {!available && (
          <p className="form-error span-2" role="alert">
            Esta vaga ou a inscrição na lista de espera não está mais
            disponível.
          </p>
        )}
        {error && <ErrorBanner error={error} />}
        {enrollment && !patient && !error && <LoadingBlock />}
        {patient && (
          <>
            <p className="span-2">
              Entre em contato com {patient.fullName} para oferecer a vaga.
              Confirme a matrícula somente depois que o cliente aceitar.
            </p>
            <p>Telefone: {patient.phone || "Não informado"}</p>
            <p>WhatsApp: {patient.whatsapp || "Não informado"}</p>
            {available && (patient.whatsapp || patient.phone) && (
              <a
                className="whatsapp-button span-2"
                target="_blank"
                rel="noopener noreferrer"
                href={whatsappLink(
                  patient.whatsapp || patient.phone,
                  `Olá, ${patient.fullName}! Surgiu uma vaga na turma ${group?.name}. Você tem interesse?`,
                )}
              >
                Oferecer vaga pelo WhatsApp
              </a>
            )}
          </>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton>Fechar</ModalCancelButton>
          {canConfirm && available && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setConfirm(true)}
            >
              Cliente aceitou: confirmar matrícula
            </button>
          )}
        </div>
      </div>
      {confirm && (
        <ActionModal
          eyebrow="Lista de espera"
          title="Confirmar matrícula?"
          subtitle={`O cliente aceitou a vaga na turma ${group?.name}?`}
          confirmLabel="Confirmar matrícula"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.confirmGroupEnrollment(enrollment!.id);
            await onConfirmed();
          }}
        />
      )}
    </Modal>
  );
}
