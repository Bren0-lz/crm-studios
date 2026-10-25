import { autoFinalizationDelayLabel, type Appointment } from "@crm/contracts";
import { CheckCheck, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  dateLabel,
  localIsoDate,
  shortDate,
  timeLabel,
} from "../../shared/lib/formatting";
import {
  completedOrigin,
  completedPeriodPresets,
  completedPeriodRange,
  groupByDay,
  isCompletedPeriodValid,
  type CompletedOrigin,
  type CompletedPeriod,
  type CompletedPeriodPreset,
} from "./completed-appointments";
import { useAutoFinalizationSettings } from "./useAutoFinalizationSettings";

type Filters = {
  search: string;
  professionalId: string;
  serviceId: string;
  origin: "" | CompletedOrigin;
};

const initialFilters: Filters = {
  search: "",
  professionalId: "",
  serviceId: "",
  origin: "",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
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
  return (
    (!filters.search ||
      normalize(item.patientName).includes(normalize(filters.search))) &&
    (!filters.professionalId ||
      item.professionalId === filters.professionalId) &&
    (!filters.serviceId || item.serviceId === filters.serviceId) &&
    (!filters.origin || completedOrigin(item) === filters.origin)
  );
}

function periodLabel(period: CompletedPeriod) {
  const from = shortDate.format(new Date(`${period.from}T12:00:00`));
  if (period.from === period.to) return from;
  return `${from} a ${shortDate.format(new Date(`${period.to}T12:00:00`))}`;
}

const count = (value: number, one: string, many: string) =>
  value === 1 ? `1 ${one}` : `${value} ${many}`;

/** Atendimentos realizados num período, separando os da finalização automática. */
export function CompletedAppointmentsPage() {
  const { user } = useAuthorization();
  const autoFinalization = useAutoFinalizationSettings();
  const [preset, setPreset] = useState<CompletedPeriodPreset>("last7");
  const [period, setPeriod] = useState<CompletedPeriod>(() =>
    completedPeriodRange("last7"),
  );
  // Resultado da última consulta, marcado com o período a que pertence.
  const [result, setResult] = useState<{
    key: string;
    items?: Appointment[];
    error?: string;
  } | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const validPeriod = isCompletedPeriodValid(period);
  const periodKey = `${period.from}|${period.to}`;
  const current = result?.key === periodKey ? result : null;
  const items = current?.items ?? null;
  const error = current?.error ?? "";

  useEffect(() => {
    if (!validPeriod) return;
    let active = true;
    const key = `${period.from}|${period.to}`;
    // Do início do primeiro dia ao início do dia seguinte ao último, no fuso do navegador.
    const from = new Date(`${period.from}T00:00:00`);
    const to = new Date(`${period.to}T00:00:00`);
    to.setDate(to.getDate() + 1);
    api
      .completedAppointments(from.toISOString(), to.toISOString())
      .then((data) => {
        if (active)
          setResult({
            key,
            items: [...data].sort((a, b) =>
              b.startsAt.localeCompare(a.startsAt),
            ),
          });
      })
      .catch((cause: Error) => {
        if (active) setResult({ key, error: cause.message });
      });
    return () => {
      active = false;
    };
  }, [period, validPeriod]);

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
  const days = useMemo(() => groupByDay(visible), [visible]);
  const automaticCount = (items ?? []).filter(
    (item) => completedOrigin(item) === "automatic",
  ).length;
  const filtered = Object.values(filters).some(Boolean);

  function choosePreset(next: CompletedPeriodPreset) {
    setPreset(next);
    if (next !== "custom") setPeriod(completedPeriodRange(next));
  }

  function updatePeriod(key: keyof CompletedPeriod, value: string) {
    setPreset("custom");
    setPeriod((current) => ({ ...current, [key]: value }));
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <PageHeader
        back={{ to: "/agenda", label: "Voltar à agenda" }}
        title="Atendimentos concluídos"
        description="Atendimentos realizados no período escolhido, registrados pela equipe ou pela finalização automática."
        action={
          user?.role === "admin" && (
            <div className="page-actions">
              <NavLink
                to="/configuracoes?secao=finalizacao"
                className="secondary-button"
              >
                <Settings2 size={16} aria-hidden="true" />
                Configurar
              </NavLink>
            </div>
          )
        }
      />
      {error && <ErrorBanner error={error} />}
      <section className="panel completed-appointments-panel">
        <div className="panel-head completed-appointments-head">
          <div>
            <h2>Período</h2>
            <p className="panel-context">
              {validPeriod ? periodLabel(period) : "Período inválido"}
              {" · "}
              {autoFinalization
                ? `Finalização automática ${autoFinalization.delayMinutes === 0 ? "logo após" : `${autoFinalizationDelayLabel(autoFinalization.delayMinutes)} após`} o término`
                : "Finalização automática desligada"}
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Período rápido">
            {completedPeriodPresets.map((option) => (
              <button
                key={option.key}
                className="segment-button"
                type="button"
                aria-pressed={preset === option.key}
                onClick={() => choosePreset(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div
          className="list-toolbar pending-finalization-filters completed-appointments-filters"
          role="group"
          aria-label="Filtros"
        >
          <label>
            De
            <input
              type="date"
              required
              value={period.from}
              max={period.to || localIsoDate()}
              onChange={(event) => updatePeriod("from", event.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              required
              value={period.to}
              min={period.from || undefined}
              onChange={(event) => updatePeriod("to", event.target.value)}
            />
          </label>
          <label className="pending-finalization-search">
            Cliente
            <span className="pending-finalization-search-input">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar pelo nome"
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
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
            Origem
            <select
              value={filters.origin}
              onChange={(event) =>
                updateFilter("origin", event.target.value as Filters["origin"])
              }
            >
              <option value="">Todas</option>
              <option value="automatic">Finalização automática</option>
              <option value="team">Registrado pela equipe</option>
            </select>
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
        {!validPeriod ? (
          <p className="form-error completed-appointments-message" role="alert">
            Escolha um período de até 1 ano, com a data final igual ou depois da
            inicial.
          </p>
        ) : items === null ? (
          error ? null : (
            <LoadingBlock />
          )
        ) : (
          <>
            <div
              className="completed-appointments-metrics"
              aria-label="Resumo do período"
            >
              <article className="metric-card accent">
                <span>Concluídos</span>
                <strong>{items.length}</strong>
              </article>
              <article className="metric-card">
                <span>Finalização automática</span>
                <strong>{automaticCount}</strong>
              </article>
              <article className="metric-card">
                <span>Registrados pela equipe</span>
                <strong>{items.length - automaticCount}</strong>
              </article>
            </div>
            {items.length === 0 ? (
              <EmptyState
                icon={CheckCheck}
                title="Nenhum atendimento concluído"
                copy="Não há atendimentos realizados neste período. Escolha outras datas para consultar."
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Nenhum atendimento encontrado"
                copy="Ajuste a busca ou os filtros para ver outros atendimentos."
              />
            ) : (
              <div className="completed-appointments-days">
                {filtered && (
                  <p className="pending-finalization-toolbar">
                    {count(
                      visible.length,
                      "exibido com os filtros",
                      "exibidos com os filtros",
                    )}
                  </p>
                )}
                {days.map((day) => (
                  <section
                    key={day.date}
                    className="completed-appointments-day"
                    aria-label={dateLabel.format(
                      new Date(`${day.date}T12:00:00`),
                    )}
                  >
                    <h3>
                      {dateLabel.format(new Date(`${day.date}T12:00:00`))}
                      <span>
                        {count(day.items.length, "atendimento", "atendimentos")}
                      </span>
                    </h3>
                    <ul className="pending-finalization-list">
                      {day.items.map((item) => (
                        <li className="pending-finalization-row" key={item.id}>
                          <div className="pending-finalization-info">
                            <strong>{item.patientName}</strong>
                            <span>
                              {timeLabel.format(new Date(item.startsAt))}–
                              {timeLabel.format(new Date(item.endsAt))} ·{" "}
                              {item.serviceName} · {item.professionalName}
                            </span>
                          </div>
                          {item.autoCompletedAt ? (
                            <span
                              className="auto-finalized-badge"
                              title={`Finalizado automaticamente em ${shortDate.format(new Date(item.autoCompletedAt))} às ${timeLabel.format(new Date(item.autoCompletedAt))}`}
                            >
                              Finalização automática
                            </span>
                          ) : (
                            <span className="status-pill completed">
                              Registrado pela equipe
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
