import {
  maxInstallmentsLimit,
  planPeriodMonths,
  planSessionsForPeriod,
  planTablePriceSummary,
  planTemplateInputSchema,
  planTypeKind,
  planTypeLabels,
  type PlanTemplate,
  type PlanType,
  type Service,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import {
  centsToMoneyText,
  currency,
  reaisToCents,
} from "../../shared/lib/formatting";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { QuickServiceModal } from "./QuickServiceModal";

export function PlanTemplateModal({
  item,
  services: loadedServices,
  onClose,
  onSaved,
  onServiceCreated,
}: {
  item: PlanTemplate | null;
  services: Service[];
  onClose: () => void;
  onSaved: (item: PlanTemplate) => void;
  /** Serviço cadastrado pelo atalho do plano (a lista de quem abriu também atualiza). */
  onServiceCreated?: (service: Service) => void;
}) {
  const { can } = useAuthorization();
  // Atalho para cadastrar serviço sem sair do plano; a lista já mostra o novo serviço.
  const [createdServices, setCreatedServices] = useState<Service[]>([]);
  const services = [
    ...loadedServices,
    ...createdServices.filter(
      (created) => !loadedServices.some((item) => item.id === created.id),
    ),
  ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // Linha do plano que receberá o serviço cadastrado no atalho.
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: item?.name ?? "",
    value: item ? centsToMoneyText(item.totalValueInCents) : "",
    planType: item?.planType ?? (item ? "" : "monthly"),
    acceptsInstallments: item?.maxInstallments !== 1,
    maxInstallments:
      item?.maxInstallments && item.maxInstallments > 1
        ? String(item.maxInstallments)
        : "",
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
  // Mensal é recorrente: uma cobrança por ciclo, sem parcelamento a configurar.
  const recurring =
    (form.planType
      ? planTypeKind(form.planType as PlanType)
      : (item?.kind ?? null)) === "recurring";
  const periodSessions = (entry: (typeof form.services)[number]) =>
    months
      ? planSessionsForPeriod(
          form.planType as PlanType,
          Number(entry.sessionsPerWeek),
        )
      : Number(entry.sessions);
  const total = reaisToCents(form.value);
  // Preço de tabela das sessões avulsas: só referência para definir o valor do plano.
  const tablePrice = planTablePriceSummary(
    form.services.map((entry) => ({
      serviceId: entry.serviceId,
      sessions: months
        ? entry.sessionsPerWeek
          ? periodSessions(entry)
          : 0
        : Number(entry.sessions),
    })),
    services,
  );
  const tableDifference =
    total !== null && tablePrice.totalInCents > 0
      ? tablePrice.totalInCents - total
      : null;
  const sum = form.services.reduce(
    (value, entry) => value + (reaisToCents(entry.value) ?? 0),
    0,
  );
  // O que falta: Salvar fica desativado listando os campos (QM14).
  const missing = useMissingFields(
    [
      form.name.trim().length < 3 && "Nome do plano (pelo menos 3 caracteres)",
      !item && !form.planType && "Tipo de plano",
      !recurring &&
        form.acceptsInstallments &&
        form.maxInstallments !== "" &&
        !(
          Number(form.maxInstallments) >= 2 &&
          Number(form.maxInstallments) <= maxInstallmentsLimit
        ) &&
        `Máximo de parcelas (de 2 a ${maxInstallmentsLimit})`,
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
      maxInstallments: recurring
        ? null
        : !form.acceptsInstallments
          ? 1
          : form.maxInstallments
            ? Number(form.maxInstallments)
            : null,
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
    <>
      <Modal
        title={item ? "Editar plano do catálogo" : "Cadastrar plano"}
        subtitle="Configure o tipo, os serviços, a frequência e o valor total do período."
        busy={saving}
        inactive={creatingFor !== null}
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
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
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
          {!recurring && (
            <fieldset className="span-2 form-grid">
              <legend>Parcelamento</legend>
              <label className="checkbox-field span-2">
                <input
                  type="checkbox"
                  checked={form.acceptsInstallments}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      acceptsInstallments: event.target.checked,
                    })
                  }
                />
                Aceita parcelamento
              </label>
              {form.acceptsInstallments ? (
                <label>
                  Até quantas parcelas
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Até quantas parcelas"
                    min={2}
                    max={maxInstallmentsLimit}
                    placeholder="Sem limite próprio"
                    value={form.maxInstallments}
                    onChange={(event) =>
                      setForm({ ...form, maxInstallments: event.target.value })
                    }
                  />
                  <span className="field-hint">
                    Vazio: vale o limite da forma de pagamento.
                  </span>
                </label>
              ) : (
                <p className="span-2 muted-copy">
                  Vendido só à vista (1 parcela), em qualquer forma de
                  pagamento.
                </p>
              )}
            </fieldset>
          )}
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
                              position !== index &&
                              row.serviceId === service.id,
                          )
                        }
                      >
                        {service.name}
                        {!service.active ? " (inativo)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {can("agenda.services_create") && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  aria-label={`Cadastrar novo serviço para o serviço ${index + 1}`}
                  onClick={() => setCreatingFor(index)}
                >
                  <Plus size={16} aria-hidden="true" />
                  Novo serviço
                </button>
              )}
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
                        updateRow(index, {
                          sessionsPerWeek: event.target.value,
                        })
                      }
                    />
                  </label>
                  <p className="span-2" role="status">
                    {entry.sessionsPerWeek ? periodSessions(entry) : 0} sessões
                    no período
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
          {tablePrice.lines.length > 0 && (
            <section
              className="span-2 plan-table-price"
              aria-label="Preço de tabela dos serviços"
            >
              <div className="plan-table-price-head">
                <strong>Serviços inclusos</strong>
                <span>Preço de tabela</span>
              </div>
              <ul>
                {tablePrice.lines.map((line, position) => {
                  const service = services.find(
                    (item) => item.id === line.serviceId,
                  );
                  return (
                    <li key={`${line.serviceId}-${position}`}>
                      <span>
                        {service?.name ?? "Serviço"}
                        <small>
                          {line.sessions}{" "}
                          {line.sessions === 1 ? "sessão" : "sessões"}
                          {line.unitPriceInCents !== null &&
                            ` × ${currency.format(line.unitPriceInCents / 100)}`}
                        </small>
                      </span>
                      <span>
                        {line.totalInCents === null
                          ? "sem preço de tabela"
                          : currency.format(line.totalInCents / 100)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <dl>
                <div className="plan-table-price-total">
                  <dt>Total avulso</dt>
                  <dd>{currency.format(tablePrice.totalInCents / 100)}</dd>
                </div>
                {total !== null && (
                  <div>
                    <dt>Valor do plano</dt>
                    <dd>{currency.format(total / 100)}</dd>
                  </div>
                )}
                {tableDifference !== null && tableDifference !== 0 && (
                  <div
                    className={
                      tableDifference > 0
                        ? "plan-table-price-discount"
                        : "plan-table-price-surcharge"
                    }
                  >
                    <dt>
                      {tableDifference > 0
                        ? "Desconto para o cliente"
                        : "Acréscimo sobre o avulso"}
                    </dt>
                    <dd>
                      {currency.format(Math.abs(tableDifference) / 100)} (
                      {Math.round(
                        (Math.abs(tableDifference) / tablePrice.totalInCents) *
                          100,
                      )}
                      %)
                    </dd>
                  </div>
                )}
              </dl>
              {tablePrice.missingPrices > 0 && (
                <p className="field-hint">
                  {tablePrice.missingPrices === 1
                    ? "1 serviço sem preço de tabela: o total está incompleto."
                    : `${tablePrice.missingPrices} serviços sem preço de tabela: o total está incompleto.`}
                </p>
              )}
              <p className="field-hint">
                Só referência: quanto o cliente pagaria pelas sessões avulsas.
                Não muda o valor do plano.
              </p>
            </section>
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
      {creatingFor !== null && (
        <QuickServiceModal
          onClose={() => setCreatingFor(null)}
          onCreated={(service) => {
            setCreatedServices((current) => [...current, service]);
            updateRow(creatingFor, { serviceId: service.id });
            onServiceCreated?.(service);
            setCreatingFor(null);
          }}
        />
      )}
    </>
  );
}
