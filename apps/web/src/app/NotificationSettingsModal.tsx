import {
  notificationRefreshMinutes,
  type NotificationKind,
  type NotificationPreferences,
} from "@crm/contracts";
import { Volume2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Modal, ModalCancelButton } from "../shared/components/Modal";
import {
  notificationKindDetails,
  playNotificationSound,
} from "./notification-center";

const refreshLabels: Record<
  (typeof notificationRefreshMinutes)[number],
  string
> = {
  1: "1 minuto",
  5: "5 minutos",
  15: "15 minutos",
  30: "30 minutos",
};

function toggle(
  kinds: readonly NotificationKind[],
  kind: NotificationKind,
  on: boolean,
) {
  return on
    ? [...kinds.filter((item) => item !== kind), kind]
    : kinds.filter((item) => item !== kind);
}

/**
 * Preferências do sino do usuário logado: quais grupos aparecem, quais entram na faixa de
 * alertas, avisos e som de pendência nova e o intervalo da conferência automática.
 */
export function NotificationSettingsModal({
  availableKinds,
  preferences,
  onSave,
  onClose,
}: {
  /** Grupos dos módulos que o usuário vê. */
  availableKinds: readonly NotificationKind[];
  preferences: NotificationPreferences;
  onSave: (input: NotificationPreferences) => Promise<void>;
  onClose: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar as preferências.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Notificações"
      title="Configurar notificações"
      subtitle="Escolha o que aparece no sino, o que fica em destaque no topo da tela e como avisar quando surgir pendência nova. Vale só para o seu usuário."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form id={formId} className="form-grid" onSubmit={submit}>
        <fieldset className="span-2 notification-kinds">
          <legend>Grupos de pendências</legend>
          {availableKinds.length === 0 ? (
            <p className="muted-copy">
              Seu perfil não acompanha nenhum grupo de pendências.
            </p>
          ) : (
            <ul>
              {availableKinds.map((kind) => {
                const details = notificationKindDetails[kind];
                const shown = !draft.hiddenKinds.includes(kind);
                return (
                  <li key={kind}>
                    <span className="notification-kind-copy">
                      <strong>{details.label}</strong>
                      <small>{details.detail}</small>
                    </span>
                    <span className="notification-kind-options">
                      <label>
                        <input
                          type="checkbox"
                          checked={shown}
                          aria-label={`Mostrar ${details.label} no sino`}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              hiddenKinds: toggle(
                                current.hiddenKinds,
                                kind,
                                !event.target.checked,
                              ),
                            }))
                          }
                        />
                        Mostrar
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={
                            shown && draft.highlightedKinds.includes(kind)
                          }
                          disabled={!shown}
                          aria-label={`Destacar ${details.label} no topo da tela`}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              highlightedKinds: toggle(
                                current.highlightedKinds,
                                kind,
                                event.target.checked,
                              ),
                            }))
                          }
                        />
                        Destacar
                      </label>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={draft.showBanner}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                showBanner: event.target.checked,
              }))
            }
          />
          Mostrar os grupos destacados como alerta fixo no cabeçalho
        </label>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={draft.showToasts}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                showToasts: event.target.checked,
              }))
            }
          />
          Avisar na tela quando surgir uma pendência nova
        </label>
        <div className="span-2 notification-sound-option">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={draft.playSound}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  playSound: event.target.checked,
                }))
              }
            />
            Tocar um som quando surgir uma pendência nova
          </label>
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={playNotificationSound}
          >
            <Volume2 size={15} aria-hidden="true" />
            Testar som
          </button>
        </div>
        <label>
          Conferir novas pendências a cada
          <select
            value={draft.refreshMinutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                refreshMinutes: Number(
                  event.target.value,
                ) as NotificationPreferences["refreshMinutes"],
              }))
            }
          >
            {notificationRefreshMinutes.map((minutes) => (
              <option key={minutes} value={minutes}>
                {refreshLabels[minutes]}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Abrir o sino e salvar alterações nas telas também conferem na hora.
          </span>
        </label>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
        <button
          className="primary-button"
          type="submit"
          form={formId}
          disabled={saving}
        >
          {saving ? "Salvando…" : "Salvar preferências"}
        </button>
      </div>
    </Modal>
  );
}
