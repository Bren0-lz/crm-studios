import { withQuotedPrefix } from "@crm/contracts";
import {
  brazilianStates,
  MAX_BRANCH_PHONES,
  type Branch,
  type BranchInput,
} from "@crm/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { formatCep, lookupCep } from "../../shared/lib/cep";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

interface PhoneRow {
  number: string;
  label: string;
}

type BranchForm = Required<
  Omit<BranchInput, "active" | "state" | "phones"> & {
    active: boolean;
    state: string;
    phones: PhoneRow[];
  }
>;

const emptyPhone = (): PhoneRow => ({ number: "", label: "" });

function initialForm(branch?: Branch): BranchForm {
  return {
    name: branch?.name ?? "",
    // Sempre ao menos uma linha de telefone para preencher.
    phones: branch?.phones?.length
      ? branch.phones.map((phone) => ({
          number: phone.number,
          label: phone.label ?? "",
        }))
      : [emptyPhone()],
    active: branch?.active ?? true,
    postalCode: branch?.postalCode ?? "",
    street: branch?.street ?? "",
    number: branch?.number ?? "",
    complement: branch?.complement ?? "",
    neighborhood: branch?.neighborhood ?? "",
    city: branch?.city ?? "",
    state: branch?.state ?? "",
    reference: branch?.reference ?? "",
  };
}

/** Cadastro (sem `branch`) ou edição de uma filial. */
export function BranchModal({
  branch,
  onClose,
  onSaved,
}: {
  branch?: Branch;
  onClose: () => void;
  onSaved: (branch: Branch) => void;
}) {
  const [form, setForm] = useState(() => initialForm(branch));
  const [cepStatus, setCepStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(form);
  const set = <K extends keyof BranchForm>(key: K, value: BranchForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setPhone = (index: number, change: Partial<PhoneRow>) =>
    setForm((current) => ({
      ...current,
      phones: current.phones.map((phone, position) =>
        position === index ? { ...phone, ...change } : phone,
      ),
    }));
  const removePhone = (index: number) =>
    setForm((current) => {
      const phones = current.phones.filter((_, position) => position !== index);
      return { ...current, phones: phones.length ? phones : [emptyPhone()] };
    });

  // CEP completo preenche rua, bairro, cidade e UF pelo ViaCEP (mesmo fluxo dos clientes).
  async function changeCep(value: string) {
    const postalCode = formatCep(value);
    set("postalCode", postalCode);
    if (postalCode.length !== 9) {
      setCepStatus("");
      return;
    }
    setCepStatus("Buscando endereço…");
    try {
      const found = await lookupCep(postalCode);
      if (!found) {
        setCepStatus("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      setForm((current) => ({
        ...current,
        street: found.address || current.street,
        neighborhood: found.neighborhood || current.neighborhood,
        city: found.city || current.city,
        state: found.state || current.state,
      }));
      setCepStatus("Endereço preenchido pelo CEP. Confira o número.");
    } catch {
      setCepStatus("Não foi possível consultar o CEP. Preencha manualmente.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const input = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ]),
    ) as BranchForm;
    // Linhas sem número nem descrição são ignoradas.
    const phones = form.phones
      .map((phone) => ({ number: phone.number, label: phone.label.trim() }))
      .filter((phone) => phone.number || phone.label);
    if (input.name.length < 2) {
      setError("Informe o nome da filial.");
      return;
    }
    const incomplete = phones.findIndex((phone) => phone.number.length < 10);
    if (incomplete >= 0) {
      setError(
        phones[incomplete]!.label
          ? `Informe o ${withQuotedPrefix("telefone", phones[incomplete]!.label, ['"', '"'])} com DDD.`
          : "Informe cada telefone com DDD ou remova a linha vazia.",
      );
      return;
    }
    if (input.postalCode && input.postalCode.length !== 9) {
      setError("Informe o CEP completo (00000-000) ou deixe em branco.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      ...input,
      phones,
      state: input.state as BranchInput["state"],
    };
    try {
      onSaved(
        branch
          ? await api.updateBranch(branch.id, payload)
          : await api.createBranch(payload),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível salvar a filial.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Filiais"
      title={branch ? `Editar ${branch.name}` : "Nova filial"}
      subtitle="Cada filial tem agenda, salas, profissionais, turmas, estoque e financeiro próprios. Clientes, serviços e planos são da rede."
      wide
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        className="form-grid branch-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <fieldset className="form-fieldset span-2" disabled={saving}>
          <legend>Identificação</legend>
          <label>
            Nome da filial
            <input
              autoFocus
              required
              maxLength={120}
              placeholder="Ex.: Unidade Centro"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <div className="branch-phones" role="group" aria-label="Telefones">
            <span className="branch-phones-title">Telefones</span>
            {form.phones.map((phone, index) => (
              <div className="branch-phone-row" key={index}>
                <label className="branch-phone-number">
                  <span className="sr-only">Telefone {index + 1}</span>
                  <PhoneInput
                    value={phone.number}
                    onChange={(digits) => setPhone(index, { number: digits })}
                  />
                </label>
                <label className="branch-phone-label">
                  <span className="sr-only">
                    Descrição do telefone {index + 1}
                  </span>
                  <input
                    maxLength={40}
                    placeholder="Descrição (ex.: WhatsApp, Recepção)"
                    value={phone.label}
                    onChange={(e) => setPhone(index, { label: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button branch-phone-remove"
                  aria-label={`Remover telefone ${index + 1}`}
                  title="Remover telefone"
                  disabled={
                    form.phones.length === 1 && !phone.number && !phone.label
                  }
                  onClick={() => removePhone(index)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            {form.phones.length < MAX_BRANCH_PHONES && (
              <button
                type="button"
                className="secondary-button button-sm branch-phone-add"
                onClick={() => set("phones", [...form.phones, emptyPhone()])}
              >
                <Plus size={16} />
                Adicionar telefone
              </button>
            )}
          </div>
          <label className="checkbox-field branch-active">
            <input
              type="checkbox"
              checked={form.active}
              disabled={branch?.isDefault}
              onChange={(e) => set("active", e.target.checked)}
            />
            <span>
              Filial ativa
              <small className="field-hint">
                {branch?.isDefault
                  ? "É a filial padrão: recebe o que é lançado em “Todas as filiais” e não pode ser desativada."
                  : "Filial inativa some do seletor do topo, mas mantém o histórico."}
              </small>
            </span>
          </label>
        </fieldset>
        <fieldset className="form-fieldset span-2" disabled={saving}>
          <legend>Endereço</legend>
          <div className="branch-address-grid">
            <div className="field-with-hint branch-cep">
              <label>
                CEP
                <input
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  maxLength={9}
                  value={form.postalCode}
                  onChange={(e) => void changeCep(e.target.value)}
                />
              </label>
              {cepStatus && (
                <small className="field-hint" role="status">
                  {cepStatus}
                </small>
              )}
            </div>
            <label className="branch-street">
              Rua
              <input
                autoComplete="address-line1"
                maxLength={160}
                placeholder="Rua, avenida…"
                value={form.street}
                onChange={(e) => set("street", e.target.value)}
              />
            </label>
            <label className="branch-number">
              Número
              <input
                maxLength={20}
                placeholder="Ex.: 120"
                value={form.number}
                onChange={(e) => set("number", e.target.value)}
              />
            </label>
            <label className="branch-complement">
              Complemento
              <input
                autoComplete="address-line2"
                maxLength={80}
                placeholder="Sala, bloco, andar…"
                value={form.complement}
                onChange={(e) => set("complement", e.target.value)}
              />
            </label>
            <label className="branch-neighborhood">
              Bairro
              <input
                maxLength={100}
                value={form.neighborhood}
                onChange={(e) => set("neighborhood", e.target.value)}
              />
            </label>
            <label className="branch-city">
              Cidade
              <input
                autoComplete="address-level2"
                maxLength={100}
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </label>
            <label className="branch-state">
              UF
              <select
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
              >
                <option value="">—</option>
                {brazilianStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <label className="branch-reference">
              Ponto de referência
              <input
                maxLength={160}
                placeholder="Ex.: ao lado da padaria, em frente à praça"
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar filial"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
