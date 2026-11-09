import type { AdminUser } from "@crm/contracts";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { CurrentPassword } from "./CurrentPassword";

/** Senha de acesso: o admin consulta a senha atual ou define uma nova. */
export function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  // A regra que vale é a da API; aqui só esconde o olho de quem não é admin.
  const canReveal = useAuthorization().user?.role === "admin";
  const newPasswordId = useId();
  const [password, setPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
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
      setPassword("");
      setShowNew(false);
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Senha de acesso"
      subtitle={`${user.fullName} · ${user.email}`}
      eyebrow="Usuários"
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <p className="muted-copy span-2">
          Consulte a senha atual ou defina uma nova senha.
        </p>
        {canReveal && (
          // Remonta ao salvar ou trocar de usuário: a senha consultada some da tela.
          <CurrentPassword
            key={`${user.id}-${saving}`}
            userId={user.id}
            disabled={saving}
          />
        )}
        <div
          className={`password-card${password ? " is-modified" : ""}${canReveal ? "" : " span-2"}`}
        >
          <label className="password-card-title" htmlFor={newPasswordId}>
            Nova senha
          </label>
          <div className="password-field">
            <input
              id={newPasswordId}
              type={showNew ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Digite a nova senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={showNew ? "Ocultar nova senha" : "Mostrar nova senha"}
              disabled={saving}
              onClick={() => setShowNew((value) => !value)}
            >
              {showNew ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
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
