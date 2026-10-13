import type { ClinicalRecord, ClinicalRecordRevision } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";

export function ClinicalHistoryModal({
  record,
  onClose,
}: {
  record: ClinicalRecord;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<ClinicalRecordRevision[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .clinicalRecordRevisions(record.id)
      .then((data) => {
        if (active) setRevisions(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [record.id]);
  return (
    <Modal
      title={`Histórico · ${record.patientName}`}
      subtitle="Cada salvamento gera uma versão preservada para auditoria."
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {!error && revisions.length === 0 ? (
        <LoadingBlock />
      ) : (
        <div className="revision-list">
          {revisions.map((revision) => (
            <article key={revision.id}>
              <div>
                <strong>Versão {revision.version}</strong>
                <span className={`status-pill ${revision.status}`}>
                  {revision.status === "finalized" ? "Finalizada" : "Rascunho"}
                </span>
              </div>
              <small>
                {revision.authorName} ·{" "}
                {new Date(revision.createdAt).toLocaleString("pt-BR")}
              </small>
              <p>
                {revision.assessment ||
                  "Sem avaliação registrada nesta versão."}
              </p>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
