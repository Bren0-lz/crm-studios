import type {
  CommunicationChannel,
  CommunicationPreference,
} from "@crm/contracts";
import { useEffect, useId, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { useToast } from "../../shared/feedback/toast-context";

const channels: Array<[CommunicationChannel, string]> = [
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
];

/**
 * Canais pelos quais o cliente aceita mensagens, na ficha do cliente. As campanhas
 * pulam quem bloqueou o WhatsApp. Sem registro, o canal conta como permitido.
 */
export function PatientMessagePreferences({
  patientId,
}: {
  patientId: string;
}) {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const labelId = useId();
  const [preferences, setPreferences] = useState<
    CommunicationPreference[] | null
  >(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editable =
    canEdit("communications") && can("communications.preferences");

  useEffect(() => {
    let active = true;
    api
      .communicationPreferences(patientId)
      .then((data) => active && setPreferences(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [patientId]);

  const allowed = (channel: CommunicationChannel) =>
    preferences?.find((item) => item.channel === channel)?.allowed ?? true;

  async function toggle(channel: CommunicationChannel) {
    setSaving(true);
    setError("");
    try {
      const saved = await api.setCommunicationPreference({
        patientId,
        channel,
        allowed: !allowed(channel),
      });
      setPreferences((current) => [
        saved,
        ...(current ?? []).filter((item) => item.channel !== channel),
      ]);
      toast.success(
        saved.allowed
          ? "Envios por este canal liberados."
          : "Envios por este canal bloqueados.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="patient-overview-tags patient-overview-messages"
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId}>Aceita mensagens por</span>
      {preferences === null && !error ? (
        <span className="is-empty">Carregando…</span>
      ) : (
        preferences !== null &&
        channels.map(([channel, label]) => (
          <label key={channel} className="checkbox-field">
            <input
              type="checkbox"
              checked={allowed(channel)}
              disabled={!editable || saving}
              onChange={() => void toggle(channel)}
            />
            {label}
          </label>
        ))
      )}
      {error && <ErrorBanner error={error} />}
    </div>
  );
}
