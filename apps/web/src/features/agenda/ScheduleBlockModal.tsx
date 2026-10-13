import type { Professional, Room, ScheduleBlock } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";

export function ScheduleBlockModal({
  date,
  professionals,
  rooms,
  onClose,
  onCreated,
}: {
  date: Date;
  professionals: Professional[];
  rooms: Room[];
  onClose: () => void;
  onCreated: (block: ScheduleBlock) => void;
}) {
  const { can } = useAuthorization();
  const initialStart = new Date(date);
  initialStart.setHours(12, 0, 0, 0);
  const initialEnd = new Date(initialStart);
  initialEnd.setHours(13, 0, 0, 0);
  const [form, setForm] = useState({
    target: "professional" as "professional" | "room",
    targetId: professionals[0]?.id ?? "",
    startsAt: toLocalDateTimeInput(initialStart),
    endsAt: toLocalDateTimeInput(initialEnd),
    reason: "Horário indisponível",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onCreated(
        await api.createScheduleBlock({
          ...(form.target === "professional"
            ? { professionalId: form.targetId }
            : { roomId: form.targetId }),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          reason: form.reason,
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const targets = form.target === "professional" ? professionals : rooms;
  return (
    <Modal
      title="Bloquear horário"
      subtitle="Impeça novos agendamentos durante uma indisponibilidade."
      busy={loading}
      onClose={onClose}
    >
      {can("agenda.blocks_create") && (
        <form className="form-grid" onSubmit={submit}>
          <label>
            Tipo
            <select
              value={form.target}
              onChange={(event) => {
                const target = event.target.value as "professional" | "room";
                setForm({
                  ...form,
                  target,
                  targetId:
                    target === "professional"
                      ? (professionals[0]?.id ?? "")
                      : (rooms[0]?.id ?? ""),
                });
              }}
            >
              <option value="professional">Profissional</option>
              <option value="room">Sala</option>
            </select>
          </label>
          <label>
            Recurso
            <select
              required
              value={form.targetId}
              onChange={(event) =>
                setForm({ ...form, targetId: event.target.value })
              }
            >
              {targets.map((item) => (
                <option value={item.id} key={item.id}>
                  {"fullName" in item ? item.fullName : item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.target.value })
              }
            />
          </label>
          <label>
            Término
            <input
              required
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm({ ...form, endsAt: event.target.value })
              }
            />
          </label>
          <label className="span-2">
            Motivo
            <input
              required
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
            />
          </label>
          {error && <div className="form-error span-2">{error}</div>}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={loading}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              disabled={loading || !form.targetId}
            >
              {loading ? "Bloqueando…" : "Criar bloqueio"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
