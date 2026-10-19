import {
  type PatientPlan,
  planPeriodEnd,
  planPeriodMonths,
  type PlanTemplate,
  planTypeKind,
  type Service,
} from "@crm/contracts";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from "react";
import { PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import type { GuidedSingleForm } from "./types";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PlanInstallmentsField } from "../plans/index";

export function GuidedPlanFields<T extends GuidedSingleForm>({
  form,
  setForm,
  onServiceChange,
  kindField,
  children,
}: {
  form: T;
  setForm: Dispatch<SetStateAction<T>>;
  onServiceChange?: () => void;
  kindField?: ReactNode;
  children?: ReactNode;
}) {
  const { can } = useAuthorization();
  // Sem `kindField` o campo vende serviço avulso: planos do tipo "Plano avulso" (`single`).
  const single = !kindField;
  const [services, setServices] = useState<Service[] | null>(null);
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api.services(), api.planTemplates()])
      .then(([data, catalog]) => {
        if (!active) return;
        setServices(data);
        setTemplates(
          catalog.filter((item) => item.active && item.services.length > 0),
        );
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loadError)
    return (
      <p className="form-error">{`Não foi possível carregar os planos: ${loadError}`}</p>
    );
  if (services === null) return <LoadingBlock />;
  const compatible = templates.filter((item) => {
    const kind = item.planType ? planTypeKind(item.planType) : item.kind;
    return single ? kind === "single" : kind !== "single";
  });
  if (compatible.length === 0 && single)
    return (
      <EmptyState
        icon={PackageOpen}
        title="Nenhum serviço avulso cadastrado."
        copy={
          can("settings.plans_create")
            ? "Serviços avulsos são planos do tipo “Plano avulso”. Cadastre em Configurações › Planos e depois escolha a opção de novo."
            : "Serviços avulsos são planos do tipo “Plano avulso”, cadastrados em Configurações › Planos. Peça a um administrador para cadastrar."
        }
        action={
          can("settings.plans_create") ? (
            <Link
              className="secondary-button"
              to="/configuracoes?secao=planos"
              target="_blank"
              rel="noreferrer"
            >
              Cadastrar serviço avulso (nova aba)
            </Link>
          ) : undefined
        }
      />
    );
  if (compatible.length === 0)
    return (
      <p className="muted-copy">
        Nenhum plano ativo cadastrado para esta opção. Cadastre um plano em
        Configurações › Planos.
      </p>
    );
  return (
    <div className="form-grid">
      <label className={single ? "span-2" : undefined}>
        Plano cadastrado
        <select
          required
          value={form.planTemplateId}
          onChange={(e) => {
            const template = compatible.find(
              (item) => item.id === e.target.value,
            );
            setForm({
              ...form,
              planTemplateId: template?.id ?? "",
              name: template?.name ?? "",
              services: template?.services.map((entry) => ({ ...entry })) ?? [],
              totalValueInCents: template?.totalValueInCents ?? 0,
              ...("kind" in form
                ? (() => {
                    const kind = template?.planType
                      ? planTypeKind(template.planType)
                      : (template?.kind ?? "fixed_package");
                    // Recorrente: uma cobrança por ciclo.
                    return {
                      kind,
                      installments:
                        kind === "recurring" ? 1 : form.installments,
                    };
                  })()
                : {}),
              validUntil: template?.planType
                ? planPeriodEnd(template.planType, form.validFrom)
                : "",
              autoRenew: false,
            });
            onServiceChange?.();
          }}
        >
          <option value="">
            {single ? "Selecione um serviço avulso" : "Selecione um plano"}
          </option>
          {compatible.map((item) => (
            <option value={item.id} key={item.id}>
              {single ? singleServiceLabel(item, services) : item.name}
            </option>
          ))}
        </select>
      </label>
      {kindField}
      {form.services.map((entry, index) => (
        <fieldset
          className="form-fieldset span-2 form-grid"
          key={entry.serviceId}
        >
          <legend>
            {services.find((item) => item.id === entry.serviceId)?.name ??
              "Serviço"}
          </legend>
          <label>
            Sessões do serviço {index + 1}
            <input
              required
              type="number"
              min="1"
              max="1000"
              value={entry.totalSessions}
              onChange={(event) =>
                setForm({
                  ...form,
                  services: form.services.map((item, position) =>
                    position === index
                      ? { ...item, totalSessions: Number(event.target.value) }
                      : item,
                  ),
                })
              }
            />
          </label>
          <label>
            Valor do serviço {index + 1}
            <MoneyInput
              required
              valueInCents={entry.totalValueInCents}
              onChange={(cents) => {
                const entries = form.services.map((item, position) =>
                  position === index
                    ? {
                        ...item,
                        totalValueInCents: cents ?? 0,
                      }
                    : item,
                );
                setForm({
                  ...form,
                  services: entries,
                  totalValueInCents: entries.reduce(
                    (sum, item) => sum + item.totalValueInCents,
                    0,
                  ),
                });
              }}
            />
          </label>
        </fieldset>
      ))}
      <label className="span-2">
        Valor total
        <input readOnly value={currency.format(form.totalValueInCents / 100)} />
      </label>
      <label>
        Início
        <input
          required
          type="date"
          value={form.validFrom}
          onChange={(event) => {
            const template = templates.find(
              (item) => item.id === form.planTemplateId,
            );
            setForm({
              ...form,
              validFrom: event.target.value,
              ...(template?.planType && planPeriodMonths(template.planType)
                ? {
                    validUntil: planPeriodEnd(
                      template.planType,
                      event.target.value,
                    ),
                  }
                : {}),
            });
          }}
        />
      </label>
      <label>
        Fim da validade
        <input
          type="date"
          value={form.validUntil}
          onChange={(event) =>
            setForm({
              ...form,
              validUntil: event.target.value,
              autoRenew: Boolean(event.target.value) && form.autoRenew,
            })
          }
        />
      </label>
      <PlanInstallmentsField
        kind={"kind" in form ? (form.kind as PatientPlan["kind"]) : undefined}
        installments={form.installments}
        firstDueDate={form.firstDueDate}
        validUntil={form.validUntil}
        onChange={(installments) => setForm({ ...form, installments })}
      />
      <label>
        Primeiro vencimento
        <input
          required
          type="date"
          value={form.firstDueDate}
          onChange={(event) =>
            setForm({ ...form, firstDueDate: event.target.value })
          }
        />
      </label>
      <label className="checkbox-field span-2">
        <input
          type="checkbox"
          disabled={!form.validUntil}
          checked={Boolean(form.autoRenew)}
          onChange={(event) =>
            setForm({ ...form, autoRenew: event.target.checked })
          }
        />
        Renovar automaticamente ao fim da validade, com as mesmas condições
      </label>
      {children}
    </div>
  );
}

/** "Nome · Serviço · R$ 90,00 · 1 sessão de 50 min": o que o cliente leva no avulso. */
function singleServiceLabel(template: PlanTemplate, services: Service[]) {
  const parts = template.services.map((entry) => {
    const service = services.find((item) => item.id === entry.serviceId);
    const sessions = `${entry.totalSessions} ${entry.totalSessions === 1 ? "sessão" : "sessões"}`;
    return {
      name: service?.name ?? "Serviço",
      sessions: service?.durationMinutes
        ? `${sessions} de ${service.durationMinutes} min`
        : sessions,
    };
  });
  return [
    template.name,
    parts.map((part) => part.name).join(" + "),
    currency.format(template.totalValueInCents / 100),
    parts.map((part) => part.sessions).join(" + "),
  ].join(" · ");
}
