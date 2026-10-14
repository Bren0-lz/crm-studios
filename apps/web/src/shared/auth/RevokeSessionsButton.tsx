import { useState } from "react";
import { api } from "../../api";
import { Modal } from "../components/Modal";
import { ErrorBanner } from "../components/ErrorBanner";

export function RevokeSessionsButton({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      await api.revokeSessions();
      onLogout();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        Sair de todos os dispositivos
      </button>
      {open && (
        <Modal
          title="Sair de todos os dispositivos"
          subtitle="Todos os acessos atuais, incluindo este, serão encerrados."
          busy={busy}
          onClose={() => setOpen(false)}
        >
          {error && <ErrorBanner error={error} />}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void revoke()}
            >
              Encerrar acessos
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
