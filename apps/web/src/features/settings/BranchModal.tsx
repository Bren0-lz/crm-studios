import type { Branch } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

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
  const [form, setForm] = useState({
    name: branch?.name ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
    active: branch?.active ?? true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(form);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const input = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      active: form.active,
    };
    if (input.name.length < 2) {
      setError("Informe o nome da filial.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(
        branch
          ? await api.updateBranch(branch.id, input)
          : await api.createBranch(input),
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
      title={branch ? "Editar filial" : "Nova filial"}
      subtitle="Cada filial tem agenda, salas, profissionais, turmas, estoque e financeiro próprios. Clientes, serviços e planos são da rede."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <label className="span-2">
          Nome da filial
          <input
            autoFocus
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="span-2">
          Endereço
          <input
            maxLength={240}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label>
          Telefone
          <input
            type="tel"
            maxLength={40}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={form.active}
            disabled={branch?.isDefault}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Filial ativa
        </label>
        {branch?.isDefault && (
          <p className="muted-copy span-2">
            A filial padrão recebe o que é lançado em &quot;Todas as
            filiais&quot; e não pode ser desativada.
          </p>
        )}
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
