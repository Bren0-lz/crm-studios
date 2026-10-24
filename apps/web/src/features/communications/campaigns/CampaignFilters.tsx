import {
  campaignAppointmentStatusLabels,
  patientTagDisplayColor,
  type CampaignAppointmentStatus,
  type CampaignFilterOptions,
  type PatientOption,
  type WhatsappCampaignSegment,
} from "@crm/contracts";
import {
  CalendarHeart,
  ClipboardList,
  Repeat2,
  RotateCcw,
  Stethoscope,
  Tags,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { TagChoice } from "../../../shared/components/TagChoice";
import { usePatientTags } from "../../../shared/hooks/usePatientTags";
import { localIsoDate, tagCounts } from "../../../shared/lib/formatting";
import {
  activeFilterCount,
  appointmentPeriodPresets,
  emptyCampaignSegment,
  filterGroupCounts,
  type CampaignFilterGroup,
} from "./model";

const months = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function Group({
  id,
  title,
  icon: Icon,
  count,
  open = false,
  children,
}: {
  id: CampaignFilterGroup;
  title: string;
  icon: LucideIcon;
  count: number;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="campaign-filter-group"
      open={open || count > 0}
      data-group={id}
    >
      <summary>
        <span className="campaign-filter-group-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span>{title}</span>
        {count > 0 && (
          <span className="campaign-filter-badge">
            {count} {count === 1 ? "filtro" : "filtros"}
          </span>
        )}
      </summary>
      <div className="form-grid">{children}</div>
    </details>
  );
}

/** Select com opções vindas dos cadastros (cidade, bairro…); vazio = sem filtro. */
function ProfileSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  // Sem nenhum cliente com o dado preenchido, o filtro não ajuda: fica escondido.
  if (options.length === 0 && !value) return null;
  return (
    <label>
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DaysSelect({
  label,
  value,
  empty,
  options,
  format,
  onChange,
}: {
  label: string;
  value: number | undefined;
  empty: string;
  options: number[];
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
        {options.map((days) => (
          <option key={days} value={days}>
            {format(days)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Período de atendimento (de/até, com atalhos) e quais atendimentos contam.
 * Mantém o início antes do fim ajustando o outro limite.
 */
function AppointmentPeriod({
  value,
  onChange,
}: {
  value: WhatsappCampaignSegment;
  onChange: (value: WhatsappCampaignSegment) => void;
}) {
  const from = value.appointmentFrom;
  const to = value.appointmentTo;
  const update = (
    nextFrom: string | undefined,
    nextTo: string | undefined,
    status = value.appointmentStatus,
  ) => {
    const copy = { ...value };
    delete copy.appointmentFrom;
    delete copy.appointmentTo;
    delete copy.appointmentStatus;
    if (nextFrom) copy.appointmentFrom = nextFrom;
    if (nextTo) copy.appointmentTo = nextTo;
    if ((nextFrom || nextTo) && status && status !== "open")
      copy.appointmentStatus = status;
    onChange(copy);
  };
  const hasPeriod = Boolean(from || to);
  return (
    <div className="span-2 campaign-period">
      <span className="filter-label" id="campaign-period">
        Com atendimento no período
      </span>
      <div
        className="campaign-segmented compact"
        role="group"
        aria-labelledby="campaign-period"
      >
        {appointmentPeriodPresets(localIsoDate()).map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="text-button"
            aria-pressed={from === preset.from && to === preset.to}
            onClick={() => update(preset.from, preset.to)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="campaign-range">
        <label>
          De
          <input
            type="date"
            value={from ?? ""}
            onChange={(event) => {
              const next = event.target.value || undefined;
              update(next, next && to && to < next ? next : to);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to ?? ""}
            onChange={(event) => {
              const next = event.target.value || undefined;
              update(next && from && from > next ? next : from, next);
            }}
          />
        </label>
        <label>
          Quais atendimentos
          <select
            value={value.appointmentStatus ?? "open"}
            disabled={!hasPeriod}
            onChange={(event) =>
              update(from, to, event.target.value as CampaignAppointmentStatus)
            }
          >
            {(
              Object.entries(campaignAppointmentStatusLabels) as [
                CampaignAppointmentStatus,
                string,
              ][]
            ).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <small className="field-hint">
        {hasPeriod
          ? "Serviços e profissionais escolhidos abaixo valem só para os atendimentos do período. Na mensagem, os códigos de data e hora usam o primeiro atendimento do período."
          : "Só o início ou só o fim também vale. Para lembrete, use os códigos de data e hora do atendimento na mensagem."}
      </small>
    </div>
  );
}

const ageValue = (value: string) =>
  value === "" ? undefined : Math.max(0, Math.min(120, Number(value)));

/**
 * Filtros da campanha em grupos (etiquetas, perfil, datas, agenda, planos e
 * repetição). Cada grupo mostra quantos filtros estão ligados.
 */
export function CampaignFilters({
  value,
  options,
  patients,
  onChange,
}: {
  value: WhatsappCampaignSegment;
  options: CampaignFilterOptions | null;
  patients: PatientOption[];
  onChange: (value: WhatsappCampaignSegment) => void;
}) {
  const configuredTags = usePatientTags();
  const tagOptions = configuredTags.tags ?? [];
  const countTag = tagCounts(patients);
  const counts = filterGroupCounts(value);
  const total = activeFilterCount(value);
  const set = <K extends keyof WhatsappCampaignSegment>(
    key: K,
    next: WhatsappCampaignSegment[K],
  ) => {
    const copy = { ...value, [key]: next };
    if (next === undefined) delete copy[key];
    onChange(copy);
  };
  const toggle = (
    key: "tags" | "excludeTags" | "serviceIds" | "professionalIds",
    item: string,
  ) => {
    const current = value[key] ?? [];
    set(
      key,
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    );
  };

  return (
    <div className="campaign-filters">
      <div className="campaign-filters-head">
        <strong>
          {total === 0
            ? "Todos os clientes"
            : `${total} ${total === 1 ? "filtro ligado" : "filtros ligados"}`}
        </strong>
        {total > 0 && (
          <button
            type="button"
            className="text-button button-sm"
            onClick={() => onChange(emptyCampaignSegment())}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Limpar filtros
          </button>
        )}
      </div>

      <Group id="tags" title="Etiquetas" icon={Tags} count={counts.tags} open>
        {configuredTags.error ? (
          <p className="form-error span-2">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
        ) : tagOptions.length === 0 ? (
          <p className="field-hint span-2">Nenhuma etiqueta cadastrada.</p>
        ) : (
          <>
            <div className="span-2 campaign-filter-row">
              <span className="filter-label" id="campaign-tag-filter">
                Com as etiquetas
              </span>
              <div
                className="campaign-segmented compact"
                role="group"
                aria-label="Como combinar as etiquetas"
              >
                <button
                  type="button"
                  className="text-button"
                  aria-pressed={value.tagMode !== "all"}
                  onClick={() => set("tagMode", "any")}
                >
                  Qualquer uma
                </button>
                <button
                  type="button"
                  className="text-button"
                  aria-pressed={value.tagMode === "all"}
                  onClick={() => set("tagMode", "all")}
                >
                  Todas
                </button>
              </div>
            </div>
            <div
              className="span-2 tag-filter-list"
              role="group"
              aria-labelledby="campaign-tag-filter"
            >
              {tagOptions.map((tag) => (
                <TagChoice
                  key={tag.id}
                  name={tag.name}
                  color={patientTagDisplayColor(tag)}
                  count={countTag(tag.name)}
                  pressed={(value.tags ?? []).includes(tag.name)}
                  onToggle={() => toggle("tags", tag.name)}
                />
              ))}
            </div>
            <span className="span-2 filter-label" id="campaign-exclude-tags">
              Tirar quem tem
            </span>
            <div
              className="span-2 tag-filter-list campaign-exclude-tags"
              role="group"
              aria-labelledby="campaign-exclude-tags"
            >
              {tagOptions.map((tag) => (
                <TagChoice
                  key={tag.id}
                  name={tag.name}
                  color={patientTagDisplayColor(tag)}
                  pressed={(value.excludeTags ?? []).includes(tag.name)}
                  onToggle={() => toggle("excludeTags", tag.name)}
                />
              ))}
            </div>
          </>
        )}
      </Group>

      <Group
        id="profile"
        title="Perfil do cliente"
        icon={UserRound}
        count={counts.profile}
        open
      >
        <label>
          Situação
          <select
            value={value.status ?? ""}
            onChange={(event) =>
              set(
                "status",
                (event.target.value || undefined) as
                  WhatsappCampaignSegment["status"] | undefined,
              )
            }
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
        <label>
          Gênero
          <select
            value={value.gender ?? ""}
            onChange={(event) =>
              set(
                "gender",
                (event.target.value || undefined) as
                  WhatsappCampaignSegment["gender"] | undefined,
              )
            }
          >
            <option value="">Todos</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
            <option value="other">Outro</option>
            <option value="undisclosed">Prefere não informar</option>
          </select>
        </label>
        <div className="campaign-age">
          <label>
            Idade de
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={120}
              placeholder="0"
              value={value.ageMin ?? ""}
              onChange={(event) => set("ageMin", ageValue(event.target.value))}
            />
          </label>
          <label>
            até
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={120}
              placeholder="120"
              value={value.ageMax ?? ""}
              onChange={(event) => set("ageMax", ageValue(event.target.value))}
            />
          </label>
        </div>
        <ProfileSelect
          label="Cidade"
          value={value.city}
          options={options?.cities ?? []}
          onChange={(next) => set("city", next)}
        />
        <ProfileSelect
          label="Bairro"
          value={value.neighborhood}
          options={options?.neighborhoods ?? []}
          onChange={(next) => set("neighborhood", next)}
        />
        <ProfileSelect
          label="Origem"
          value={value.source}
          options={options?.sources ?? []}
          onChange={(next) => set("source", next)}
        />
        <ProfileSelect
          label="Profissão"
          value={value.occupation}
          options={options?.occupations ?? []}
          onChange={(next) => set("occupation", next)}
        />
        <ProfileSelect
          label="Interesse"
          value={value.interest}
          options={options?.interests ?? []}
          onChange={(next) => set("interest", next)}
        />
        <ProfileSelect
          label="Nível"
          value={value.level}
          options={options?.levels ?? []}
          onChange={(next) => set("level", next)}
        />
      </Group>

      <Group
        id="dates"
        title="Aniversário e cadastro"
        icon={CalendarHeart}
        count={counts.dates}
      >
        <label>
          Aniversariantes
          <select
            value={
              value.birthdayMonth ? "current" : String(value.birthMonth ?? "")
            }
            onChange={(event) => {
              const next = event.target.value;
              const copy = { ...value, birthdayMonth: next === "current" };
              delete copy.birthMonth;
              if (next && next !== "current") copy.birthMonth = Number(next);
              onChange(copy);
            }}
          >
            <option value="">Qualquer mês</option>
            <option value="current">Deste mês</option>
            {months.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <DaysSelect
          label="Clientes novos"
          value={value.newClientDays}
          empty="Todos"
          options={[30, 60, 90, 180, 365]}
          format={(days) => `Desde os últimos ${days} dias`}
          onChange={(next) => set("newClientDays", next)}
        />
      </Group>

      <Group
        id="agenda"
        title="Atendimentos e frequência"
        icon={Stethoscope}
        count={counts.agenda}
      >
        <AppointmentPeriod value={value} onChange={onChange} />
        {(options?.services.length ?? 0) > 0 && (
          <>
            <span className="span-2 filter-label" id="campaign-services">
              Fez algum destes serviços
            </span>
            <div
              className="span-2 tag-filter-list"
              role="group"
              aria-labelledby="campaign-services"
            >
              {options!.services.map((service) => (
                <TagChoice
                  key={service.id}
                  name={service.name}
                  color="#26705f"
                  pressed={(value.serviceIds ?? []).includes(service.id)}
                  onToggle={() => toggle("serviceIds", service.id)}
                />
              ))}
            </div>
          </>
        )}
        {(options?.professionals.length ?? 0) > 0 && (
          <>
            <span className="span-2 filter-label" id="campaign-professionals">
              Atendido por
            </span>
            <div
              className="span-2 tag-filter-list"
              role="group"
              aria-labelledby="campaign-professionals"
            >
              {options!.professionals.map((professional) => (
                <TagChoice
                  key={professional.id}
                  name={professional.name}
                  color="#c96f50"
                  pressed={(value.professionalIds ?? []).includes(
                    professional.id,
                  )}
                  onToggle={() => toggle("professionalIds", professional.id)}
                />
              ))}
            </div>
          </>
        )}
        <DaysSelect
          label="Sumidos"
          value={value.absentDays}
          empty="Todos"
          options={[15, 30, 60, 90, 180]}
          format={(days) => `Sem vir há ${days} dias ou mais`}
          onChange={(next) => set("absentDays", next)}
        />
        <DaysSelect
          label="Frequentes"
          value={value.visitedWithinDays}
          empty="Todos"
          options={[7, 15, 30, 60, 90]}
          format={(days) => `Vieram nos últimos ${days} dias`}
          onChange={(next) => set("visitedWithinDays", next)}
        />
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={Boolean(value.noUpcomingAppointment)}
            onChange={(event) =>
              set("noUpcomingAppointment", event.target.checked)
            }
          />
          Sem atendimento futuro agendado
        </label>
      </Group>

      <Group
        id="plans"
        title="Planos e financeiro"
        icon={WalletCards}
        count={counts.plans}
      >
        <label>
          Plano
          <select
            value={
              value.activePlan === undefined
                ? ""
                : value.activePlan
                  ? "with"
                  : "without"
            }
            onChange={(event) =>
              set(
                "activePlan",
                event.target.value === ""
                  ? undefined
                  : event.target.value === "with",
              )
            }
          >
            <option value="">Todos</option>
            <option value="with">Com plano ativo</option>
            <option value="without">Sem plano ativo</option>
          </select>
        </label>
        <DaysSelect
          label="Plano vencendo"
          value={value.planExpiringDays}
          empty="Qualquer data"
          options={[7, 15, 30, 60]}
          format={(days) => `Nos próximos ${days} dias`}
          onChange={(next) => set("planExpiringDays", next)}
        />
        <label>
          Sessões restantes
          <select
            value={value.maxRemainingSessions ?? ""}
            onChange={(event) =>
              set(
                "maxRemainingSessions",
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
              )
            }
          >
            <option value="">Qualquer quantidade</option>
            {[0, 1, 2, 3, 5].map((sessions) => (
              <option key={sessions} value={sessions}>
                {sessions === 0 ? "Nenhuma" : `Até ${sessions}`}
              </option>
            ))}
          </select>
        </label>
        {options?.finance && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(value.overdue)}
              onChange={(event) => set("overdue", event.target.checked)}
            />
            Com parcela vencida
          </label>
        )}
      </Group>

      <Group
        id="repeat"
        title="Evitar repetição"
        icon={Repeat2}
        count={counts.repeat}
      >
        <DaysSelect
          label="Tirar quem já recebeu campanha"
          value={value.excludeContactedDays}
          empty="Não tirar ninguém"
          options={[3, 7, 15, 30, 60]}
          format={(days) => `Nos últimos ${days} dias`}
          onChange={(next) => set("excludeContactedDays", next)}
        />
        <p className="field-hint campaign-filter-note">
          <ClipboardList size={14} aria-hidden="true" />
          Conta as mensagens marcadas como enviadas nas campanhas.
        </p>
      </Group>
    </div>
  );
}
