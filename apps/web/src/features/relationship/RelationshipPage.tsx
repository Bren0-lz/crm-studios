import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import {
  type ContactReason,
  type ContactSuggestion,
  fillPatientMessage,
  formatPhone,
  type RelationshipSettings,
  whatsappLink,
} from "@crm/contracts";
import { ListChecks, MessageCircle, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { shortDate } from "../../shared/lib/formatting";
import { BirthdaysMonthPanel } from "./BirthdaysMonthPanel";
import { ClientPendingModal } from "./ClientPendingModal";
import { ContactActivityModal } from "./ContactActivityModal";
import {
  contactReasonLabels,
  groupSuggestionsByPatient,
  suggestionKey,
} from "./model";

export function RelationshipPage() {
  const { can, canEdit } = useAuthorization();
  const contextPatientId = usePatientContext();
  const [view, setView] = useState<"suggestions" | "birthdays">("suggestions");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [reasonFilter, setReasonFilter] = useState<ContactReason | "all">(
    "all",
  );
  const [recording, setRecording] = useState<ContactSuggestion[] | null>(null);
  const [details, setDetails] = useState<ContactSuggestion[] | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.contactSuggestions(), api.relationshipSettings()])
      .then(([suggestionData, settingsData]) => {
        if (!active) return;
        setSuggestions(suggestionData);
        setSettings(settingsData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = new Map<ContactReason, number>();
  for (const suggestion of suggestions) {
    counts.set(suggestion.reason, (counts.get(suggestion.reason) ?? 0) + 1);
  }
  const reasonOptions = (
    Object.keys(contactReasonLabels) as ContactReason[]
  ).filter((reason) => counts.has(reason));
  const visible =
    reasonFilter === "all"
      ? suggestions
      : suggestions.filter((suggestion) => suggestion.reason === reasonFilter);
  const visibleClients = visible.filter(
    (item) => !contextPatientId || item.patientId === contextPatientId,
  );

  function messageFor(suggestion: ContactSuggestion) {
    const template = settings?.messages[suggestion.reason] ?? "";
    return fillPatientMessage(template, suggestion.patientName);
  }

  const visibleGroups = groupSuggestionsByPatient(visibleClients);
  const clientCount = new Set(suggestions.map((item) => item.patientId)).size;

  function recorded(saved: ContactSuggestion[]) {
    const suggestion = saved[0]!;
    const keys = new Set(saved.map(suggestionKey));
    const remaining = suggestions.filter(
      (item) => !keys.has(suggestionKey(item)),
    );
    setSuggestions(remaining);
    if (!remaining.some((item) => item.reason === reasonFilter)) {
      setReasonFilter("all");
    }
    setRecording(null);
    setNotice(`Contato com ${suggestion.patientName} registrado.`);
  }

  return (
    <>
      <PatientContextNotice
        patientId={contextPatientId}
        patients={suggestions.map((item) => ({
          id: item.patientId,
          fullName: item.patientName,
          tags: [],
        }))}
      />
      <PageHeader
        title="Contatos sugeridos"
        description="Clientes que merecem um contato agora, com a mensagem pronta para o WhatsApp."
      />
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      <div className="segmented" role="group" aria-label="Visão">
        <button
          className="segment-button"
          type="button"
          aria-pressed={view === "suggestions"}
          onClick={() => setView("suggestions")}
        >
          Contatos sugeridos
        </button>
        <button
          className="segment-button"
          type="button"
          aria-pressed={view === "birthdays"}
          onClick={() => setView("birthdays")}
        >
          Aniversários do mês
        </button>
      </div>
      {view === "birthdays" ? (
        <BirthdaysMonthPanel settings={settings} />
      ) : (
        <section className="panel plans-panel">
          <div className="panel-head">
            <div>
              <h2>Quem contatar</h2>
            </div>
          </div>
          {!loading && suggestions.length > 0 && (
            <div className="filter-group filter-tags">
              <span className="filter-label" id="relationship-reason-filter">
                Situação
              </span>
              <div
                className="tag-filter-list"
                role="group"
                aria-labelledby="relationship-reason-filter"
              >
                <button
                  type="button"
                  className="tag-filter"
                  aria-pressed={reasonFilter === "all"}
                  onClick={() => setReasonFilter("all")}
                >
                  Todas
                  <small>{clientCount}</small>
                </button>
                {reasonOptions.map((reason) => (
                  <button
                    type="button"
                    key={reason}
                    className="tag-filter"
                    aria-pressed={reasonFilter === reason}
                    onClick={() => setReasonFilter(reason)}
                  >
                    {contactReasonLabels[reason]}
                    <small>{counts.get(reason)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {loading ? (
            <LoadingBlock />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nenhum contato sugerido"
              copy="Quando algum cliente precisar de atenção, ele aparece aqui."
            />
          ) : (
            <div className="plans-grid">
              {visibleGroups.map((group) => {
                const suggestion = group[0]!;
                const contactPhone = suggestion.whatsapp || suggestion.phone;
                return (
                  <article className="plan-card" key={suggestion.patientId}>
                    <div className="plan-card-head suggestion-reasons">
                      {group.map((item) => (
                        <span
                          className="status-pill open"
                          key={suggestionKey(item)}
                        >
                          {contactReasonLabels[item.reason]}
                        </span>
                      ))}
                      {suggestion.dueDate && (
                        <span>
                          {shortDate.format(
                            new Date(`${suggestion.dueDate}T12:00:00`),
                          )}
                        </span>
                      )}
                    </div>
                    <h3>
                      <button
                        type="button"
                        className="suggestion-name-button"
                        aria-label={`Ver pendências de ${suggestion.patientName}`}
                        onClick={() => setDetails(group)}
                      >
                        {suggestion.patientName}
                      </button>
                    </h3>
                    {group.map((item) => (
                      <p key={suggestionKey(item)}>{item.detail}</p>
                    ))}
                    <div className="plan-meta">
                      <span>Telefone</span>
                      <strong>{formatPhone(suggestion.phone)}</strong>
                    </div>
                    <div className="plan-actions">
                      <a
                        className="whatsapp-button button-sm"
                        href={whatsappLink(
                          contactPhone,
                          messageFor(suggestion),
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                        WhatsApp
                      </a>
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        onClick={() => setDetails(group)}
                      >
                        <ListChecks size={15} aria-hidden="true" />
                        Pendências
                      </button>
                      {canEdit("relationship") &&
                        can("relationship.activities_create") && (
                          <button
                            className="secondary-button button-sm"
                            onClick={() => {
                              setNotice("");
                              setRecording(group);
                            }}
                          >
                            <PhoneCall size={15} />
                            Registrar contato
                          </button>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {details && (
        <ClientPendingModal
          suggestions={details}
          onClose={() => setDetails(null)}
        />
      )}
      {recording && (
        <ContactActivityModal
          suggestions={recording}
          onClose={() => setRecording(null)}
          onSaved={recorded}
        />
      )}
    </>
  );
}
