import {
  inferLeadContactChannel,
  isLeadMessageSent,
  leadContactChannelLabels,
  type ClinicCatalogEntry,
  type Lead,
  type LeadActivity,
  type LeadContact,
  type LeadContactInput,
} from "@crm/contracts";
import { CheckCheck, Clock3, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import {
  shortDateTime,
  toLocalDateTimeInput,
} from "../../shared/lib/formatting";
import { LeadContactTimeline } from "./LeadContactTimeline";

/** Resumo do topo: a última mensagem enviada (data e hora) e o total de contatos. */
function LeadMessageSummary({
  contacts,
  onSendNow,
  sending,
}: {
  contacts: LeadContact[];
  onSendNow: (() => void) | undefined;
  sending: boolean;
}) {
  // D3: ligação, atendimento presencial e tentativa sem resposta não contam como envio.
  const sent = contacts.filter(isLeadMessageSent);
  const last = sent[0];
  const lastAny = contacts[0];
  return (
    <section
      className={`lead-message-summary ${last ? "sent" : "pending"}`}
      aria-label="Situação da mensagem"
    >
      <span className="lead-message-summary-icon" aria-hidden="true">
        {last ? <CheckCheck size={18} /> : <Clock3 size={18} />}
      </span>
      <div>
        <strong>
          {last ? "Mensagem enviada" : "Mensagem ainda não enviada"}
        </strong>
        <span>
          {last
            ? `Último envio em ${shortDateTime(last.occurredAt)} · ${last.actorName}`
            : "Nenhum envio registrado para este lead."}
        </span>
        <span>
          {contacts.length === 0
            ? "Sem contatos no histórico."
            : `${sent.length} ${sent.length === 1 ? "envio" : "envios"} · ${contacts.length} ${contacts.length === 1 ? "contato" : "contatos"} no histórico${lastAny ? ` · último em ${shortDateTime(lastAny.occurredAt)}` : ""}`}
        </span>
      </div>
      {onSendNow && (
        <button
          type="button"
          className="primary-button button-sm"
          disabled={sending}
          onClick={onSendNow}
        >
          <Send size={14} aria-hidden="true" />
          Marcar enviada agora
        </button>
      )}
    </section>
  );
}

export function LeadActivityModal({
  lead,
  onClose,
  onChanged,
  editable,
}: {
  lead: Lead;
  onClose: () => void;
  onChanged: (contact?: LeadContact) => void;
  /** Sem edição do CRM: só o histórico (sem registrar tarefa/contato nem concluir tarefa). */
  editable: boolean;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const currentUser = getStoredUser();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [activity, setActivity] = useState<LeadActivity | null>(null);
  const [tab, setTab] = useState<"contacts" | "tasks">("tasks");
  const [contact, setContact] = useState<LeadContactInput>({
    channel: "phone",
    contactMethod: leadContactChannelLabels.phone,
    direction: "outbound",
    notes: "",
  });
  // Campo único "Canal" (U21): canais padrão + formas de contato do catálogo.
  const [channelCatalog, setChannelCatalog] = useState<ClinicCatalogEntry[]>(
    [],
  );
  useEffect(() => {
    let active = true;
    api
      .clinicCatalog("lead_channel")
      .then((data) => active && setChannelCatalog(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const standardChannels = Object.values(leadContactChannelLabels);
  const channelOptions = [
    ...standardChannels,
    ...channelCatalog
      .filter((item) => item.active)
      .map((item) => item.name)
      .filter(
        (name) =>
          !standardChannels.some(
            (label) => label.toLowerCase() === name.toLowerCase(),
          ),
      ),
  ];
  // "Conseguiu falar?" (só em "Realizado"): "no" grava a tentativa sem resposta.
  const [reached, setReached] = useState<"yes" | "no">("yes");
  const [contactAt, setContactAt] = useState(() =>
    toLocalDateTimeInput(new Date()),
  );
  const [task, setTask] = useState({
    title: "Retornar contato",
    notes: "",
    dueAt: toLocalDateTimeInput(tomorrow),
    assignedUserId: currentUser?.id ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({
    contact: contact.notes,
    task: [task.title, task.notes],
  });
  const taskMissing = useMissingFields(
    [!task.title.trim() && "Tarefa", !task.dueAt && "Vencimento"].filter(
      (item): item is string => Boolean(item),
    ),
  );
  const contactMissing = useMissingFields(
    contact.notes.trim() ? [] : ["Registro do contato"],
  );
  useEffect(() => {
    let active = true;
    api
      .leadActivity(lead.id)
      .then((data) => active && setActivity(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [lead.id]);

  async function addContact(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveContact({
        ...contact,
        ...(contactAt ? { occurredAt: new Date(contactAt).toISOString() } : {}),
        ...(contact.direction === "outbound" && reached === "no"
          ? { reached: false }
          : {}),
      });
      setContact({ ...contact, notes: "" });
      setReached("yes");
      setContactAt(toLocalDateTimeInput(new Date()));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveContact(input: LeadContactInput) {
    const created = await api.createLeadContact(lead.id, input);
    setActivity((current) =>
      current
        ? {
            ...current,
            contacts: [created, ...current.contacts].sort((a, b) =>
              b.occurredAt.localeCompare(a.occurredAt),
            ),
          }
        : current,
    );
    toast.success(
      isLeadMessageSent(input)
        ? `Mensagem registrada em ${shortDateTime(created.occurredAt)}.`
        : "Contato registrado.",
    );
    onChanged(created);
  }

  /** Um clique: grava "Mensagem enviada" com a data e a hora de agora. */
  async function sendNow() {
    const method =
      lead.contactMethod?.trim() || leadContactChannelLabels.whatsapp;
    setSaving(true);
    setError("");
    try {
      await saveContact({
        channel: inferLeadContactChannel(method),
        contactMethod: method,
        direction: "outbound",
        notes: "Mensagem enviada.",
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api.createLeadTask(lead.id, {
        ...task,
        dueAt: new Date(task.dueAt).toISOString(),
      });
      setActivity((current) =>
        current ? { ...current, tasks: [...current.tasks, created] } : current,
      );
      setTask({ ...task, title: "", notes: "" });
      toast.success("Tarefa criada.");
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeTask(taskId: string, status: "completed" | "cancelled") {
    try {
      const updated = await api.updateLeadTaskStatus(taskId, status);
      setActivity((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      toast.success(
        status === "completed" ? "Tarefa concluída." : "Tarefa cancelada.",
      );
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <Modal
      title={lead.fullName}
      subtitle="Contatos e tarefas comerciais em uma única linha do tempo."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      {activity && (
        <LeadMessageSummary
          contacts={activity.contacts}
          sending={saving}
          onSendNow={
            editable && can("crm.contacts_create")
              ? () => void sendNow()
              : undefined
          }
        />
      )}
      <div className="activity-tabs">
        <button
          className={`tab-button ${tab === "tasks" ? "active" : ""}`}
          onClick={() => setTab("tasks")}
        >
          Tarefas (
          {activity?.tasks.filter((item) => item.status === "open").length ?? 0}
          )
        </button>
        <button
          className={`tab-button ${tab === "contacts" ? "active" : ""}`}
          onClick={() => setTab("contacts")}
        >
          Contatos ({activity?.contacts.length ?? 0})
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!activity ? (
        <LoadingBlock />
      ) : tab === "tasks" ? (
        <div className="lead-activity-content">
          {editable && can("crm.tasks_create") && (
            <form className="activity-form" onSubmit={addTask}>
              <label>
                Tarefa
                <input
                  required
                  value={task.title}
                  onChange={(event) =>
                    setTask({ ...task, title: event.target.value })
                  }
                />
              </label>
              <label>
                Vencimento
                <input
                  required
                  type="datetime-local"
                  value={task.dueAt}
                  onChange={(event) =>
                    setTask({ ...task, dueAt: event.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Observações
                <input
                  value={task.notes}
                  onChange={(event) =>
                    setTask({ ...task, notes: event.target.value })
                  }
                />
              </label>
              {taskMissing.hint}
              <div className="modal-actions">
                <button
                  className="primary-button"
                  disabled={saving || taskMissing.blocked}
                  aria-describedby={taskMissing.describedBy}
                >
                  Adicionar tarefa
                </button>
              </div>
            </form>
          )}
          <div className="activity-list">
            {activity.tasks.map((item) => (
              <article key={item.id} className={item.status}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {new Date(item.dueAt).toLocaleString("pt-BR")} ·{" "}
                    {item.assignedUserName ?? "Sem responsável"}
                  </span>
                </div>
                {item.status === "open" && editable ? (
                  <div>
                    {can("crm.tasks_status") && (
                      <button
                        className="secondary-button button-sm"
                        onClick={() => void changeTask(item.id, "completed")}
                      >
                        Concluir
                      </button>
                    )}
                    {can("crm.tasks_status") && (
                      <button
                        className="danger-button button-sm"
                        onClick={() => void changeTask(item.id, "cancelled")}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                ) : (
                  <span>
                    {item.status === "open"
                      ? "Aberta"
                      : item.status === "completed"
                        ? "Concluída"
                        : "Cancelada"}
                  </span>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="lead-activity-content">
          {editable && can("crm.contacts_create") && (
            <form className="activity-form" onSubmit={addContact}>
              <label>
                Canal
                <select
                  value={contact.contactMethod ?? ""}
                  onChange={(event) => {
                    const method = event.target.value;
                    const standard = (
                      Object.entries(leadContactChannelLabels) as Array<
                        [LeadContactInput["channel"], string]
                      >
                    ).find(([, label]) => label === method)?.[0];
                    setContact({
                      ...contact,
                      contactMethod: method,
                      channel: standard ?? inferLeadContactChannel(method),
                    });
                  }}
                >
                  {channelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direção
                <select
                  value={contact.direction}
                  onChange={(event) =>
                    setContact({
                      ...contact,
                      direction: event.target
                        .value as LeadContactInput["direction"],
                    })
                  }
                >
                  <option value="outbound">Realizado</option>
                  <option value="inbound">Recebido</option>
                  <option value="internal">Registro interno</option>
                </select>
              </label>
              {contact.direction === "outbound" && (
                <label>
                  Conseguiu falar?
                  <select
                    value={reached}
                    onChange={(event) =>
                      setReached(event.target.value as "yes" | "no")
                    }
                  >
                    <option value="yes">Sim</option>
                    <option value="no">Não (tentativa sem resposta)</option>
                  </select>
                </label>
              )}
              <label>
                Data e hora
                <input
                  type="datetime-local"
                  value={contactAt}
                  max={toLocalDateTimeInput(new Date())}
                  onChange={(event) => setContactAt(event.target.value)}
                />
              </label>
              <label className="span-2">
                Registro do contato
                <textarea
                  required
                  rows={3}
                  value={contact.notes}
                  onChange={(event) =>
                    setContact({ ...contact, notes: event.target.value })
                  }
                />
              </label>
              {contactMissing.hint}
              <div className="modal-actions">
                <button
                  className="primary-button"
                  disabled={saving || contactMissing.blocked}
                  aria-describedby={contactMissing.describedBy}
                >
                  Registrar contato
                </button>
              </div>
            </form>
          )}
          <LeadContactTimeline contacts={activity.contacts} />
        </div>
      )}
    </Modal>
  );
}
