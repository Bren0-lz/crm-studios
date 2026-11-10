import { autoFinalizationDelayLabel, type Appointment } from "@crm/contracts";
import { CheckCheck, CheckCircle2, Search, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useToast } from "../../shared/feedback/toast-context";
import {
  localIsoDate,
  shortDate,
  statusLabel,
  timeLabel,
} from "../../shared/lib/formatting";
import { PendingFinalizationBadge } from "./PendingFinalizationBadge";
import { useAutoFinalizationSettings } from "./useAutoFinalizationSettings";

type BatchStatus = "completed" | "no_show";

type Filters = {
  search: string;
  professionalId: string;
  serviceId: string;
  status: "" | "scheduled" | "confirmed";
  from: string;
  to: string;
};

const initialFilters: Filters = {
  search: "",
  professionalId: "",
  serviceId: "",
  status: "",
  from: "",
  to: "",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Opções únicas (id → nome) dos atendimentos carregados, em ordem alfabética. */
function optionsOf(
  items: Appointment[],
  pick: (item: Appointment) => [string, string],
) {
  return [...new Map(items.map(pick)).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], "pt-BR"),
  );
}

function matches(item: Appointment, filters: Filters) {
  const day = localIsoDate(new Date(item.startsAt));
  return (
    (!filters.search ||
      normalize(item.patientName).includes(normalize(filters.search))) &&
    (!filters.professionalId ||
      item.professionalId === filters.professionalId) &&
    (!filters.serviceId || item.serviceId === filters.serviceId) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.from || day >= filters.from) &&
    (!filters.to || day <= filters.to)
  );
}

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
  const autoFinalization = useAutoFinalizationSettings();
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [error, setError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<BatchStatus | null>(null);
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState<Filters>(initialFilters);

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

  const professionalOptions = useMemo(
    () =>
      optionsOf(items ?? [], (item) => [
        item.professionalId,
        item.professionalName,
      ]),
    [items],
  );
  const serviceOptions = useMemo(
    () => optionsOf(items ?? [], (item) => [item.serviceId, item.serviceName]),
    [items],
  );
  const visible = useMemo(
    () => (items ?? []).filter((item) => matches(item, filters)),
    [items, filters],
  );
  const filtered = Object.values(filters).some(Boolean);
  // Só o que está visível com os filtros atuais entra na ação em lote.
  const selectedVisible = visible.filter((item) => selected.has(item.id));
  const selectedCount = selectedVisible.length;
  const allSelected = visible.length > 0 && selectedCount === visible.length;

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function applyBatch(status: BatchStatus) {
    const ids = selectedVisible.map((item) => item.id);
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
        back={{ to: "/agenda", label: "Voltar à agenda" }}
        title="Atendimentos a finalizar"
        description="Atendimentos que já terminaram e ainda estão como agendados ou confirmados. Registre se foram realizados ou se o cliente faltou."
        action={
          autoFinalization && (
            <div className="page-actions">
              <NavLink to="/agenda/concluidos" className="secondary-button">
                <CheckCheck size={16} aria-hidden="true" />
                Ver concluídos
              </NavLink>
            </div>
          )
        }
      />
      {error && <ErrorBanner error={error} />}
      {batchError && <ErrorBanner error={batchError} />}
      <section className="panel pending-finalization-panel">
        <div className="panel-head">
          <div>
            <h2>
              {items === null
                ? "Carregando…"
                : items.length === 1
                  ? "1 atendimento"
                  : `${items.length} atendimentos`}
            </h2>
            {items && filtered && (
              <p className="panel-context">
                {visible.length === 1
                  ? "1 exibido com os filtros"
                  : `${visible.length} exibidos com os filtros`}
              </p>
            )}
            {autoFinalization && (
              <p className="panel-context">
                {autoFinalization.delayMinutes === 0
                  ? "Finalização automática ligada: viram realizados logo após o término."
                  : `Finalização automática ligada: viram realizados ${autoFinalizationDelayLabel(autoFinalization.delayMinutes)} após o término.`}
              </p>
            )}
          </div>
          {canFinalize && items && items.length > 0 && (
            <div className="page-actions">
              <button
                className="primary-button"
                disabled={selectedCount === 0}
                onClick={() => setConfirming("completed")}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Marcar como realizados
              </button>
              <button
                className="secondary-button"
                disabled={selectedCount === 0}
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
            <div
              className="list-toolbar pending-finalization-filters"
              role="group"
              aria-label="Filtros"
            >
              <label className="pending-finalization-search">
                Cliente
                <span className="pending-finalization-search-input">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Buscar pelo nome"
                    value={filters.search}
                    onChange={(event) =>
                      updateFilter("search", event.target.value)
                    }
                  />
                </span>
              </label>
              <label>
                Profissional
                <select
                  value={filters.professionalId}
                  onChange={(event) =>
                    updateFilter("professionalId", event.target.value)
                  }
                >
                  <option value="">Todos</option>
                  {professionalOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Serviço
                <select
                  value={filters.serviceId}
                  onChange={(event) =>
                    updateFilter("serviceId", event.target.value)
                  }
                >
                  <option value="">Todos</option>
                  {serviceOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Situação
                <select
                  value={filters.status}
                  onChange={(event) =>
                    updateFilter(
                      "status",
                      event.target.value as Filters["status"],
                    )
                  }
                >
                  <option value="">Todas</option>
                  <option value="scheduled">{statusLabel("scheduled")}</option>
                  <option value="confirmed">{statusLabel("confirmed")}</option>
                </select>
              </label>
              <label>
                De
                <input
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(event) => updateFilter("from", event.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(event) => updateFilter("to", event.target.value)}
                />
              </label>
              {filtered && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setFilters(initialFilters)}
                >
                  Limpar filtros
                </button>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyState
                title="Nenhum atendimento encontrado"
                copy="Ajuste a busca ou os filtros para ver outros atendimentos."
              />
            ) : canFinalize ? (
              <div className="pending-finalization-toolbar">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const item of visible) {
                          if (checked) next.add(item.id);
                          else next.delete(item.id);
                        }
                        return next;
                      });
                    }}
                  />
                  Selecionar todos
                </label>
                <span>
                  {selectedCount === 1
                    ? "1 selecionado"
                    : `${selectedCount} selecionados`}
                </span>
              </div>
            ) : (
              <p className="pending-finalization-toolbar">
                Seu acesso não permite registrar presença ou falta.
              </p>
            )}
            {visible.length > 0 && (
              <ul
                className="pending-finalization-list"
                aria-label="Atendimentos a finalizar"
              >
                {visible.map((item) => {
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
            )}
          </>
        )}
      </section>
      {confirming && (
        <ActionModal
          eyebrow="Atendimentos a finalizar"
          title={batchCopy[confirming].title}
          subtitle={
            selectedCount === 1
              ? "1 atendimento selecionado"
              : `${selectedCount} atendimentos selecionados`
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
