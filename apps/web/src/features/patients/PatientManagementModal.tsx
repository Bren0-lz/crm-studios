import type { Patient } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";

export function PatientManagementModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const [months, setMonths] = useState(3);
  const [candidates, setCandidates] = useState<Patient[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function preview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCandidates(await api.previewInactivePatients(months));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!candidates) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.inactivatePatients(
        months,
        candidates.map((item) => item.id),
      );
      onSaved(
        `${result.changed} cliente(s) inativado(s); ${result.skipped} protegido(s) após nova verificação.`,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Inativar clientes antigos"
      subtitle="Revise a prévia antes de confirmar a alteração."
      busy={busy}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {!candidates ? (
        <form className="clinical-form" onSubmit={preview}>
          <label>
            Meses sem atendimentos
            <input
              type="number"
              min={3}
              max={120}
              required
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
            />
          </label>
          <p>
            Clientes com plano vigente ou atendimento futuro serão protegidos.
          </p>
          <div className="modal-actions">
            <button className="primary-button" disabled={busy}>
              Visualizar prévia
            </button>
          </div>
        </form>
      ) : (
        <div className="clinical-form">
          <p>{candidates.length} cliente(s) serão inativados.</p>
          {candidates.map((patient) => (
            <p key={patient.id}>
              {patient.fullName} · {patient.recordNumber}
            </p>
          ))}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setCandidates(null)}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              disabled={busy || !candidates.length}
              onClick={() => void confirm()}
            >
              Confirmar inativação
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
