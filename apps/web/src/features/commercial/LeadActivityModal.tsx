import {
  inferLeadContactChannel,
  leadContactChannelLabels,
  type ClinicCatalogEntry,
  type Lead,
  type LeadActivity,
  type LeadContactInput,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";

export function LeadActivityModal({
  lead,
  onClose,
  onChanged,
  editable,
}: {
  lead: Lead;
  onClose: () => void;
  onChanged: () => void;
  /** Sem edição do CRM: só o histórico (sem registrar tarefa/contato nem concluir tarefa). */
  editable: boolean;
}) {
  const { can } = useAuthorization();
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
  const [task, setTask] = useState({
    title: "Retornar contato",
    notes: "",
    dueAt: toLocalDateTimeInput(tomorrow),
    assignedUserId: currentUser?.id ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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
      const created = await api.createLeadContact(lead.id, contact);
      setActivity((current) =>
        current
          ? { ...current, contacts: [created, ...current.contacts] }
          : current,
      );
      setContact({ ...contact, notes: "" });
      onChanged();
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
      onClose={onClose}
    >
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
              <div className="modal-actions">
                <button className="primary-button" disabled={saving}>
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
              <div className="modal-actions">
                <button className="primary-button" disabled={saving}>
                  Registrar contato
                </button>
              </div>
            </form>
          )}
          <div className="activity-list contact-timeline">
            {activity.contacts.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.notes}</strong>
                  <span>
                    {item.actorName} ·{" "}
                    {new Date(item.occurredAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <span>
                  {item.contactMethod || leadContactChannelLabels[item.channel]}
                </span>
              </article>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
