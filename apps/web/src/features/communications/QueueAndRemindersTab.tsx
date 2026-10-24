import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import { MessageQueue } from "./MessageQueue";
import type {
  CommunicationCenter,
  CommunicationChannel,
  ManualMessageInput,
  PatientOption,
  ReminderGenerationOptions,
} from "@crm/contracts";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { PatientPicker } from "../../PatientPicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { localIsoDate } from "../../shared/lib/formatting";
import {
  missingLabels,
  useMissingFields,
} from "../../shared/components/MissingFields";
import { BroadcastPanel } from "./BroadcastPanel";

/** Aba "Fila e lembretes": mensagem individual, lembretes, comunicado segmentado e a fila. */
export function QueueAndRemindersTab() {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const contextPatientId = usePatientContext();
  const [center, setCenter] = useState<CommunicationCenter | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState(contextPatientId);
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [body, setBody] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [referenceDate, setReferenceDate] = useState(localIsoDate(tomorrow));
  const [reminderOptions, setReminderOptions] =
    useState<ReminderGenerationOptions>({
      appointments: true,
      payments: can("finance.view"),
      birthdays: false,
      satisfaction: false,
    });
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canManage = canEdit("communications");
  const messageMissing = useMissingFields(
    missingLabels([
      ["Cliente", patientId],
      ["Mensagem administrativa", body],
    ]),
    "field-hint",
  );
  const reminderMissing = useMissingFields(
    [
      ...missingLabels([["Data de referência", referenceDate]]),
      ...(Object.values(reminderOptions).some(Boolean)
        ? []
        : ["Pelo menos um tipo de lembrete"]),
    ],
    "field-hint",
  );

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
      toast.success(
        preference.allowed
          ? "Envios por este canal liberados."
          : "Envios por este canal bloqueados.",
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
    if (working) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await api.generateReminders(
        referenceDate,
        reminderOptions,
      );
      setNotice(
        `${result.queued} lembrete(s) criado(s), ${result.alreadyQueued} já existente(s) e ${result.skippedByPreference} bloqueado(s) por preferência.`,
      );
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const visibleMessages = center
    ? center.messages.filter(
        (message) =>
          !contextPatientId || message.patientId === contextPatientId,
      )
    : [];
  const queuedCount = visibleMessages.filter(
    (message) => message.status === "queued",
  ).length;

  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading || !center ? (
        <LoadingBlock />
      ) : (
        <div className={`communications-layout${canManage ? "" : " single"}`}>
          <section className="panel communication-history">
            <div className="panel-head">
              <div>
                <h2>Fila de mensagens</h2>
                <p className="panel-context">
                  {queuedCount === 1
                    ? "1 mensagem aguardando envio"
                    : `${queuedCount} mensagens aguardando envio`}
                </p>
              </div>
              <span className="list-count">
                <strong>{visibleMessages.length}</strong>
                <span>no total</span>
              </span>
            </div>
            <div className="outbox-note">
              <LockKeyhole size={17} aria-hidden="true" />
              <span>
                A equipe realiza o envio externamente e registra a conclusão
                manual. Abrir um link não registra o envio.
              </span>
            </div>
            <MessageQueue
              messages={visibleMessages}
              allowed={allowed}
              onChanged={load}
              onNotice={(message) => {
                setError("");
                setNotice(message);
              }}
            />
          </section>
          {canManage && (
            <div className="communication-side">
              <section className="panel communication-compose">
                <div className="panel-head">
                  <div>
                    <h2>Adicionar à fila</h2>
                    <p className="panel-context">
                      Mensagem individual para um cliente.
                    </p>
                  </div>
                </div>
                {(can("communications.messages") ||
                  can("communications.preferences")) && (
                  <form className="communication-form" onSubmit={queueMessage}>
                    <PatientPicker
                      required
                      patients={patients}
                      value={patientId}
                      onChange={setPatientId}
                    />
                    <div
                      className="communication-group"
                      role="group"
                      aria-labelledby="communication-preferences-label"
                    >
                      <span
                        className="filter-label"
                        id="communication-preferences-label"
                      >
                        Canais autorizados pelo cliente
                      </span>
                      <div className="communication-options">
                        {(["whatsapp", "email"] as const).map((item) => (
                          <label key={item} className="checkbox-field">
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
                        rows={4}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Não inclua diagnósticos ou informações clínicas."
                      />
                    </label>
                    {messageMissing.hint}
                    <div className="modal-actions">
                      <button
                        className="primary-button"
                        disabled={
                          !can("communications.messages") ||
                          messageMissing.blocked
                        }
                        aria-describedby={messageMissing.describedBy}
                      >
                        Adicionar à fila
                      </button>
                    </div>
                  </form>
                )}
              </section>
              <section className="panel reminder-generator">
                <div className="panel-head">
                  <div>
                    <h2>Gerar lembretes</h2>
                    <p className="panel-context">
                      Repetir a operação não duplica mensagens.
                    </p>
                  </div>
                </div>
                <div className="communication-form">
                  <label>
                    Data de referência
                    <input
                      type="date"
                      value={referenceDate}
                      onChange={(event) => setReferenceDate(event.target.value)}
                    />
                  </label>
                  <div
                    className="communication-group"
                    role="group"
                    aria-labelledby="reminder-kinds-label"
                  >
                    <span className="filter-label" id="reminder-kinds-label">
                      Tipos de lembrete
                    </span>
                    <div className="communication-options">
                      {(
                        [
                          ["appointments", "Atendimentos"],
                          ["payments", "Parcelas vencidas"],
                          ["birthdays", "Aniversários"],
                          ["satisfaction", "Acompanhamento de NPS"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="checkbox-field">
                          <input
                            type="checkbox"
                            disabled={
                              working ||
                              (key === "payments" && !can("finance.view"))
                            }
                            checked={Boolean(reminderOptions[key])}
                            onChange={(event) =>
                              setReminderOptions((current) => ({
                                ...current,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {can("communications.reminders") && reminderMissing.hint}
                  {can("communications.reminders") && (
                    <div className="modal-actions">
                      <button
                        className="primary-button"
                        disabled={working || reminderMissing.blocked}
                        aria-describedby={reminderMissing.describedBy}
                        onClick={() => void generate()}
                      >
                        Gerar lembretes
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
          {canManage && (
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
          )}
        </div>
      )}
    </>
  );
}
