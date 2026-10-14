import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { PatientProfileFields } from "../patients/index";
import { CatalogInput } from "../../shared/components/CatalogInput";
import { leadInputSchema, type Lead, type LeadInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";

export function LeadModal({
  onClose,
  onCreated,
  lead,
}: {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
  lead?: Lead | undefined;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<LeadInput>(
    lead
      ? leadInputSchema.parse(lead)
      : {
          fullName: "",
          phone: "",
          email: "",
          source: "Indicação",
          interest: "Fisioterapia",
          notes: "",
          responsibleUserId: getStoredUser()?.id ?? "",
          tags: [],
        },
  );
  const [tagText, setTagText] = useState(lead?.tags.join(", ") ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [baseline] = useState(() => JSON.stringify({ form, tagText }));
  async function save() {
    setLoading(true);
    setError("");
    try {
      onCreated(
        await (
          lead
            ? (input: LeadInput) => api.updateLead(lead.id, input)
            : api.createLead
        )({
          ...form,
          tags: tagText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Cadastro do lead",
    dirty: JSON.stringify({ form, tagText }) !== baseline,
    busy: loading,
    save,
    discard: () => {},
  });
  const close = () => prompt.confirmLeave(onClose);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch {
      /* O formulário e o aviso de saída exibem o erro. */
    }
  }
  return (
    <>
      <Modal
        title={lead ? "Editar lead" : "Novo lead"}
        subtitle="Registre o contato para acompanhar a oportunidade no funil."
        busy={loading || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal)}
        onClose={close}
      >
        {can(lead ? "crm.update" : "crm.create") && (
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
              WhatsApp
              <PhoneInput
                value={form.whatsapp ?? ""}
                onChange={(value) => setForm({ ...form, whatsapp: value })}
              />
            </label>
            <label>
              Contato de emergência
              <input
                maxLength={120}
                value={form.emergencyContactName ?? ""}
                onChange={(event) =>
                  setForm({ ...form, emergencyContactName: event.target.value })
                }
              />
            </label>
            <label>
              Telefone de emergência
              <PhoneInput
                value={form.emergencyContactPhone ?? ""}
                onChange={(value) =>
                  setForm({ ...form, emergencyContactPhone: value })
                }
              />
            </label>
            <CatalogInput
              kind="lead_source"
              label="Origem"
              required
              value={form.source}
              onChange={(value) => setForm({ ...form, source: value })}
            />
            <label>
              Interesse
              <input
                required
                maxLength={80}
                value={form.interest}
                onChange={(e) => setForm({ ...form, interest: e.target.value })}
              />
            </label>
            <CatalogInput
              kind="lead_channel"
              label="Forma de contato inicial"
              value={form.contactMethod ?? ""}
              onChange={(value) => setForm({ ...form, contactMethod: value })}
            />
            <label>
              CPF do interessado
              <input
                value={form.cpf ?? ""}
                onChange={(event) =>
                  setForm({ ...form, cpf: event.target.value })
                }
              />
            </label>
            <label>
              Nascimento do interessado
              <input
                type="date"
                value={form.birthDate ?? ""}
                onChange={(event) =>
                  setForm({ ...form, birthDate: event.target.value })
                }
              />
            </label>
            <div className="span-2">
              <PatientProfileFields
                form={form}
                onChange={(key, value) =>
                  setForm((current) => ({ ...current, [key]: value }))
                }
              />
            </div>
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
                {lead?.responsibleUserId &&
                  lead.responsibleUserId !== getStoredUser()?.id && (
                    <option value={lead.responsibleUserId}>
                      {lead.responsibleName ?? "Responsável atual"}
                    </option>
                  )}
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
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </button>
              <button className="primary-button" disabled={loading}>
                {loading
                  ? "Salvando…"
                  : lead
                    ? "Salvar cadastro"
                    : "Adicionar ao funil"}
              </button>
            </div>
          </form>
        )}
      </Modal>
      {prompt.modal}
    </>
  );
}
