import type {
  AgendaConflict,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import { serviceAvailableFor } from "@crm/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  sessionDateLabel,
  type PlannedSession,
  type SessionException,
} from "./session-schedule";

/**
 * Resumo das sessões geradas pelos dias fixos, antes de fechar a contratação: cada sessão
 * com data, horário, profissional, sala e situação (livre, em conflito ou exceção). A
 * quantidade é sempre a do plano; só dá para alterar uma sessão específica.
 */
export function PlanScheduleSummary({
  sessions,
  professionals,
  rooms,
  services,
  validUntil,
  onException,
  onBlockedChange,
  onNestedChange,
}: {
  sessions: PlannedSession[];
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
  /** Fim da vigência (AAAA-MM-DD): sessões depois dele não podem ser reservadas. */
  validUntil?: string | undefined;
  onException: (key: string, value: SessionException | null) => void;
  /** Motivo que impede a contratação (conflito, fora da vigência, verificação pendente); vazio = liberada. */
  onBlockedChange: (message: string) => void;
  onNestedChange: (open: boolean) => void;
}) {
  const [conflicts, setConflicts] = useState<{
    request: string;
    items: AgendaConflict[];
    error: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<PlannedSession | null>(null);
  const items = sessions.map((session) => ({
    key: session.key,
    professionalId: session.professionalId,
    roomId: session.roomId,
    serviceId: session.serviceId,
    startsAt: new Date(session.local).toISOString(),
  }));
  const request = JSON.stringify(items);
  useEffect(() => {
    if (!items.length) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      api
        .agendaConflicts({ items })
        .then((found) => {
          if (alive) setConflicts({ request, items: found, error: "" });
        })
        .catch((cause: Error) => {
          if (alive) setConflicts({ request, items: [], error: cause.message });
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // `request` resume os itens: só consulta de novo quando algum horário muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, attempt]);
  const current = conflicts?.request === request ? conflicts : null;
  const outOfPeriod = (session: PlannedSession) =>
    Boolean(validUntil && session.local.split("T")[0]! > validUntil);
  const conflictOf = (session: PlannedSession) =>
    current?.items.find((item) => item.key === session.key);
  const blocking = sessions.filter(
    (session) => outOfPeriod(session) || conflictOf(session),
  ).length;
  // Enquanto a consulta não volta (ou falha), a contratação fica travada.
  const blockedMessage = !items.length
    ? ""
    : !current
      ? "Aguarde a verificação de conflitos das sessões."
      : current.error
        ? "Não foi possível verificar os conflitos das sessões. Tente novamente."
        : blocking
          ? `${blocking} ${blocking === 1 ? "sessão está" : "sessões estão"} em conflito ou fora da vigência: altere ${blocking === 1 ? "esse horário" : "esses horários"} antes de contratar.`
          : "";
  useEffect(() => {
    onBlockedChange(blockedMessage);
  }, [blockedMessage, onBlockedChange]);
  function edit(session: PlannedSession | null) {
    setEditing(session);
    onNestedChange(Boolean(session));
  }
  const name = <T extends { id: string }>(
    list: T[],
    id: string,
    label: (item: T) => string,
  ) => {
    const item = list.find((entry) => entry.id === id);
    return item ? label(item) : "";
  };
  if (!sessions.length) return null;
  return (
    <section className="plan-session-summary" aria-label="Resumo das sessões">
      <header className="plan-session-summary-head">
        <h4>Resumo das sessões</h4>
        <p className="panel-context">
          {`${sessions.length} ${sessions.length === 1 ? "sessão" : "sessões"}`}
          {current && !current.error
            ? ` · ${blocking ? `${blocking} em conflito` : "nenhum conflito"}`
            : ""}
        </p>
      </header>
      {!current && <LoadingBlock />}
      {current?.error && (
        <>
          <ErrorBanner error={current.error} />
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Verificar conflitos novamente
          </button>
        </>
      )}
      <ol className="plan-session-list">
        {sessions.map((session) => {
          const conflict = conflictOf(session);
          const late = outOfPeriod(session);
          const service = services.find(
            (item) => item.id === session.serviceId,
          );
          return (
            <li
              key={session.key}
              className="plan-session-row"
              aria-label={`Sessão ${session.number}${service ? ` de ${service.name}` : ""}`}
            >
              <span className="plan-session-number">{session.number}</span>
              <span className="plan-session-when">
                <strong>{sessionDateLabel(session.local)}</strong>
                <small>
                  {[
                    service?.name,
                    name(
                      professionals,
                      session.professionalId,
                      (item) => item.fullName,
                    ),
                    name(rooms, session.roomId, (item) => item.name),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              <span className="plan-session-status">
                {late ? (
                  <span className="status-pill cancelled">
                    Fora da vigência do plano
                  </span>
                ) : conflict ? (
                  <span className="status-pill cancelled">
                    {`Horário indisponível · ${conflict.label}`}
                  </span>
                ) : current && !current.error ? (
                  <span className="status-pill confirmed">Livre</span>
                ) : null}
                {session.exception && (
                  <span className="status-pill scheduled">Exceção</span>
                )}
              </span>
              <span className="plan-session-actions">
                <button
                  type="button"
                  className="secondary-button button-sm"
                  onClick={() => edit(session)}
                >
                  Alterar esta sessão
                </button>
                {session.exception && (
                  <button
                    type="button"
                    className="secondary-button button-sm"
                    onClick={() => onException(session.key, null)}
                  >
                    Voltar ao horário fixo
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {editing &&
        createPortal(
          <SessionExceptionModal
            session={editing}
            professionals={professionals}
            rooms={rooms}
            service={services.find((item) => item.id === editing.serviceId)}
            onClose={() => edit(null)}
            onSave={(value) => {
              onException(editing.key, value);
              edit(null);
            }}
          />,
          document.body,
        )}
    </section>
  );
}

/** Exceção de uma sessão: muda só ela, com o calendário que mostra os atendimentos do dia. */
function SessionExceptionModal({
  session,
  professionals,
  rooms,
  service,
  onClose,
  onSave,
}: {
  session: PlannedSession;
  professionals: Professional[];
  rooms: Room[];
  service: Service | undefined;
  onClose: () => void;
  onSave: (value: SessionException) => void;
}) {
  const [form, setForm] = useState<SessionException>({
    local: session.local,
    professionalId: session.professionalId,
    roomId: session.roomId,
  });
  const [error, setError] = useState("");
  const professionalChoices = professionals.filter(
    (item) =>
      item.id === form.professionalId ||
      (item.active &&
        (!service || serviceAvailableFor(service, item.id, form.roomId))),
  );
  const roomChoices = rooms.filter(
    (item) =>
      item.id === form.roomId ||
      (item.active &&
        (!service ||
          serviceAvailableFor(service, form.professionalId, item.id))),
  );
  return (
    <Modal
      title={`Alterar a sessão ${session.number}`}
      subtitle="Só esta sessão muda; as demais continuam nos dias e horários fixos."
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.local)) {
            setError("Escolha a data e o horário da sessão.");
            return;
          }
          onSave(form);
        }}
      >
        <label>
          Profissional
          <select
            value={form.professionalId}
            onChange={(event) =>
              setForm({ ...form, professionalId: event.target.value })
            }
          >
            {professionalChoices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sala
          <select
            value={form.roomId}
            onChange={(event) =>
              setForm({ ...form, roomId: event.target.value })
            }
          >
            {roomChoices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="span-2">
          <AppointmentDateTimePicker
            value={form.local}
            onChange={(local) => setForm({ ...form, local })}
            professionalId={form.professionalId}
            roomId={form.roomId}
          />
        </div>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Voltar
          </button>
          <button className="primary-button">Salvar esta sessão</button>
        </div>
      </form>
    </Modal>
  );
}
