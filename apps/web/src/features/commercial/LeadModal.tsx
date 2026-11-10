import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { PatientProfileFields } from "../patients/index";
import { CatalogInput } from "../../shared/components/CatalogInput";
import { CatalogSelect } from "../../shared/components/CatalogSelect";
import { leadInputSchema, type Lead, type LeadInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { LeadDuplicateWarning } from "./LeadDuplicateWarning";
import { useLeadDuplicates } from "./useLeadDuplicates";
import { SendToTrashModal } from "../trash";

export function LeadModal({
  onClose,
  onCreated,
  onTrashed,
  lead,
}: {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
  /** Lead enviado para a lixeira pelo botão "Excluir" (só na edição). */
  onTrashed?: (lead: Lead) => void;
  lead?: Lead | undefined;
}) {
  const { can } = useAuthorization();
  const [trashing, setTrashing] = useState(false);
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
  const missing = useMissingFields(
    [
      !form.fullName.trim() && "Nome completo",
      !form.phone.trim() && "Telefone",
      !form.source.trim() && "Origem",
      !form.interest.trim() && "Interesse",
    ].filter((item): item is string => Boolean(item)),
  );
  const navigate = useNavigate();
  const duplicates = useLeadDuplicates(form, lead?.id);
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
  async function saveAnyway() {
    try {
      await save();
    } catch {
      /* O formulário e o aviso de saída exibem o erro. */
    }
  }
  /** Aviso não bloqueante (QM10): telefone, e-mail ou CPF já cadastrado em outro registro. */
  async function checkDuplicates(): Promise<boolean> {
    if (!duplicates.pending) return false;
    setLoading(true);
    setError("");
    try {
      return await duplicates.check();
    } finally {
      setLoading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await checkDuplicates()) return;
    await saveAnyway();
  }
  return (
    <>
      <Modal
        title={lead ? "Editar lead" : "Novo lead"}
        subtitle="Registre o contato para acompanhar a oportunidade no funil."
        busy={loading || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal) || trashing}
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
            <CatalogSelect
              kind="lead_source"
              label="Origem"
              required
              value={form.source}
              onChange={(value) => setForm({ ...form, source: value })}
            />
            <CatalogSelect
              kind="interest"
              label="Interesse"
              required
              value={form.interest}
              onChange={(value) => setForm({ ...form, interest: value })}
            />
            {/* Cadastro enxuto (U19): nome, telefone, origem e interesse à vista. */}
            <details className="more-info span-2" open={Boolean(lead)}>
              <summary>Mais informações</summary>
              <div className="form-grid">
                <label>
                  E-mail
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  WhatsApp
                  <PhoneInput
                    value={form.whatsapp ?? ""}
                    onChange={(value) => setForm({ ...form, whatsapp: value })}
                  />
                </label>
                <CatalogInput
                  kind="lead_channel"
                  label="Forma de contato inicial"
                  value={form.contactMethod ?? ""}
                  onChange={(value) =>
                    setForm({ ...form, contactMethod: value })
                  }
                />
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
                <label className="span-2">
                  Observações
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
                <div className="span-2">
                  <PatientProfileFields
                    withAddress={false}
                    form={form}
                    onChange={(key, value) =>
                      setForm((current) => ({ ...current, [key]: value }))
                    }
                  />
                </div>
              </div>
            </details>
            <LeadDuplicateWarning
              matches={duplicates.matches}
              busy={loading}
              onOpenPatient={(id) =>
                prompt.confirmLeave(() => void navigate(`/clientes/${id}`))
              }
              onSaveAnyway={() => void saveAnyway()}
            />
            {error && <div className="form-error span-2">{error}</div>}
            {missing.hint}
            <div className="modal-actions span-2">
              {lead && onTrashed && can("trash.send") && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setTrashing(true)}
                  disabled={loading}
                >
                  Excluir
                </button>
              )}
              <button
                type="button"
                className="secondary-button"
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={loading || missing.blocked}
                aria-describedby={missing.describedBy}
              >
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
      {trashing && lead && onTrashed && (
        <SendToTrashModal
          kind="leads"
          id={lead.id}
          title={lead.fullName}
          onClose={() => setTrashing(false)}
          onDone={() => onTrashed(lead)}
        />
      )}
    </>
  );
}
