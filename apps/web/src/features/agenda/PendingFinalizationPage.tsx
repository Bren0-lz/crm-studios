import type { Appointment } from "@crm/contracts";
import { CalendarDays, CheckCircle2, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useToast } from "../../shared/feedback/toast-context";
import { shortDate, statusLabel, timeLabel } from "../../shared/lib/formatting";
import { PendingFinalizationBadge } from "./PendingFinalizationBadge";

type BatchStatus = "completed" | "no_show";

const batchCopy: Record<
  BatchStatus,
  { title: string; effect: string; done: (count: number) => string }
> = {
  completed: {
    title: "Marcar como realizados",
    effect:
      "Os atendimentos selecionados passam a contar como realizados: consomem a sessão do plano e entram nos relatórios.",
    done: (count) =>
      count === 1
        ? "1 atendimento marcado como realizado."
        : `${count} atendimentos marcados como realizados.`,
  },
  no_show: {
    title: "Marcar falta",
    effect:
      "Os atendimentos selecionados ficam como falta do cliente. A falta não consome sessão.",
    done: (count) =>
      count === 1 ? "1 falta registrada." : `${count} faltas registradas.`,
  },
};

/** Atendimentos que já terminaram e seguem agendados/confirmados, de qualquer data (QC2). */
export function PendingFinalizationPage() {
  const { can } = useAuthorization();
  const toast = useToast();
  const canFinalize = can("agenda.attendance");
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [error, setError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BatchStatus | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .pendingFinalizationAppointments()
      .then((data) => {
        if (!active) return;
        setItems(data);
        setError("");
        // Mantém só a seleção do que ainda está pendente.
        setSelected(
          (current) =>
            new Set(
              data.filter((item) => current.has(item.id)).map((i) => i.id),
            ),
        );
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const allSelected =
    items !== null && items.length > 0 && selected.size === items.length;

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function applyBatch(status: BatchStatus) {
    const ids = (items ?? [])
      .filter((item) => selected.has(item.id))
      .map((item) => item.id);
    const failures: string[] = [];
    let done = 0;
    // Uma chamada por atendimento na rota de status: mesmas permissões e regras da agenda.
    for (const id of ids) {
      try {
        await api.updateAppointmentStatus(id, status);
        done += 1;
      } catch (cause) {
        failures.push(
          cause instanceof Error
            ? cause.message
            : "Não foi possível alterar o atendimento.",
        );
      }
    }
    if (done === 0 && failures.length > 0) throw new Error(failures[0]);
    setBatchError(
      failures.length === 0
        ? ""
        : `${failures.length === 1 ? "1 atendimento não pôde" : `${failures.length} atendimentos não puderam`} ser atualizado${failures.length === 1 ? "" : "s"}: ${[...new Set(failures)].join(" ")}`,
    );
    toast.success(batchCopy[status].done(done));
    setConfirming(null);
    setSelected(new Set());
    setReload((value) => value + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Agenda"
        title="Atendimentos a finalizar"
        description="Atendimentos que já terminaram e ainda estão como agendados ou confirmados. Registre se foram realizados ou se o cliente faltou."
        action={
          <NavLink to="/agenda" className="secondary-button">
            <CalendarDays size={16} aria-hidden="true" />
            Ver agenda
          </NavLink>
        }
      />
      {error && <ErrorBanner error={error} />}
      {batchError && <ErrorBanner error={batchError} />}
      <section className="panel pending-finalization-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Pendentes de finalização</span>
            <h2>
              {items === null
                ? "Carregando…"
                : items.length === 1
                  ? "1 atendimento"
                  : `${items.length} atendimentos`}
            </h2>
          </div>
          {canFinalize && items && items.length > 0 && (
            <div className="page-actions">
              <button
                className="primary-button"
                disabled={selected.size === 0}
                onClick={() => setConfirming("completed")}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Marcar como realizados
              </button>
              <button
                className="secondary-button"
                disabled={selected.size === 0}
                onClick={() => setConfirming("no_show")}
              >
                <UserX size={16} aria-hidden="true" />
                Marcar falta
              </button>
            </div>
          )}
        </div>
        {items === null ? (
          error ? null : (
            <LoadingBlock />
          )
        ) : items.length === 0 ? (
          <EmptyState
            title="Nada a finalizar"
            copy="Todos os atendimentos passados já têm o desfecho registrado."
          />
        ) : (
          <>
            {canFinalize ? (
              <div className="pending-finalization-toolbar">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(items.map((item) => item.id))
                          : new Set(),
                      )
                    }
                  />
                  Selecionar todos
                </label>
                <span>
                  {selected.size === 1
                    ? "1 selecionado"
                    : `${selected.size} selecionados`}
                </span>
              </div>
            ) : (
              <p className="pending-finalization-toolbar">
                Seu acesso não permite registrar presença ou falta.
              </p>
            )}
            <ul
              className="pending-finalization-list"
              aria-label="Atendimentos a finalizar"
            >
              {items.map((item) => {
                const startsAt = new Date(item.startsAt);
                const when = `${shortDate.format(startsAt)} às ${timeLabel.format(startsAt)}`;
                return (
                  <li className="pending-finalization-row" key={item.id}>
                    {canFinalize && (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={(event) =>
                          toggle(item.id, event.target.checked)
                        }
                        aria-label={`Selecionar ${item.patientName}, ${when}`}
                      />
                    )}
                    <div className="pending-finalization-info">
                      <strong>{item.patientName}</strong>
                      <span>
                        {when}–{timeLabel.format(new Date(item.endsAt))} ·{" "}
                        {item.serviceName} · {item.professionalName}
                      </span>
                    </div>
                    <span className={`status-pill ${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                    <PendingFinalizationBadge appointment={item} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      {confirming && (
        <ActionModal
          eyebrow="Atendimentos a finalizar"
          title={batchCopy[confirming].title}
          subtitle={
            selected.size === 1
              ? "1 atendimento selecionado"
              : `${selected.size} atendimentos selecionados`
          }
          effect={batchCopy[confirming].effect}
          confirmLabel={batchCopy[confirming].title}
          danger={confirming === "no_show"}
          onClose={() => setConfirming(null)}
          onConfirm={() => applyBatch(confirming)}
        />
      )}
    </>
  );
}
