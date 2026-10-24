import type {
  Patient,
  PatientActivityFilter,
  PatientProfileFilter,
  PatientSegmentSummary,
} from "@crm/contracts";
import {
  patientLastVisitLabels,
  patientNextAppointmentLabels,
} from "@crm/contracts/patients";
import { CalendarCheck, IdCard } from "lucide-react";
import { type ReactNode, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";

type Filter = PatientProfileFilter & PatientActivityFilter;

function uniqueSorted(values: (string | undefined)[]) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function FilterCard({
  icon,
  title,
  count,
  onFirstOpen,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  onFirstOpen?: () => void;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="profile-filters"
      onToggle={(event) => {
        if (event.currentTarget.open && !opened) {
          setOpened(true);
          onFirstOpen?.();
        }
      }}
    >
      <summary>
        <span className="profile-filters-icon" aria-hidden="true">
          {icon}
        </span>
        {title}
        {count > 0 && <span className="filter-badge">{count}</span>}
      </summary>
      <div className="form-grid profile-filters-grid">{children}</div>
    </details>
  );
}

function OptionSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: (string | [string, string])[];
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label>
      {label}
      <select
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">Todos</option>
        {options.map((option) => {
          const [key, name] = Array.isArray(option) ? option : [option, option];
          return (
            <option key={key} value={key}>
              {name}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function PatientProfileFilters({
  patients,
  segments,
  value,
  onChange,
  onSegments,
}: {
  patients: Patient[];
  segments: PatientSegmentSummary[];
  value: Filter;
  onChange: (value: Filter) => void;
  onSegments: (items: PatientSegmentSummary[]) => void;
}) {
  const { can } = useAuthorization();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      onSegments(await api.patientSegments());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const set = (key: keyof Filter, next: string | undefined) =>
    onChange({ ...value, [key]: next });
  const profileKeys = [
    "city",
    "neighborhood",
    "occupation",
    "source",
    "level",
    "interest",
    "gender",
  ] as const;
  const activityKeys = [
    "segment",
    "service",
    "group",
    "professional",
    "lastVisit",
    "nextAppointment",
  ] as const;
  const countOf = (keys: readonly (keyof Filter)[]) =>
    keys.filter((key) => Boolean(value[key])).length;
  const unavailable = busy || Boolean(error);
  return (
    <>
      <FilterCard
        icon={<IdCard size={16} />}
        title="Dados cadastrais"
        count={countOf(profileKeys)}
      >
        {(
          [
            ["city", "Cidade"],
            ["neighborhood", "Bairro"],
            ["occupation", "Profissão"],
            ["source", "Origem"],
            ["level", "Nível"],
          ] as const
        ).map(([key, label]) => (
          <OptionSelect
            key={key}
            label={label}
            value={value[key]}
            options={uniqueSorted(patients.map((item) => item[key]))}
            onChange={(next) => set(key, next)}
          />
        ))}
        <OptionSelect
          label="Interesse"
          value={value.interest}
          options={uniqueSorted(
            patients.flatMap((item) => item.interests ?? []),
          )}
          onChange={(next) => set("interest", next)}
        />
        <OptionSelect
          label="Gênero"
          value={value.gender}
          options={[
            ["female", "Feminino"],
            ["male", "Masculino"],
            ["other", "Outro"],
            ["undisclosed", "Prefere não informar"],
          ]}
          onChange={(next) => set("gender", next)}
        />
      </FilterCard>
      <FilterCard
        icon={<CalendarCheck size={16} />}
        title="Atendimento e relacionamento"
        count={countOf(activityKeys)}
        onFirstOpen={() => void load()}
      >
        <OptionSelect
          label="Segmento operacional"
          disabled={unavailable}
          value={value.segment}
          options={[
            ["active_plan", "Com plano vigente"],
            ["no_plan", "Sem plano vigente"],
            ["renewal", "Renovação em até 30 dias"],
            ["replacement", "Com reposição disponível"],
            ["waiting", "Em lista de espera"],
            ...(can("finance.view")
              ? ([
                  ["pending", "Com contas pendentes"],
                  ["overdue", "Com contas atrasadas"],
                ] as [string, string][])
              : []),
          ]}
          onChange={(next) => set("segment", next)}
        />
        <OptionSelect
          label="Serviço"
          disabled={unavailable}
          value={value.service}
          options={uniqueSorted(
            segments.flatMap((item) => item.services ?? []),
          )}
          onChange={(next) => set("service", next)}
        />
        <OptionSelect
          label="Turma"
          disabled={unavailable}
          value={value.group}
          options={uniqueSorted(segments.flatMap((item) => item.groups ?? []))}
          onChange={(next) => set("group", next)}
        />
        <OptionSelect
          label="Profissional"
          disabled={unavailable}
          value={value.professional}
          options={uniqueSorted(
            segments.flatMap((item) => item.professionals ?? []),
          )}
          onChange={(next) => set("professional", next)}
        />
        <OptionSelect
          label="Último atendimento"
          disabled={unavailable}
          value={value.lastVisit}
          options={Object.entries(patientLastVisitLabels)}
          onChange={(next) => set("lastVisit", next)}
        />
        <OptionSelect
          label="Próximo agendamento"
          disabled={unavailable}
          value={value.nextAppointment}
          options={Object.entries(patientNextAppointmentLabels)}
          onChange={(next) => set("nextAppointment", next)}
        />
        {error && (
          <div className="profile-filters-error">
            <ErrorBanner error={error} />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void load()}
            >
              Tentar novamente
            </button>
          </div>
        )}
      </FilterCard>
    </>
  );
}
