import {
  type Patient,
  type PatientMergePreview,
  patientProfileLabels,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { PatientPicker } from "../../PatientPicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";

export function PatientManagementModal({
  mode,
  patients,
  onClose,
  onSaved,
}: {
  mode: "merge" | "inactive";
  patients: Patient[];
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [months, setMonths] = useState(3);
  const [merge, setMerge] = useState<PatientMergePreview | null>(null);
  const [candidates, setCandidates] = useState<Patient[] | null>(null);
  const [choices, setChoices] = useState<Record<string, "source" | "target">>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function preview(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "merge") {
        setMerge(await api.previewPatientMerge(sourceId, targetId));
        setChoices({});
      } else setCandidates(await api.previewInactivePatients(months));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (merge) {
        await api.mergePatients({ sourceId, targetId, fieldSources: choices });
        onSaved("Cadastros mesclados. Os históricos foram preservados.");
      } else if (candidates) {
        const result = await api.inactivatePatients(
          months,
          candidates.map((item) => item.id),
        );
        onSaved(
          `${result.changed} cliente(s) inativado(s); ${result.skipped} protegido(s) após nova verificação.`,
        );
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fieldLabel = (key: string) =>
    patientProfileLabels[key as keyof typeof patientProfileLabels] ??
    (
      {
        fullName: "Nome",
        phone: "Telefone",
        cpf: "CPF",
        email: "E-mail",
        birthDate: "Nascimento",
        whatsapp: "WhatsApp",
        emergencyContactName: "Contato de emergência",
        emergencyContactPhone: "Telefone de emergência",
      } as Record<string, string>
    )[key] ??
    key;
  return (
    <Modal
      title={
        mode === "merge" ? "Mesclar clientes" : "Inativar clientes antigos"
      }
      subtitle="Revise a prévia antes de confirmar a alteração."
      busy={busy}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {!merge && !candidates ? (
        <form className="clinical-form" onSubmit={preview}>
          {mode === "merge" ? (
            <>
              <label>
                Cadastro duplicado
                <PatientPicker
                  patients={patients}
                  value={sourceId}
                  onChange={setSourceId}
                  required
                />
              </label>
              <label>
                Cadastro principal
                <PatientPicker
                  patients={patients.filter((item) => item.id !== sourceId)}
                  value={targetId}
                  onChange={setTargetId}
                  required
                />
              </label>
            </>
          ) : (
            <>
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
                Clientes com plano vigente ou atendimento futuro serão
                protegidos.
              </p>
            </>
          )}
          <div className="modal-actions">
            <button className="primary-button" disabled={busy}>
              Visualizar prévia
            </button>
          </div>
        </form>
      ) : (
        <div className="clinical-form">
          {merge ? (
            <>
              <p>
                <strong>{merge.source.fullName}</strong> será unificado em{" "}
                <strong>{merge.target.fullName}</strong>. Etiquetas, interesses
                e históricos serão preservados.
              </p>
              {merge.conflicts.map((message) => (
                <p className="form-error" key={message}>
                  {message}
                </p>
              ))}
              {merge.fields.map((field) => (
                <label key={field.key}>
                  {fieldLabel(field.key)}
                  <select
                    required
                    value={choices[field.key] ?? ""}
                    onChange={(event) =>
                      setChoices({
                        ...choices,
                        [field.key]: event.target.value as "source" | "target",
                      })
                    }
                  >
                    <option value="">Escolha o dado que deve prevalecer</option>
                    <option value="target">Principal: {field.target}</option>
                    <option value="source">Duplicado: {field.source}</option>
                  </select>
                </label>
              ))}
            </>
          ) : (
            <>
              <p>{candidates?.length ?? 0} cliente(s) serão inativados.</p>
              {candidates?.map((patient) => (
                <p key={patient.id}>
                  {patient.fullName} · {patient.recordNumber}
                </p>
              ))}
            </>
          )}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setMerge(null);
                setCandidates(null);
              }}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              disabled={
                busy ||
                (merge
                  ? merge.conflicts.length > 0 ||
                    merge.fields.some((field) => !choices[field.key])
                  : !candidates?.length)
              }
              onClick={() => void confirm()}
            >
              Confirmar {merge ? "mesclagem" : "inativação"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
