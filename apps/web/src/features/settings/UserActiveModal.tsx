import type { AdminUser } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { userSaveErrorMessage } from "./model";

export function UserActiveModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: (updated: AdminUser) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      onDone(
        await api.updateAdminUser(user.id, {
          fullName: user.fullName,
          role: user.role,
          active: !user.active,
        }),
      );
    } catch (cause) {
      setError(userSaveErrorMessage(cause));
      setSaving(false);
    }
  }
  return (
    <Modal
      title={user.active ? "Desativar usuário" : "Ativar usuário"}
      subtitle={`${user.fullName} · ${user.email}`}
      eyebrow="Usuários"
      busy={saving}
      onClose={onClose}
    >
      <div className="form-grid">
        <p className="span-2">
          {user.active
            ? `${user.fullName} perde o acesso imediatamente, inclusive nas sessões já abertas.`
            : `${user.fullName} volta a entrar com a senha atual e as mesmas permissões.`}
        </p>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="button"
            className={user.active ? "danger-button" : "primary-button"}
            onClick={() => void confirm()}
            disabled={saving}
          >
            {saving ? "Salvando…" : user.active ? "Desativar" : "Ativar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
