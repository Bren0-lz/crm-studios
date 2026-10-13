import type { AdminUser } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";

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
        <p className="muted-copy span-2">
          A senha precisa de letra maiúscula, minúscula e número.
        </p>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Redefinir senha"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
