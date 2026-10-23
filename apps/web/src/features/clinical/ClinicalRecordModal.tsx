import type {
  ClinicalAppointmentOption,
  ClinicalRecord,
  ClinicalRecordInput,
} from "@crm/contracts";
import { Copy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { shortDate } from "../../shared/lib/formatting";
import { professionalWithCrefito } from "../contracts/index";
import { ClinicalAppointmentPicker } from "./ClinicalAppointmentPicker";

export function ClinicalRecordModal({
  record,
  appointments,
  initialAppointmentId,
  previousRecord,
  onClose,
  onSaved,
}: {
  record: ClinicalRecord | undefined;
  appointments: ClinicalAppointmentOption[];
  /** Sessão já escolhida (ex.: "Evoluir" numa pendência do prontuário). */
  initialAppointmentId?: string | undefined;
  /** Última evolução do cliente: oferece copiar o texto como ponto de partida. */
  previousRecord?: ClinicalRecord | undefined;
  onClose: () => void;
  onSaved: (record: ClinicalRecord) => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<ClinicalRecordInput>({
    appointmentId: record?.appointmentId ?? initialAppointmentId ?? "",
    subjective: record?.subjective ?? "",
    objective: record?.objective ?? "",
    assessment: record?.assessment ?? "",
    plan: record?.plan ?? "",
    painScale: record?.painScale,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(form);
  // O rascunho aceita etapas em branco, mas precisa do atendimento.
  const missing = useMissingFields(
    form.appointmentId ? [] : ["Atendimento"],
    "field-hint",
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(await api.saveClinicalRecord(form));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={record ? "Editar evolução" : "Nova evolução clínica"}
      subtitle="Registre informações objetivas e necessárias para a continuidade do cuidado."
      busy={loading}
      dirty={dirty}
      onClose={onClose}
    >
      {can(record ? "clinical.records_update" : "clinical.records_create") && (
        <form className="clinical-form" onSubmit={submit}>
          {record ? (
            <label>
              Atendimento
              <input
                readOnly
                value={`${shortDate.format(new Date(record.appointmentStartsAt))} · ${record.patientName}`}
              />
            </label>
          ) : (
            <ClinicalAppointmentPicker
              appointments={appointments}
              value={form.appointmentId}
              onChange={(appointmentId) => setForm({ ...form, appointmentId })}
            />
          )}
          {record && (
            <p className="muted-copy">
              Profissional:{" "}
              {professionalWithCrefito(
                record.professionalName,
                record.professionalCrefito,
              )}
            </p>
          )}
          {!record && previousRecord && (
            <div className="clinical-copy-previous">
              <span>
                Última evolução em{" "}
                {shortDate.format(new Date(previousRecord.appointmentStartsAt))}
              </span>
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() =>
                  setForm({
                    ...form,
                    subjective: previousRecord.subjective,
                    objective: previousRecord.objective,
                    assessment: previousRecord.assessment,
                    plan: previousRecord.plan,
                    painScale: previousRecord.painScale,
                  })
                }
              >
                <Copy size={15} /> Copiar da última evolução
              </button>
            </div>
          )}
          <p className="muted-copy">
            O rascunho pode ser salvo com qualquer etapa em branco; para
            finalizar, as quatro etapas precisam estar preenchidas.
          </p>
          <label>
            S — Subjetivo
            <small>Relato, sintomas e percepção do cliente.</small>
            <textarea
              rows={4}
              value={form.subjective}
              onChange={(event) =>
                setForm({ ...form, subjective: event.target.value })
              }
            />
          </label>
          <label>
            O — Objetivo
            <small>Achados, testes, medidas e intervenções realizadas.</small>
            <textarea
              rows={4}
              value={form.objective}
              onChange={(event) =>
                setForm({ ...form, objective: event.target.value })
              }
            />
          </label>
          <div className="clinical-form-row">
            <label>
              A — Avaliação
              <textarea
                rows={4}
                value={form.assessment}
                onChange={(event) =>
                  setForm({ ...form, assessment: event.target.value })
                }
              />
            </label>
            <label>
              P — Plano
              <textarea
                rows={4}
                value={form.plan}
                onChange={(event) =>
                  setForm({ ...form, plan: event.target.value })
                }
              />
            </label>
          </div>
          <label className="pain-field">
            Escala de dor <span>{form.painScale ?? "—"}/10</span>
            <input
              type="range"
              min="0"
              max="10"
              value={form.painScale ?? 0}
              onChange={(event) =>
                setForm({ ...form, painScale: Number(event.target.value) })
              }
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          {missing.hint}
          <div className="modal-actions">
            <ModalCancelButton disabled={loading}>Cancelar</ModalCancelButton>
            <button
              className="primary-button"
              disabled={loading || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {loading ? "Salvando…" : "Salvar rascunho"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
