import type { AdminUser } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty(password);
  const missing = useMissingFields(password ? [] : ["Nova senha"]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api.resetAdminPassword(user.id, password);
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Redefinir senha"
      subtitle={`${user.fullName} · ${user.email}`}
      eyebrow="Usuários"
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Nova senha
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={saving || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            {saving ? "Salvando…" : "Redefinir senha"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
