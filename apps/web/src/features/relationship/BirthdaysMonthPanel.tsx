import {
  type BirthdayEntry,
  formatPhone,
  type RelationshipSettings,
  saoPauloToday,
  whatsappLink,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { shortDate } from "../../shared/lib/formatting";
import { birthdayMessage, markBirthdaySent } from "./model";

export function BirthdaysMonthPanel({
  settings,
}: {
  settings: RelationshipSettings | null;
}) {
  const { canEdit } = useAuthorization();
  const [month, setMonth] = useState(() => saoPauloToday().slice(0, 7));
  const [entries, setEntries] = useState<BirthdayEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    let active = true;
    api
      .birthdays(month)
      .then((data) => active && setEntries(data))
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month]);

  async function markSent(entry: BirthdayEntry) {
    setError("");
    setSaving(entry.referenceKey);
    try {
      await markBirthdaySent(entry.patientId, entry.referenceKey);
      setEntries((current) =>
        current.map((item) =>
          item.referenceKey === entry.referenceKey
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
    <section className="panel plans-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Aniversários do mês</span>
          <h2>Aniversariantes</h2>
        </div>
        <label className="filter-group">
          <span className="filter-label">Mês</span>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setError("");
              setLoading(/^\d{4}-\d{2}$/.test(event.target.value));
              setMonth(event.target.value);
            }}
          />
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <LoadingBlock />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nenhum aniversariante neste mês"
          copy="Clientes ativos com data de nascimento aparecem aqui."
        />
      ) : (
        <div className="plans-grid">
          {entries.map((entry) => (
            <article className="plan-card" key={entry.referenceKey}>
              <div className="plan-card-head">
                <span className="status-pill open">
                  {shortDate.format(new Date(`${entry.date}T12:00:00`))}
                </span>
                {entry.congratulated && (
                  <span className="status-pill completed">
                    Parabéns enviado
                  </span>
                )}
              </div>
              <h3>{entry.patientName}</h3>
              <p>Completa {entry.ageTurning} anos</p>
              <div className="plan-meta">
                <span>Telefone</span>
                <strong>{formatPhone(entry.phone)}</strong>
              </div>
              {!entry.congratulated && (
                <div className="birthday-actions">
                  <a
                    className="whatsapp-button button-sm"
                    href={whatsappLink(
                      entry.whatsapp || entry.phone,
                      birthdayMessage(settings, entry.patientName),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    Dar parabéns
                  </a>
                  {canEdit("relationship") && (
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      disabled={saving === entry.referenceKey}
                      onClick={() => void markSent(entry)}
                    >
                      Marcar como enviado
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
