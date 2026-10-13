import type { Lead, LeadInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";

export function LeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<LeadInput>({
    fullName: "",
    phone: "",
    email: "",
    source: "Indicação",
    interest: "Fisioterapia",
    notes: "",
    responsibleUserId: getStoredUser()?.id ?? "",
    tags: [],
  });
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onCreated(
        await api.createLead({
          ...form,
          tags: tagText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Novo lead"
      subtitle="Registre o contato para acompanhar a oportunidade no funil."
      busy={loading}
      onClose={onClose}
    >
      {can("crm.create") && (
        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Nome completo
            <input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              autoFocus
            />
          </label>
          <label>
            Telefone
            <PhoneInput
              required
              value={form.phone}
              onChange={(digits) => setForm({ ...form, phone: digits })}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Origem
            <input
              required
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </label>
          <label>
            Interesse
            <input
              required
              value={form.interest}
              onChange={(e) => setForm({ ...form, interest: e.target.value })}
            />
          </label>
          <label className="span-2">
            Observações
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label>
            Responsável
            <select
              value={form.responsibleUserId}
              onChange={(e) =>
                setForm({ ...form, responsibleUserId: e.target.value })
              }
            >
              <option value="">Não atribuído</option>
              {getStoredUser() && (
                <option value={getStoredUser()!.id}>
                  {getStoredUser()!.fullName}
                </option>
              )}
            </select>
          </label>
          <label>
            Etiquetas
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="Ortopedia, indicação, prioridade"
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
              Cancelar
            </button>
            <button className="primary-button" disabled={loading}>
              {loading ? "Salvando…" : "Adicionar ao funil"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
