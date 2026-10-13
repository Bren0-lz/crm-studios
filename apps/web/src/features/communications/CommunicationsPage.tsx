import type {
  CommunicationCenter,
  CommunicationChannel,
  ManualMessageInput,
  PatientOption,
} from "@crm/contracts";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { localIsoDate } from "../../shared/lib/formatting";
import { BroadcastPanel } from "./BroadcastPanel";

export function CommunicationsPage() {
  const { can, canEdit } = useAuthorization();
  const [center, setCenter] = useState<CommunicationCenter | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [body, setBody] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [referenceDate, setReferenceDate] = useState(localIsoDate(tomorrow));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canManage = canEdit("communications");

  async function load() {
    const [communicationData, patientData] = await Promise.all([
      api.communications(),
      api.patientOptions(),
    ]);
    setCenter(communicationData);
    setPatients(patientData);
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.communications(), api.patientOptions()])
      .then(([communicationData, patientData]) => {
        if (!active) return;
        setCenter(communicationData);
        setPatients(patientData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function allowed(
    targetPatientId: string,
    targetChannel: CommunicationChannel,
  ) {
    return (
      center?.preferences.find(
        (item) =>
          item.patientId === targetPatientId && item.channel === targetChannel,
      )?.allowed ?? true
    );
  }

  async function togglePreference(targetChannel: CommunicationChannel) {
    if (!patientId) return;
    setError("");
    try {
      const preference = await api.setCommunicationPreference({
        patientId,
        channel: targetChannel,
        allowed: !allowed(patientId, targetChannel),
      });
      setCenter((current) =>
        current
          ? {
              ...current,
              preferences: [
                preference,
                ...current.preferences.filter(
                  (item) =>
                    !(
                      item.patientId === patientId &&
                      item.channel === targetChannel
                    ),
                ),
              ],
            }
          : current,
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function queueMessage(event: FormEvent) {
    event.preventDefault();
    if (!can("communications.messages") || !patientId) return;
    setError("");
    setNotice("");
    try {
      const input: ManualMessageInput = { patientId, channel, body };
      await api.queueMessage(input);
      setBody("");
      setNotice("Mensagem adicionada à fila com segurança.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function generate() {
    setError("");
    setNotice("");
    try {
      const result = await api.generateReminders(referenceDate);
      setNotice(
        `${result.queued} lembrete(s) criado(s), ${result.alreadyQueued} já existente(s) e ${result.skippedByPreference} bloqueado(s) por preferência.`,
      );
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Relacionamento operacional"
        title="Central de comunicações"
        description="Prepare lembretes e mensagens sem misturar conteúdo clínico."
      />
      {!canManage && <ReadOnlyNotice module="communications" />}
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading || !center ? (
        <LoadingBlock />
      ) : (
        <div className="communications-layout">
          {canManage && (
            <>
              <section className="panel communication-compose">
                <span className="eyebrow">Mensagem individual</span>
                <h2>Adicionar à fila</h2>
                {(can("communications.messages") ||
                  can("communications.preferences")) && (
                  <form onSubmit={queueMessage}>
                    <PatientPicker
                      required
                      patients={patients}
                      value={patientId}
                      onChange={setPatientId}
                    />
                    <div className="preference-row">
                      {(["whatsapp", "email"] as const).map((item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={allowed(patientId, item)}
                            disabled={
                              !can("communications.preferences") || !patientId
                            }
                            onChange={() => void togglePreference(item)}
                          />
                          {item === "whatsapp"
                            ? "WhatsApp permitido"
                            : "E-mail permitido"}
                        </label>
                      ))}
                    </div>
                    <label>
                      Canal
                      <select
                        value={channel}
                        onChange={(event) =>
                          setChannel(event.target.value as CommunicationChannel)
                        }
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                      </select>
                    </label>
                    <label>
                      Mensagem administrativa
                      <textarea
                        required
                        maxLength={500}
                        rows={5}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Não inclua diagnósticos ou informações clínicas."
                      />
                    </label>
                    <div className="modal-actions">
                      <button
                        className="primary-button"
                        disabled={
                          !can("communications.messages") ||
                          !patientId ||
                          !body.trim()
                        }
                      >
                        Adicionar à fila
                      </button>
                    </div>
                  </form>
                )}
              </section>
              <section className="panel reminder-generator">
                <span className="eyebrow">Automação segura</span>
                <h2>Gerar lembretes</h2>
                <p>
                  Cria avisos de atendimentos da data e parcelas vencidas.
                  Repetir a operação não duplica mensagens.
                </p>
                <label>
                  Data de referência
                  <input
                    type="date"
                    value={referenceDate}
                    onChange={(event) => setReferenceDate(event.target.value)}
                  />
                </label>
                <div className="modal-actions">
                  {can("communications.reminders") && (
                    <button
                      className="primary-button"
                      onClick={() => void generate()}
                    >
                      Gerar lembretes
                    </button>
                  )}
                </div>
                <div className="outbox-note">
                  <LockKeyhole size={17} />
                  <span>
                    Modo fila interna: nenhum envio externo ocorre até um
                    provedor oficial ser configurado.
                  </span>
                </div>
              </section>
              <BroadcastPanel
                patients={patients}
                outboxOnly={center.deliveryMode === "outbox_only"}
                onQueued={(result) => {
                  setError("");
                  setNotice(
                    `${result.queued} mensagem(ns) do comunicado adicionada(s) à fila; ${result.skipped.length} cliente(s) pulado(s).`,
                  );
                  load().catch((cause: Error) => setError(cause.message));
                }}
              />
            </>
          )}
          <section className="panel communication-history">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Outbox</span>
                <h2>Histórico da fila</h2>
              </div>
              <span className="list-count">{center.messages.length}</span>
            </div>
            {center.messages.length === 0 ? (
              <EmptyState
                title="Fila vazia"
                copy="Gere lembretes ou adicione uma mensagem individual."
              />
            ) : (
              <div className="message-list">
                {center.messages.map((message) => (
                  <article key={message.id}>
                    <div>
                      <strong>{message.patientName}</strong>
                      <span>
                        {message.channel === "whatsapp" ? "WhatsApp" : "E-mail"}{" "}
                        ·{" "}
                        {message.kind === "manual"
                          ? "individual"
                          : message.kind === "appointment_reminder"
                            ? "atendimento"
                            : "cobrança"}
                      </span>
                    </div>
                    <p>{message.body}</p>
                    <span className={`status-pill ${message.status}`}>
                      {message.status === "queued" ? "Na fila" : message.status}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
