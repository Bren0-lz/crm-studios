import {
  agendaNoteInputSchema,
  agendaNotePalette,
  type AgendaNote,
  type AgendaNoteScope,
  type Professional,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import {
  localIsoDate,
  toLocalDateTimeInput,
} from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function AgendaNoteModal({
  date,
  note,
  professionals,
  currentProfessionalId,
  ownProfessionalId,
  onClose,
  onSaved,
}: {
  date: Date;
  note?: AgendaNote | undefined;
  professionals: Professional[];
  currentProfessionalId: string;
  ownProfessionalId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const start = note
    ? toLocalDateTimeInput(new Date(note.startsAt))
    : `${localIsoDate(date)}T09:00`;
  const end = note
    ? toLocalDateTimeInput(new Date(note.endsAt))
    : `${localIsoDate(date)}T10:00`;
  const [form, setForm] = useState({
    description: note?.description ?? "",
    date: start.slice(0, 10),
    startTime: start.slice(11, 16),
    endTime: end.slice(11, 16),
    professionalId:
      note?.professionalId ?? ownProfessionalId ?? currentProfessionalId,
    target: note && note.professionalId === null ? "all" : "current",
    backgroundColor: note?.backgroundColor ?? "#64748b",
    repeat: false,
    until: start.slice(0, 10),
    weekdays: [new Date(`${start.slice(0, 10)}T12:00`).getDay()],
  });
  const [scope, setScope] = useState<AgendaNoteScope | "">(
    note?.seriesId ? "" : "this",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useFormDirty(form);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const input = agendaNoteInputSchema.parse({
        description: form.description,
        professionalId: form.target === "all" ? null : form.professionalId,
        startsAt: new Date(`${form.date}T${form.startTime}`).toISOString(),
        endsAt: new Date(`${form.date}T${form.endTime}`).toISOString(),
        backgroundColor: form.backgroundColor,
        ...(form.repeat
          ? { repeat: { until: form.until, weekdays: form.weekdays } }
          : {}),
      });
      if (note) {
        if (!scope) throw new Error("Escolha quais notas editar.");
        await api.updateAgendaNote(note.id, input, scope);
      } else await api.createAgendaNotes(input);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error && "issues" in cause
          ? "Confira os campos da nota, os horários e os dias da repetição."
          : (cause as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={note ? "Editar nota" : "Nova nota"}
      subtitle="Uma anotação na agenda, sem reservar um atendimento."
      eyebrow="Agenda"
      onClose={onClose}
      busy={busy}
      dirty={dirty}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Descrição
          <textarea
            required
            maxLength={300}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <label>
          Data
          <input
            type="date"
            required
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
          />
        </label>
        <label>
          Hora inicial
          <input
            type="time"
            required
            value={form.startTime}
            onChange={(event) =>
              setForm({ ...form, startTime: event.target.value })
            }
          />
        </label>
        <label>
          Hora final
          <input
            type="time"
            required
            value={form.endTime}
            onChange={(event) =>
              setForm({ ...form, endTime: event.target.value })
            }
          />
        </label>
        <label>
          Cor do fundo
          <select
            value={form.backgroundColor}
            onChange={(event) =>
              setForm({
                ...form,
                backgroundColor: event.target
                  .value as typeof form.backgroundColor,
              })
            }
          >
            {agendaNotePalette.map((item) => (
              <option key={item.color} value={item.color}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Para quem mostrar
          <select
            value={form.target}
            onChange={(event) =>
              setForm({ ...form, target: event.target.value })
            }
          >
            <option value="current">Profissional atual</option>
            {!ownProfessionalId && (
              <option value="all">Todos os profissionais</option>
            )}
          </select>
        </label>
        {form.target === "current" && !ownProfessionalId && (
          <label>
            Profissional
            <select
              required
              value={form.professionalId}
              onChange={(event) =>
                setForm({ ...form, professionalId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {professionals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        {!note && (
          <label className="checkbox-field span-2">
            <input
              type="checkbox"
              checked={form.repeat}
              onChange={(event) =>
                setForm({ ...form, repeat: event.target.checked })
              }
            />
            Repetir nota
          </label>
        )}
        {form.repeat && (
          <>
            <label>
              Repetir até
              <input
                type="date"
                required
                min={form.date}
                value={form.until}
                onChange={(event) =>
                  setForm({ ...form, until: event.target.value })
                }
              />
            </label>
            <fieldset className="span-2 agenda-note-weekdays">
              <legend>Dias da semana</legend>
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                (day, index) => (
                  <label className="checkbox-field" key={day}>
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(index)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          weekdays: event.target.checked
                            ? [...form.weekdays, index]
                            : form.weekdays.filter((value) => value !== index),
                        })
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </fieldset>
            <p className="span-2">
              Até 120 ocorrências, incluindo a primeira nota.
            </p>
          </>
        )}
        {note?.seriesId && (
          <NoteScopeSelect value={scope} onChange={setScope} />
        )}
        {error && (
          <p className="form-error span-2" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar nota"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NoteScopeSelect({
  value,
  onChange,
}: {
  value: AgendaNoteScope | "";
  onChange: (scope: AgendaNoteScope) => void;
}) {
  return (
    <label className="span-2">
      Aplicar a
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as AgendaNoteScope)}
      >
        <option value="" disabled>
          Escolha as ocorrências
        </option>
        <option value="this">Só esta</option>
        <option value="following">Esta e as próximas</option>
      </select>
    </label>
  );
}
