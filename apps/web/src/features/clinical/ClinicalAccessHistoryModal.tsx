import type { ClinicalAccessEvent } from "@crm/contracts/clinical";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";

const actionLabels: Record<ClinicalAccessEvent["action"], string> = {
  read: "Consulta",
  export: "Exportação",
  upload: "Envio de arquivo",
  download: "Download de arquivo",
  addendum: "Adendo",
};

const eventDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function ClinicalAccessHistoryModal({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<ClinicalAccessEvent[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .clinicalAccessEvents(patientId)
      .then((result) => {
        if (active) setEvents(result);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [patientId, attempt]);

  return (
    <Modal
      title="Histórico de acessos"
      subtitle={patientName}
      onClose={onClose}
    >
      {error && (
        <>
          <ErrorBanner error={error} />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setError("");
              setAttempt((current) => current + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {!error && events === null && <LoadingBlock />}
      {events?.length === 0 && <p>Nenhum acesso registrado.</p>}
      {events && events.length > 0 && (
        <ol className="chart-timeline" aria-label="Ações registradas">
          {events.map((event) => (
            <li key={event.id}>
              <span className="chart-timeline-dot" aria-hidden="true" />
              <div>
                <span className="chart-timeline-kind">
                  {actionLabels[event.action]}
                </span>
                <strong>{event.actorName ?? "Usuário não identificado"}</strong>
                <small>
                  <time dateTime={event.createdAt}>
                    {eventDate.format(new Date(event.createdAt))}
                  </time>
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="modal-actions">
        <ModalCancelButton>Fechar</ModalCancelButton>
      </div>
    </Modal>
  );
}
