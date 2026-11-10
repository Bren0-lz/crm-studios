import type {
  CampaignLeadFilterOptions,
  LeadAudienceFilter,
} from "@crm/contracts";
import { Check } from "lucide-react";

type ListKey =
  "stages" | "tags" | "sources" | "interests" | "responsibleUserIds";

const dayOptions = [7, 15, 30, 60, 90, 180, 365];

function Choices({
  id,
  label,
  hint,
  items,
  selected,
  onToggle,
}: {
  id: string;
  label: string;
  hint?: string;
  items: Array<{ value: string; label: string }>;
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <span className="span-2 filter-label" id={id}>
        {label}
      </span>
      {hint && <span className="span-2 field-hint">{hint}</span>}
      <div className="span-2 tag-filter-list" role="group" aria-labelledby={id}>
        {items.map((item) => {
          const pressed = selected.includes(item.value);
          return (
            <button
              key={item.value}
              type="button"
              className="tag-filter"
              aria-pressed={pressed}
              onClick={() => onToggle(item.value)}
            >
              {pressed && (
                <Check className="tag-check" size={14} aria-hidden="true" />
              )}
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function DaysField({
  label,
  empty,
  value,
  format,
  onChange,
}: {
  label: string;
  empty: string;
  value: number | undefined;
  format: (days: number) => string;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : undefined)
        }
      >
        <option value="">{empty}</option>
        {dayOptions.map((days) => (
          <option key={days} value={days}>
            {format(days)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Quais leads entram na campanha: etapas do funil (nenhuma = os em aberto), etiquetas,
 * origem, interesse, responsável e tempo de cadastro/sem contato. Usado nas campanhas
 * manuais e nas automáticas.
 */
export function LeadAudienceFields({
  idPrefix,
  value,
  options,
  onChange,
}: {
  idPrefix: string;
  value: LeadAudienceFilter;
  options: CampaignLeadFilterOptions | null | undefined;
  onChange: (value: LeadAudienceFilter) => void;
}) {
  const toggle = (key: ListKey, item: string) => {
    const current = value[key] ?? [];
    onChange({
      ...value,
      [key]: current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    });
  };
  const setDays = (
    key: "createdWithinDays" | "noContactDays",
    days: number | undefined,
  ) => {
    const copy = { ...value };
    delete copy[key];
    if (days) copy[key] = days;
    onChange(copy);
  };
  const plain = (values: string[] = []) =>
    values.map((item) => ({ value: item, label: item }));
  return (
    <div className="span-2 form-grid lead-audience-fields">
      <Choices
        id={`${idPrefix}-stages`}
        label="Etapas do funil"
        hint="Nenhuma marcada = leads em aberto (fora ganhos e perdidos). Lead já convertido só entra marcando a etapa de ganhos."
        items={(options?.stages ?? []).map((stage) => ({
          value: stage.stage,
          label: stage.label,
        }))}
        selected={value.stages ?? []}
        onToggle={(item) => toggle("stages", item)}
      />
      <Choices
        id={`${idPrefix}-tags`}
        label="Etiquetas do lead"
        items={plain(options?.tags)}
        selected={value.tags ?? []}
        onToggle={(item) => toggle("tags", item)}
      />
      {(value.tags?.length ?? 0) > 1 && (
        <div
          className="span-2 campaign-segmented compact"
          role="group"
          aria-label="Etiquetas do lead"
        >
          <button
            type="button"
            className="text-button"
            aria-pressed={(value.tagMode ?? "any") === "any"}
            onClick={() => onChange({ ...value, tagMode: "any" })}
          >
            Qualquer uma
          </button>
          <button
            type="button"
            className="text-button"
            aria-pressed={value.tagMode === "all"}
            onClick={() => onChange({ ...value, tagMode: "all" })}
          >
            Todas
          </button>
        </div>
      )}
      <Choices
        id={`${idPrefix}-sources`}
        label="Origem"
        items={plain(options?.sources)}
        selected={value.sources ?? []}
        onToggle={(item) => toggle("sources", item)}
      />
      <Choices
        id={`${idPrefix}-interests`}
        label="Interesse"
        items={plain(options?.interests)}
        selected={value.interests ?? []}
        onToggle={(item) => toggle("interests", item)}
      />
      <Choices
        id={`${idPrefix}-responsibles`}
        label="Responsável"
        items={(options?.responsibles ?? []).map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        selected={value.responsibleUserIds ?? []}
        onToggle={(item) => toggle("responsibleUserIds", item)}
      />
      <DaysField
        label="Cadastrado"
        empty="Em qualquer data"
        value={value.createdWithinDays}
        format={(days) => `Nos últimos ${days} dias`}
        onChange={(days) => setDays("createdWithinDays", days)}
      />
      <DaysField
        label="Sem contato"
        empty="Com ou sem contato recente"
        value={value.noContactDays}
        format={(days) => `Há ${days} dias ou mais`}
        onChange={(days) => setDays("noContactDays", days)}
      />
    </div>
  );
}
