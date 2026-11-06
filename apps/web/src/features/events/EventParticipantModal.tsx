import {
  EVENT_LEAD_DEFAULT_INTEREST,
  eventLeadSource,
  type CommercialEvent,
  type LeadInput,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { LeadDuplicateWarning, useLeadDuplicates } from "../commercial/index";

/** Participante = lead ligado ao evento (origem "Evento: <nome>", interesse padrão "Evento"). */
export function EventParticipantModal({
  event,
  onClose,
  onSaved,
}: {
  event: CommercialEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    whatsapp: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty(form);
  const duplicates = useLeadDuplicates(form);
  const missing = useMissingFields(
    [
      form.fullName.trim().length < 3 && "Nome (pelo menos 3 caracteres)",
      !form.phone.trim() && "Telefone",
    ].filter((item): item is string => Boolean(item)),
  );
  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const input: LeadInput = {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        ...(form.whatsapp ? { whatsapp: form.whatsapp } : {}),
        // O servidor grava a origem do evento; o interesse padrão vem do formulário.
        source: eventLeadSource(event.name),
        interest: EVENT_LEAD_DEFAULT_INTEREST,
        tags: [],
        eventId: event.id,
      };
      await api.createLead(input);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível adicionar o participante.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (duplicates.pending) {
      setSaving(true);
      setError("");
      const found = await duplicates.check().finally(() => setSaving(false));
      if (found) return;
    }
    await save();
  }
  return (
    <Modal
      title="Adicionar participante"
      subtitle={`O participante entra no comercial com a origem "${eventLeadSource(event.name)}".`}
      onClose={onClose}
      busy={saving}
      dirty={dirty}
    >
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <label className="span-2">
          Nome completo
          <input
            required
            minLength={3}
            maxLength={160}
            value={form.fullName}
            disabled={saving}
            onChange={(e) => update("fullName", e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Telefone
          <PhoneInput
            required
            value={form.phone}
            onChange={(digits) => update("phone", digits)}
          />
        </label>
        <label>
          WhatsApp
          <PhoneInput
            value={form.whatsapp}
            onChange={(digits) => update("whatsapp", digits)}
          />
        </label>
        <label className="span-2">
          E-mail
          <input
            type="email"
            value={form.email}
            disabled={saving}
            onChange={(e) => update("email", e.target.value)}
          />
        </label>
        <LeadDuplicateWarning
          matches={duplicates.matches}
          busy={saving}
          onOpenPatient={(id) => void navigate(`/clientes/${id}`)}
          onSaveAnyway={() => void save()}
        />
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={saving || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            {saving ? "Salvando…" : "Adicionar participante"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
