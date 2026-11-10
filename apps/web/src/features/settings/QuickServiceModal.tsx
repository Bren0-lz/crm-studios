import { serviceInputSchema, type Service } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

const initial = {
  name: "",
  durationMinutes: "60",
};

/**
 * Cadastro rápido de serviço a partir do plano. Serviço não tem preço: quem cobra é o plano.
 * Profissionais e salas começam liberados para todos; o ajuste fino continua em
 * Configurações → Serviços e salas.
 */
export function QuickServiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (service: Service) => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty(form);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = serviceInputSchema.safeParse({
      name: form.name,
      durationMinutes: Number(form.durationMinutes),
    });
    if (!parsed.success) {
      setError(
        "Informe o nome (2 a 120 caracteres) e a duração (15 a 480 minutos).",
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      onCreated(await api.createService(parsed.data));
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Novo serviço"
      subtitle="O serviço não tem preço; quem cobra é o plano. Profissionais e salas podem ser ajustados depois em Serviços e salas."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Nome do serviço
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Duração (minutos)
          <input
            required
            type="number"
            min={15}
            max={480}
            value={form.durationMinutes}
            onChange={(event) =>
              setForm({ ...form, durationMinutes: event.target.value })
            }
          />
        </label>
        <p className="field-hint span-2">
          Para vender um atendimento único deste serviço, cadastre o plano
          avulso dele em Configurações › Planos.
        </p>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Cadastrar serviço"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
