import {
  planPeriodMonths,
  planSessionsForPeriod,
  planTemplateInputSchema,
  planTypeKind,
  planTypeLabels,
  type PlanTemplate,
  type PlanType,
  type Service,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import {
  centsToMoneyText,
  currency,
  reaisToCents,
} from "../../shared/lib/formatting";
import { MoneyInput } from "../../shared/components/MoneyInput";

export function PlanTemplateModal({
  item,
  services,
  onClose,
  onSaved,
}: {
  item: PlanTemplate | null;
  services: Service[];
  onClose: () => void;
  onSaved: (item: PlanTemplate) => void;
}) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    value: item ? centsToMoneyText(item.totalValueInCents) : "",
    planType: item?.planType ?? (item ? "" : "monthly"),
    services: item?.services.length
      ? item.services.map((entry) => ({
          serviceId: entry.serviceId,
          sessions: String(entry.totalSessions),
          sessionsPerWeek: entry.sessionsPerWeek
            ? String(entry.sessionsPerWeek)
            : "",
          value: centsToMoneyText(entry.totalValueInCents),
        }))
      : [{ serviceId: "", sessions: "1", sessionsPerWeek: "", value: "" }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty(form);
  const months = planPeriodMonths(form.planType as PlanType);
  const periodSessions = (entry: (typeof form.services)[number]) =>
    months
      ? planSessionsForPeriod(
          form.planType as PlanType,
          Number(entry.sessionsPerWeek),
        )
      : Number(entry.sessions);
  const total = reaisToCents(form.value);
  const sum = form.services.reduce(
    (value, entry) => value + (reaisToCents(entry.value) ?? 0),
    0,
  );
  // O que falta: Salvar fica desativado listando os campos (QM14).
  const missing = useMissingFields(
    [
      form.name.trim().length < 3 && "Nome do plano (pelo menos 3 caracteres)",
      !item && !form.planType && "Tipo de plano",
      total === null && "Valor total",
      ...form.services.flatMap((entry, index) => [
        !entry.serviceId && `Serviço ${index + 1}`,
        (months ? !entry.sessionsPerWeek : !entry.sessions) &&
          (months
            ? `Sessões por semana do serviço ${index + 1}`
            : `Sessões do serviço ${index + 1}`),
        form.services.length > 1 &&
          reaisToCents(entry.value) === null &&
          `Valor do serviço ${index + 1}`,
      ]),
    ].filter((entry): entry is string => Boolean(entry)),
  );
  function updateRow(
    index: number,
    patch: Partial<(typeof form.services)[number]>,
  ) {
    setForm((current) => ({
      ...current,
      services: current.services.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = planTemplateInputSchema.safeParse({
      name: form.name,
      totalValueInCents: total,
      planType: form.planType || null,
      kind: form.planType
        ? planTypeKind(form.planType as PlanType)
        : (item?.kind ?? null),
      services: form.services.map((entry) => ({
        serviceId: entry.serviceId,
        totalSessions: periodSessions(entry),
        totalValueInCents:
          form.services.length === 1 ? total : reaisToCents(entry.value),
        sessionsPerWeek: months ? Number(entry.sessionsPerWeek) : null,
      })),
    });
    if (!parsed.success) {
      setError(
        "Informe nome, tipo, serviço, sessões e valor válidos. A soma dos serviços deve corresponder ao total.",
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      onSaved(
        item
          ? await api.updatePlanTemplate(item.id, parsed.data)
          : await api.createPlanTemplate(parsed.data),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={item ? "Editar plano do catálogo" : "Cadastrar plano"}
      subtitle="Configure o tipo, os serviços, a frequência e o valor total do período."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Nome do plano
          <input
            required
            minLength={3}
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Tipo de plano
          <select
            required={!item}
            value={form.planType}
            onChange={(event) =>
              setForm({ ...form, planType: event.target.value })
            }
          >
            {item && !item.planType && (
              <option value="">Manter modelo existente</option>
            )}
            {Object.entries(planTypeLabels).map(([type, label]) => (
              <option value={type} key={type}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor total
          <MoneyInput
            required
            valueInCents={reaisToCents(form.value)}
            onChange={(cents) => {
              const value = centsToMoneyText(cents);
              setForm({
                ...form,
                value,
                services:
                  form.services.length === 1
                    ? [{ ...form.services[0]!, value }]
                    : form.services,
              });
            }}
          />
        </label>
        {months > 0 && (
          <p className="span-2 muted-copy">
            Período de {months} {months === 1 ? "mês" : "meses"}. Saldo
            calculado com 4 semanas por mês. O valor informado é o total desse
            período.
          </p>
        )}
        {form.services.map((entry, index) => (
          <fieldset className="span-2 form-grid" key={index}>
            <legend>Serviço {index + 1}</legend>
            <label>
              Serviço {index + 1}
              <select
                required
                value={entry.serviceId}
                onChange={(event) =>
                  updateRow(index, { serviceId: event.target.value })
                }
              >
                <option value="">Selecione um serviço</option>
                {services
                  .filter(
                    (service) =>
                      service.active || service.id === entry.serviceId,
                  )
                  .map((service) => (
                    <option
                      key={service.id}
                      value={service.id}
                      disabled={
                        !service.active ||
                        form.services.some(
                          (row, position) =>
                            position !== index && row.serviceId === service.id,
                        )
                      }
                    >
                      {service.name}
                      {!service.active ? " (inativo)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            {months ? (
              <>
                <label>
                  Sessões por semana do serviço {index + 1}
                  <input
                    required
                    type="number"
                    min="1"
                    max="7"
                    step="1"
                    value={entry.sessionsPerWeek}
                    onChange={(event) =>
                      updateRow(index, { sessionsPerWeek: event.target.value })
                    }
                  />
                </label>
                <p className="span-2" role="status">
                  {entry.sessionsPerWeek ? periodSessions(entry) : 0} sessões no
                  período
                  {entry.sessionsPerWeek
                    ? ` · ${entry.sessionsPerWeek}x por semana`
                    : ""}
                  .
                </p>
              </>
            ) : (
              <label>
                Sessões do serviço {index + 1}
                <input
                  required
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={entry.sessions}
                  onChange={(event) =>
                    updateRow(index, { sessions: event.target.value })
                  }
                />
              </label>
            )}
            {form.services.length > 1 && (
              <label>
                Valor do serviço {index + 1}
                <MoneyInput
                  required
                  valueInCents={reaisToCents(entry.value)}
                  onChange={(cents) =>
                    updateRow(index, { value: centsToMoneyText(cents) })
                  }
                />
              </label>
            )}
            <button
              type="button"
              className="secondary-button"
              disabled={form.services.length === 1 || saving}
              onClick={() =>
                setForm({
                  ...form,
                  services: form.services.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remover serviço {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary-button span-2"
          disabled={saving}
          onClick={() =>
            setForm({
              ...form,
              services: [
                ...form.services,
                {
                  serviceId: "",
                  sessions: "1",
                  sessionsPerWeek: "",
                  value: "",
                },
              ],
            })
          }
        >
          Adicionar serviço
        </button>
        {form.services.length > 1 && (
          <p className="span-2" role="status">
            Soma dos serviços: {currency.format(sum / 100)} · Diferença:{" "}
            {currency.format(((total ?? 0) - sum) / 100)}
          </p>
        )}
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={
              saving ||
              missing.blocked ||
              (form.services.length > 1 && total !== sum)
            }
            aria-describedby={missing.describedBy}
          >
            {saving ? "Salvando…" : "Salvar plano"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
