import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { PatientAddressFields, PatientProfileFields } from "../patients/index";
import { CpfInput } from "../../shared/components/CpfInput";
import { CatalogEntryModal } from "../../shared/components/CatalogEntryModal";
import { CatalogInput } from "../../shared/components/CatalogInput";
import { CatalogSelect } from "../../shared/components/CatalogSelect";
import {
  isValidCpf,
  leadInputSchema,
  type Lead,
  type LeadInput,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { LeadDuplicateWarning } from "./LeadDuplicateWarning";
import { useLeadDuplicates } from "./useLeadDuplicates";
import { SendToTrashModal, TrashIconButton } from "../trash";

/** Campos do bloco "Dados para o cadastro de cliente". */
const registrationFieldKeys = [
  "cpf",
  "postalCode",
  "residenceType",
  "address",
  "addressNumber",
  "buildingName",
  "block",
  "floor",
  "unit",
  "complement",
  "referencePoint",
  "neighborhood",
  "city",
  "state",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactWhatsapp",
] as const satisfies ReadonlyArray<keyof LeadInput>;

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
  const { can, user } = useAuthorization();
  // Cadastrar origem/interesse sem sair do lead: só o admin inclui itens nos cadastros.
  const admin = user?.role === "admin";
  const [creating, setCreating] = useState<"lead_source" | "interest" | null>(
    null,
  );
  const [catalogVersion, setCatalogVersion] = useState(0);
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
  // Na edição, o bloco abre quando o lead já tem algum dado do cadastro de cliente.
  const [registrationOpen] = useState(
    () =>
      Boolean(lead) &&
      registrationFieldKeys.some((key) => Boolean(form[key]?.trim())),
  );
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
    // CPF é opcional no lead, mas, preenchido, precisa ser válido (mesma mensagem do cliente).
    if (form.cpf?.trim() && !isValidCpf(form.cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    if (await checkDuplicates()) return;
    await saveAnyway();
  }
  return (
    <>
      <Modal
        title={lead ? "Editar lead" : "Novo lead"}
        subtitle="Registre o contato para acompanhar a oportunidade no funil."
        busy={loading || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal) || trashing || Boolean(creating)}
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
              WhatsApp
              <PhoneInput
                value={form.whatsapp ?? ""}
                onChange={(value) => setForm({ ...form, whatsapp: value })}
              />
            </label>
            <CatalogSelect
              kind="lead_source"
              label="Origem"
              required
              value={form.source}
              onChange={(value) => setForm({ ...form, source: value })}
              createLabel="Cadastrar origem"
              onCreate={admin ? () => setCreating("lead_source") : undefined}
              reloadKey={catalogVersion}
            />
            <CatalogSelect
              kind="interest"
              label="Interesse"
              required
              value={form.interest}
              onChange={(value) => setForm({ ...form, interest: value })}
              createLabel="Cadastrar interesse"
              onCreate={admin ? () => setCreating("interest") : undefined}
              reloadKey={catalogVersion}
            />
            {/* Cadastro enxuto (U19): nome, telefone, WhatsApp, origem e interesse à vista. */}
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
            {/* RV1: com estes dados, a conversão vai direto ao cadastro de cliente. */}
            <details className="more-info span-2" open={registrationOpen}>
              <summary>Dados para o cadastro de cliente</summary>
              <div className="form-grid">
                <label className="span-2">
                  CPF
                  <CpfInput
                    value={form.cpf ?? ""}
                    onChange={(digits) => setForm({ ...form, cpf: digits })}
                  />
                </label>
                <PatientAddressFields
                  form={form}
                  onChange={(key, value) =>
                    setForm((current) => ({ ...current, [key]: value }))
                  }
                />
                <fieldset className="form-fieldset span-2">
                  <legend>Contato de emergência</legend>
                  <div className="form-fieldset-grid">
                    <label className="span-2">
                      Nome do contato de emergência
                      <input
                        autoComplete="off"
                        placeholder="Ex.: Maria Souza (mãe)"
                        maxLength={160}
                        value={form.emergencyContactName ?? ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            emergencyContactName: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Telefone do contato de emergência
                      <PhoneInput
                        value={form.emergencyContactPhone ?? ""}
                        onChange={(digits) =>
                          setForm({ ...form, emergencyContactPhone: digits })
                        }
                      />
                    </label>
                    <label>
                      WhatsApp do contato de emergência
                      <PhoneInput
                        value={form.emergencyContactWhatsapp ?? ""}
                        onChange={(digits) =>
                          setForm({ ...form, emergencyContactWhatsapp: digits })
                        }
                      />
                    </label>
                  </div>
                </fieldset>
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
                <TrashIconButton
                  label="Excluir"
                  onClick={() => setTrashing(true)}
                  disabled={loading}
                />
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
      {creating && (
        <CatalogEntryModal
          kind={creating}
          title={creating === "lead_source" ? "Nova origem" : "Novo interesse"}
          onClose={() => setCreating(null)}
          onSaved={(entry) => {
            const field = creating === "lead_source" ? "source" : "interest";
            setForm((current) => ({ ...current, [field]: entry.name }));
            setCatalogVersion((version) => version + 1);
            setCreating(null);
          }}
        />
      )}
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
