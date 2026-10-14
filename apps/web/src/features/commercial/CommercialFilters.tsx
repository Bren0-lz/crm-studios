import { buildLeadInsights, type Lead, type LeadFilter } from "@crm/contracts";
import { leadStages } from "../relationship/index";
export function CommercialFilters({
  leads,
  filter,
  onChange,
  visible,
}: {
  leads: Lead[];
  filter: LeadFilter;
  onChange: (value: LeadFilter) => void;
  visible: Lead[];
}) {
  const patch = (key: keyof LeadFilter, value: string) => {
    const next = { ...filter };
    if (value) Object.assign(next, { [key]: value });
    else delete next[key];
    onChange(next);
  };
  const values = (
    key: "source" | "interest" | "contactMethod" | "lostReason",
  ) =>
    [
      ...new Set(
        leads
          .map((lead) => lead[key])
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const insights = buildLeadInsights(visible);
  return (
    <section className="panel">
      <details>
        <summary className="panel-head">Filtros e análise do funil</summary>
        <div className="inventory-body">
          <div className="form-grid">
            <label>
              Buscar no funil
              <input
                value={filter.search ?? ""}
                onChange={(event) => patch("search", event.target.value)}
                placeholder="Nome, contato ou etiqueta"
              />
            </label>
            <label>
              Filtrar etapa
              <select
                value={filter.stage ?? ""}
                onChange={(event) => patch("stage", event.target.value)}
              >
                <option value="">Todas as etapas</option>
                {leadStages.map((stage) => (
                  <option value={stage.value} key={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["source", "Filtrar origem"],
                ["interest", "Filtrar interesse"],
                ["contactMethod", "Filtrar forma de contato"],
                ["lostReason", "Filtrar motivo de perda"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={filter[key] ?? ""}
                  onChange={(event) => patch(key, event.target.value)}
                >
                  <option value="">Todos</option>
                  {values(key).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Filtrar responsável
              <select
                value={filter.responsibleUserId ?? ""}
                onChange={(event) =>
                  patch("responsibleUserId", event.target.value)
                }
              >
                <option value="">Todos os responsáveis</option>
                {[
                  ...new Map(
                    leads
                      .filter((lead) => lead.responsibleUserId)
                      .map((lead) => [
                        lead.responsibleUserId!,
                        lead.responsibleName ?? "Responsável cadastrado",
                      ]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Filtrar tarefas
              <select
                value={filter.tasks ?? ""}
                onChange={(event) => patch("tasks", event.target.value)}
              >
                <option value="">Todas</option>
                <option value="open">Com tarefas abertas</option>
                <option value="overdue">Com tarefas atrasadas</option>
                <option value="none">Sem tarefas abertas</option>
              </select>
            </label>
            <label>
              Filtrar histórico de contato
              <select
                value={filter.contact ?? ""}
                onChange={(event) => patch("contact", event.target.value)}
              >
                <option value="">Todos</option>
                <option value="with">Com contato registrado</option>
                <option value="without">Sem contato registrado</option>
              </select>
            </label>
            <label>
              Cadastrados a partir de
              <input
                type="date"
                value={filter.from ?? ""}
                max={filter.to || undefined}
                onChange={(event) => patch("from", event.target.value)}
              />
            </label>
            <label>
              Cadastrados até
              <input
                type="date"
                value={filter.to ?? ""}
                min={filter.from || undefined}
                onChange={(event) => patch("to", event.target.value)}
              />
            </label>
          </div>
          <button className="secondary-button" onClick={() => onChange({})}>
            Limpar filtros do funil
          </button>
          <p role="status">
            {insights.total} leads no filtro · {insights.openTasks} tarefas
            abertas · {insights.overdueTasks} tarefas atrasadas ·{" "}
            {insights.withoutContact} sem contato registrado.
          </p>
          {[
            { title: "Conversão por origem", rows: insights.sources },
            {
              title: "Conversão por forma de contato",
              rows: insights.contactMethods,
            },
          ].map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>
              {section.rows.map((row) => (
                <div className="table-row" key={row.name}>
                  <strong>{row.name}</strong>
                  <span>
                    {row.leads} leads · {row.won} ganhos · {row.lost} perdas
                  </span>
                  <span className="numeric-value">
                    {row.conversionRate}% de conversão
                  </span>
                </div>
              ))}
            </div>
          ))}
          <h3>Motivos de perda</h3>
          {insights.lostReasons.length ? (
            insights.lostReasons.map((row) => (
              <div className="table-row" key={row.name}>
                <strong>{row.name}</strong>
                <span>{row.leads} perdas</span>
              </div>
            ))
          ) : (
            <p>Nenhuma perda no filtro.</p>
          )}
        </div>
      </details>
    </section>
  );
}
