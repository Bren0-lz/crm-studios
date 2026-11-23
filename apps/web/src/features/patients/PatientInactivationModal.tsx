import { useState } from "react";
import { type Patient } from "@crm/contracts";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { plural } from "../../shared/lib/formatting";

const maxSelected = 1000;

export function PatientInactivationModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (result: { changed: number; skipped: number }) => void;
}) {
  const [months, setMonths] = useState("12");
  const [candidates, setCandidates] = useState<Patient[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState("");

  async function loadPreview() {
    setBusy("preview");
    setError("");
    setCandidates(null);
    setSelected([]);
    try {
      setCandidates(await api.previewPatientInactivation(Number(months)));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("save");
    setError("");
    try {
      onSaved(await api.inactivatePatients(Number(months), selected));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      title="Inativar clientes em lote"
      subtitle="Consulte os cadastros elegíveis pelo período antes de escolher quem inativar."
      initialFocus="#patient-inactivation-months"
      busy={busy !== null}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void loadPreview();
        }}
      >
        <label className="span-2">
          Meses sem atividade
          <input
            id="patient-inactivation-months"
            type="number"
            required
            min={3}
            max={120}
            value={months}
            disabled={busy !== null}
            onChange={(event) => {
              setMonths(event.target.value);
              setCandidates(null);
              setSelected([]);
              setError("");
            }}
          />
        </label>
        <div className="span-2">
          <button
            type="submit"
            className="secondary-button"
            disabled={busy !== null}
          >
            {busy === "preview" ? "Consultando…" : "Ver prévia"}
          </button>
        </div>
      </form>

      {error && <ErrorBanner error={error} />}
      {candidates?.length === 0 && (
        <p role="status">Nenhum cliente elegível para o período informado.</p>
      )}
      {candidates && candidates.length > 0 && (
        <fieldset className="form-fieldset" disabled={busy !== null}>
          <legend>Clientes elegíveis</legend>
          {candidates.length > maxSelected && (
            <p>Você pode selecionar até 1.000 clientes por vez.</p>
          )}
          {candidates.map((patient) => {
            const checked = selected.includes(patient.id);
            return (
              <label className="checkbox-field" key={patient.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selected.length >= maxSelected}
                  onChange={(event) => {
                    const isSelected = event.target.checked;
                    setSelected((current) =>
                      isSelected
                        ? [...current, patient.id]
                        : current.filter((id) => id !== patient.id),
                    );
                  }}
                />
                {patient.fullName}
                {patient.recordNumber ? ` · ${patient.recordNumber}` : ""}
              </label>
            );
          })}
          <p role="status">
            {plural(
              selected.length,
              "cliente selecionado",
              "clientes selecionados",
            )}
          </p>
        </fieldset>
      )}
      <div className="modal-actions">
        <ModalCancelButton disabled={busy !== null}>Cancelar</ModalCancelButton>
        <button
          type="button"
          className="danger-button"
          disabled={selected.length === 0 || busy !== null}
          onClick={() => void confirm()}
        >
          {busy === "save" ? "Inativando…" : "Confirmar inativação"}
        </button>
      </div>
    </Modal>
  );
}
