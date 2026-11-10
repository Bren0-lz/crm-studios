import type {
  PatientOption,
  WaitlistEntry,
  WaitlistKind,
  WaitlistOptions,
} from "@crm/contracts";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { PatientPicker } from "../../PatientPicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/** Inclui um cliente cadastrado na fila de um serviço ou de um produto. */
export function WaitlistEntryModal({
  options,
  onClose,
  onSaved,
}: {
  options: WaitlistOptions;
  onClose: () => void;
  onSaved: (entry: WaitlistEntry) => Promise<void>;
}) {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [kind, setKind] = useState<WaitlistKind>("service");
  const [itemId, setItemId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const kindLabelId = useId();
  const [error, setError] = useState("");
  const dirty = useFormDirty({ patientId, kind, itemId, notes });
  const missing = useMissingFields([
    ...(patientId ? [] : ["Cliente"]),
    ...(itemId ? [] : [kind === "service" ? "Serviço" : "Produto"]),
  ]);
  useEffect(() => {
    let alive = true;
    api
      .patientOptions()
      .then((items) => {
        if (alive) setPatients(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  function chooseKind(next: WaitlistKind) {
    setKind(next);
    setItemId("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || missing.blocked) return;
    setBusy(true);
    setError("");
    try {
      const entry = await api.createWaitlistEntry({
        patientId,
        kind,
        ...(kind === "service" ? { serviceId: itemId } : { productId: itemId }),
        notes,
      });
      await onSaved(entry);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Adicionar à lista de espera"
      subtitle="O cliente entra no fim da fila do serviço ou do produto escolhido."
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        {error && <ErrorBanner error={error} />}
        <PatientPicker
          patients={patients}
          value={patientId}
          onChange={setPatientId}
          required
        />
        <div className="waitlist-kind">
          <span id={kindLabelId}>Aguardando</span>
          <div className="segmented" role="group" aria-labelledby={kindLabelId}>
            <button
              type="button"
              className="segment-button"
              aria-pressed={kind === "service"}
              onClick={() => chooseKind("service")}
            >
              Turma de um serviço
            </button>
            <button
              type="button"
              className="segment-button"
              aria-pressed={kind === "product"}
              onClick={() => chooseKind("product")}
            >
              Reposição de produto
            </button>
          </div>
        </div>
        <label>
          {kind === "service" ? "Serviço" : "Produto"}
          <select
            required
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
          >
            <option value="">Selecione</option>
            {kind === "service"
              ? options.services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              : options.products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ·{" "}
                    {item.currentStock > 0
                      ? `${item.currentStock} em estoque`
                      : "sem estoque"}
                  </option>
                ))}
          </select>
        </label>
        <label>
          Observações
          <textarea
            maxLength={500}
            placeholder="Ex.: prefere turmas pela manhã"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {missing.hint}
        <div className="modal-actions">
          <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={busy || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            Adicionar à lista
          </button>
        </div>
      </form>
    </Modal>
  );
}
