import type {
  AppointmentInput,
  AppointmentVisitType,
  Patient,
  PatientOption,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import { serviceAvailableFor } from "@crm/contracts";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ApiClientError } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { FixedPatient } from "../../shared/components/FixedPatient";
import {
  appointmentVisitTypes,
  currency,
  visitTypeLabels,
} from "../../shared/lib/formatting";
import { AppointmentPatientWarnings } from "./AppointmentPatientWarnings";
import { AppointmentPatientCreateModal } from "./AppointmentPatientCreateModal";
import {
  useConfirmDiscard,
  useModalDirty,
} from "../../shared/workflows/ModalGuardContext";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function AppointmentForm({
  patients,
  professionals,
  rooms,
  services,
  fixedPatient,
  onCancel,
  onBusyChange,
  onSubmit,
  onPatientCreated,
  onNestedModalChange,
  initialSlot,
}: {
  patients: PatientOption[];
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
  fixedPatient?: PatientOption | undefined;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onSubmit: (
    input: AppointmentInput,
    recurrence?: { occurrences: number; intervalWeeks: number },
  ) => Promise<void>;
  onPatientCreated?: (patient: Patient) => void;
  onNestedModalChange?: (open: boolean) => void;
  initialSlot?: { professionalId: string; startsAt: string } | undefined;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState({
    patientId: fixedPatient?.id ?? "",
    visitType: "" as AppointmentVisitType | "",
    professionalId: initialSlot?.professionalId ?? "",
    roomId: "",
    serviceId: "",
    startsAt: initialSlot?.startsAt ?? "",
    notes: "",
    recurring: can("agenda.recurring") && !can("agenda.create"),
    occurrences: 4,
    intervalWeeks: 1,
  });
  // Só os serviços atendidos pelo profissional e pela sala escolhidos (U10).
  const availableServices = services.filter((item) =>
    serviceAvailableFor(item, form.professionalId, form.roomId),
  );
  function keepAvailableService(next: typeof form) {
    const service = services.find((item) => item.id === next.serviceId);
    return service &&
      !serviceAvailableFor(service, next.professionalId, next.roomId)
      ? { ...next, serviceId: "" }
      : next;
  }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useModalDirty(useFormDirty(form));
  const confirmDiscard = useConfirmDiscard();
  const submitting = useRef(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    null,
  );
  const [pickerVersion, setPickerVersion] = useState(0);
  const patientInputRef = useRef<HTMLInputElement>(null);
  const patientChoices =
    selectedPatient &&
    !patients.some((patient) => patient.id === selectedPatient.id)
      ? [...patients, selectedPatient]
      : patients;
  function closePatientModal() {
    setPatientModalOpen(false);
    onNestedModalChange?.(false);
    requestAnimationFrame(() => patientInputRef.current?.focus());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!form.patientId) {
      setError("Selecione um cliente para confirmar o atendimento.");
      patientInputRef.current?.focus();
      return;
    }
    submitting.current = true;
    setLoading(true);
    onBusyChange(true);
    setError("");
    try {
      const input: AppointmentInput = {
        patientId: form.patientId,
        professionalId: form.professionalId,
        roomId: form.roomId,
        serviceId: form.serviceId,
        startsAt: new Date(form.startsAt).toISOString(),
        notes: form.notes,
        visitType: form.visitType as AppointmentVisitType,
      };
      await onSubmit(
        input,
        form.recurring
          ? { occurrences: form.occurrences, intervalWeeks: form.intervalWeeks }
          : undefined,
      );
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível agendar.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
      onBusyChange(false);
    }
  }
  return (
    <>
      {(can("agenda.create") || can("agenda.recurring")) && (
        <form className="form-grid" onSubmit={submit}>
          <fieldset className="form-fields form-grid span-2" disabled={loading}>
            {fixedPatient ? (
              <FixedPatient patient={fixedPatient} />
            ) : (
              <div>
                <PatientPicker
                  required
                  key={pickerVersion}
                  patients={patientChoices}
                  value={form.patientId}
                  inputRef={patientInputRef}
                  disabled={loading}
                  onAddPatient={
                    can("patients.create") && onPatientCreated
                      ? () => {
                          setPatientModalOpen(true);
                          onNestedModalChange?.(true);
                        }
                      : undefined
                  }
                  onChange={(patientId, patient) => {
                    if (patient) setSelectedPatient(patient);
                    setForm((current) => ({ ...current, patientId }));
                  }}
                />
              </div>
            )}
            <AppointmentPatientWarnings
              patient={
                fixedPatient ??
                patientChoices.find((item) => item.id === form.patientId)
              }
              checkPlan={form.visitType === "regular"}
            />
            <label>
              Tipo
              <select
                autoFocus={Boolean(fixedPatient)}
                required
                value={form.visitType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    visitType: e.target.value as AppointmentVisitType,
                  })
                }
              >
                <option value="">Selecione</option>
                {appointmentVisitTypes.map((item) => (
                  <option value={item} key={item}>
                    {visitTypeLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={form.recurring}
                disabled={!can("agenda.create") || !can("agenda.recurring")}
                onChange={(e) =>
                  setForm({ ...form, recurring: e.target.checked })
                }
              />
              Repetir este atendimento
            </label>
            {form.recurring && (
              <>
                <label>
                  Número de ocorrências
                  <input
                    type="number"
                    min={2}
                    max={52}
                    value={form.occurrences}
                    onChange={(e) =>
                      setForm({ ...form, occurrences: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Intervalo
                  <select
                    value={form.intervalWeeks}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        intervalWeeks: Number(e.target.value),
                      })
                    }
                  >
                    <option value={1}>Toda semana</option>
                    <option value={2}>A cada 2 semanas</option>
                    <option value={3}>A cada 3 semanas</option>
                    <option value={4}>A cada 4 semanas</option>
                  </select>
                </label>
              </>
            )}
            <label>
              Profissional
              <select
                required
                value={form.professionalId}
                onChange={(e) =>
                  setForm(
                    keepAvailableService({
                      ...form,
                      professionalId: e.target.value,
                    }),
                  )
                }
              >
                <option value="">Selecione</option>
                {professionals.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sala
              <select
                required
                value={form.roomId}
                onChange={(e) =>
                  setForm(
                    keepAvailableService({ ...form, roomId: e.target.value }),
                  )
                }
              >
                <option value="">Selecione</option>
                {rooms.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Serviço
              <select
                required
                value={form.serviceId}
                onChange={(e) =>
                  setForm({ ...form, serviceId: e.target.value })
                }
              >
                <option value="">Selecione</option>
                {availableServices.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · {currency.format(item.priceInCents / 100)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <AppointmentDateTimePicker
                value={form.startsAt}
                onChange={(startsAt) =>
                  setForm((current) => ({ ...current, startsAt }))
                }
                professionalId={form.professionalId}
                roomId={form.roomId}
                disabled={loading}
              />
            </div>
            <label className="span-2">
              Observação
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </label>
          </fieldset>
          {error && (
            <div className="form-error span-2" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={() => confirmDiscard(onCancel)}
              disabled={loading}
            >
              {fixedPatient ? "Voltar" : "Cancelar"}
            </button>
            <button
              className="primary-button"
              disabled={loading || !form.patientId}
            >
              {loading ? "Agendando…" : "Confirmar atendimento"}
            </button>
          </div>
        </form>
      )}
      {patientModalOpen &&
        createPortal(
          <AppointmentPatientCreateModal
            onClose={closePatientModal}
            onSaved={(patient) => {
              onPatientCreated?.(patient);
              setSelectedPatient(patient);
              setPickerVersion((version) => version + 1);
              setForm((current) => ({ ...current, patientId: patient.id }));
              closePatientModal();
            }}
          />,
          document.body,
        )}
    </>
  );
}
