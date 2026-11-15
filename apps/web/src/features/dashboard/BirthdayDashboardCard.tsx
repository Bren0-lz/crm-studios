import {
  patientFirstName,
  type RelationshipSettings,
  type UpcomingBirthdayEntry,
  whatsappLink,
} from "@crm/contracts";
import { ChevronRight, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { initials } from "../../shared/lib/formatting";
import { birthdayMessage, markBirthdaySent } from "../relationship/index";

export function BirthdayDashboardCard() {
  const { canEdit } = useAuthorization();
  const toast = useToast();
  const [birthdays, setBirthdays] = useState<UpcomingBirthdayEntry[]>([]);
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    let active = true;
    // Mesma fonte do painel do mês: todos os aniversários da janela, com ou sem parabéns.
    Promise.all([api.upcomingBirthdays(), api.relationshipSettings()])
      .then(([birthdayData, settingsData]) => {
        if (!active) return;
        setBirthdays(birthdayData);
        setSettings(settingsData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function markSent(suggestion: UpcomingBirthdayEntry) {
    setError("");
    setSaving(suggestion.referenceKey);
    try {
      await markBirthdaySent(suggestion.patientId, suggestion.referenceKey);
      toast.success(
        `Parabéns para ${patientFirstName(suggestion.patientName)} marcados como enviados.`,
      );
      setBirthdays((current) =>
        current.map((item) =>
          item.referenceKey === suggestion.referenceKey
            ? { ...item, congratulated: true }
            : item,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="panel pulse-panel">
      <div className="panel-head">
        <div>
          <h2>Aniversariantes</h2>
          <p className="panel-context">
            {settings
              ? `Hoje e próximos ${settings.birthdayDaysAhead} dias`
              : "Hoje e próximos dias"}
          </p>
        </div>
        <NavLink to="/relacionamento" className="text-link">
          Ver contatos sugeridos <ChevronRight size={16} />
        </NavLink>
      </div>
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="attention-list">
          {birthdays.length === 0 ? (
            <p>Nenhum aniversário por perto.</p>
          ) : (
            birthdays.map((suggestion) => (
              <div className="attention-item" key={suggestion.referenceKey}>
                <span className="attention-number">
                  {initials(suggestion.patientName)}
                </span>
                <div>
                  <strong>{suggestion.patientName}</strong>
                  <small>{suggestion.detail}</small>
                </div>
                <div className="birthday-actions">
                  <a
                    className="whatsapp-button button-sm"
                    href={whatsappLink(
                      suggestion.whatsapp || suggestion.phone,
                      birthdayMessage(settings, suggestion.patientName),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    Dar parabéns
                  </a>
                  {suggestion.congratulated ? (
                    <span className="status-pill completed">
                      Parabéns enviado
                    </span>
                  ) : (
                    canEdit("relationship") && (
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        disabled={saving === suggestion.referenceKey}
                        onClick={() => void markSent(suggestion)}
                      >
                        Marcar como enviado
                      </button>
                    )
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
