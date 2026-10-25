import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import type { CloseGuard } from "../../shared/workflows/types";
import {
  nextPlanPeriod,
  paymentMethodLabels,
  paymentMethodSchema,
  planPeriodEnd,
  planPeriodMonths,
  planServiceValueForSessions,
  planTypeKind,
  planTypeLabels,
  type PatientOption,
  type PatientPlan,
  type PatientPlanInput,
  type PaymentMethod,
  type PlanTemplate,
  type Service,
} from "@crm/contracts";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { NavLink } from "react-router-dom";
import { PlanInstallmentsField } from "./PlanInstallmentsField";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { FixedPatient } from "../../shared/components/FixedPatient";
import { useMissingFields } from "../../shared/components/MissingFields";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PlanGroupPicker } from "../../shared/components/PlanGroupPicker";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import type { GroupChoices } from "../../shared/workflows/types";
import {
  useConfirmDiscard,
  useModalDirty,
} from "../../shared/workflows/ModalGuardContext";
import {
  planKindLabels,
  planTemplateCatalogKind,
  type PlanCatalogKind,
} from "./model";

export function PlanForm({
  patients,
  services,
  renewing,
  fixedPatient,
  groups,
  onCancel,
  onBusyChange,
  onSubmit,
  renderAdditional,
  additionalDirty = false,
  registerCloseGuard,
  catalogKind,
}: {
  patients: PatientOption[];
  services: Service[];
  renewing?: PatientPlan | undefined;
  fixedPatient?: PatientOption | undefined;
  groups?: GroupChoices | undefined;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onSubmit: (input: PatientPlanInput, groupId?: string) => Promise<void>;
  renderAdditional?: ((input: PatientPlanInput) => ReactNode) | undefined;
  additionalDirty?: boolean;
  registerCloseGuard?: ((guard: CloseGuard) => () => void) | undefined;
  /** Restringe os planos cadastrados a avulsos ou recorrentes (atalho da ficha do cliente). */
  catalogKind?: PlanCatalogKind | undefined;
}) {
  const { can, canView } = useAuthorization();
  const currentDate = localIsoDate();
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const [form, setForm] = useState<PatientPlanInput>(() => {
    if (!renewing) {
      return {
        planTemplateId: "",
        patientId: fixedPatient?.id ?? "",
        name: "",
        kind: catalogKind === "single" ? "single" : "fixed_package",
        services: [],
        validFrom: currentDate,
        validUntil: localIsoDate(nextYear),
        totalValueInCents: 0,
        installments: 3,
        firstDueDate: currentDate,
        autoRenew: false,
      };
    }
    const period = nextPlanPeriod(renewing) ?? {
      validFrom: currentDate,
      validUntil: "",
      firstDueDate: currentDate,
    };
    return {
      planTemplateId: renewing.planTemplateId ?? "",
      patientId: renewing.patientId,
      name: renewing.name,
      kind: renewing.kind,
      services: renewing.services.map(
        ({ serviceId, totalSessions, totalValueInCents }) => ({
          serviceId,
          totalSessions,
          totalValueInCents,
        }),
      ),
      totalValueInCents: renewing.totalValueInCents,
      installments: renewing.kind === "recurring" ? 1 : renewing.installments,
      ...(renewing.paymentMethod
        ? { paymentMethod: renewing.paymentMethod }
        : {}),
      autoRenew: renewing.autoRenew && Boolean(period.validUntil),
      ...period,
    };
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [groupId, setGroupId] = useState("");
  const [baseline] = useState(() => JSON.stringify(form));
  // O que falta para contratar ou renovar: o botão fica desativado listando (QM14).
  const missing = useMissingFields(
    [
      !renewing && !form.patientId && "Cliente",
      !renewing && !form.planTemplateId && "Plano cadastrado",
      Boolean(renewing) && !form.name.trim() && "Nome do plano",
      !form.validFrom && "Início",
      !form.firstDueDate && "Primeiro vencimento",
    ].filter((item): item is string => Boolean(item)),
  );
  const formElement = useRef<HTMLFormElement>(null);
  const [templates, setTemplates] = useState<PlanTemplate[] | null>(null);
  const paymentSettings = usePaymentMethodSettings();
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  useEffect(() => {
    if (renewing) return;
    let active = true;
    api
      .planTemplates()
      .then((items) => {
        if (active)
          setTemplates(
            items.filter(
              (item) =>
                item.active &&
                item.services.length > 0 &&
                (!catalogKind || planTemplateCatalogKind(item) === catalogKind),
            ),
          );
      })
      .catch((cause: Error) => {
        if (active) setCatalogError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [renewing, catalogAttempt, catalogKind]);
  async function save() {
    if (submitting.current)
      throw new Error("Aguarde o salvamento em andamento.");
    if (formElement.current && !formElement.current.checkValidity())
      throw new Error(
        "Preencha os campos obrigatórios antes de salvar o plano.",
      );
    if (
      !renewing &&
      !templates?.some((item) => item.id === form.planTemplateId)
    ) {
      setError("Selecione um plano cadastrado.");
      throw new Error("Selecione um plano cadastrado.");
    }
    submitting.current = true;
    setLoading(true);
    onBusyChange(true);
    setError("");
    try {
      await onSubmit(
        form,
        form.kind !== "single" ? groupId || undefined : undefined,
      );
    } catch (cause) {
      setError((cause as Error).message);
      throw cause;
    } finally {
      submitting.current = false;
      setLoading(false);
      onBusyChange(false);
    }
  }
  // Plano é fixo: sessões e valor vêm do plano cadastrado (ou do plano renovado).
  // Só o avulso muda as sessões, e o valor acompanha o preço por sessão.
  const references = renewing
    ? renewing.services
    : (templates?.find((item) => item.id === form.planTemplateId)?.services ??
      []);
  const sessionsEditable = form.kind === "single";
  const servicesTotal = (entries: PatientPlanInput["services"]) =>
    entries.reduce((sum, item) => sum + item.totalValueInCents, 0);
  const formDirty =
    additionalDirty || Boolean(groupId) || JSON.stringify(form) !== baseline;
  // Sem guarda própria (PlanForm dentro de outro modal): o Modal pergunta antes de descartar.
  useModalDirty(!registerCloseGuard && formDirty);
  const confirmDiscard = useConfirmDiscard();
  const prompt = useUnsavedChangesPrompt({
    section: renewing ? "Renovação do plano" : "Contratação do plano",
    dirty: Boolean(registerCloseGuard) && formDirty,
    busy: loading,
    save,
    discard: () => {},
  });
  useEffect(
    () => registerCloseGuard?.(prompt.confirmLeave),
    [registerCloseGuard, prompt.confirmLeave],
  );
  const cancel = () =>
    registerCloseGuard
      ? prompt.confirmLeave(onCancel)
      : confirmDiscard(onCancel);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch {
      /* O formulário informa a falha de salvamento. */
    }
  }
  return (
    <>
      {prompt.modal}
      {(renewing ? can("plans.renew") : can("plans.create")) && (
        <form ref={formElement} className="form-grid" onSubmit={submit}>
          <fieldset className="form-fields form-grid span-2" disabled={loading}>
            {!renewing && (
              <>
                {fixedPatient ? (
                  <FixedPatient patient={fixedPatient} />
                ) : (
                  <PatientPicker
                    required
                    className="span-2"
                    patients={patients}
                    value={form.patientId}
                    disabled={loading}
                    onChange={(patientId) => setForm({ ...form, patientId })}
                  />
                )}
                {!catalogKind && (
                  <label>
                    Modelo
                    <select
                      autoFocus={Boolean(fixedPatient)}
                      value={form.kind}
                      onChange={(e) => {
                        const kind = e.target.value as PatientPlan["kind"];
                        const entries =
                          kind === "single"
                            ? form.services
                            : form.services.map((item) => {
                                const reference = references.find(
                                  (entry) => entry.serviceId === item.serviceId,
                                );
                                return reference
                                  ? {
                                      ...item,
                                      totalSessions: reference.totalSessions,
                                      totalValueInCents:
                                        reference.totalValueInCents,
                                    }
                                  : item;
                              });
                        setForm({
                          ...form,
                          kind,
                          services: entries,
                          totalValueInCents: servicesTotal(entries),
                          // Recorrente: uma cobrança por ciclo.
                          installments:
                            kind === "recurring" ? 1 : form.installments,
                          autoRenew: kind === "recurring",
                        });
                        if (kind === "single") setGroupId("");
                      }}
                    >
                      {Object.entries(planKindLabels).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {renewing ? (
              <label className="span-2">
                Nome do plano
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
            ) : (
              <div className="span-2">
                <label>
                  Plano cadastrado
                  <select
                    required
                    autoFocus={Boolean(catalogKind)}
                    value={form.planTemplateId}
                    disabled={!templates?.length || loading}
                    onChange={(event) => {
                      const template = templates?.find(
                        (item) => item.id === event.target.value,
                      );
                      if (
                        !template ||
                        (template.planType
                          ? planTypeKind(template.planType)
                          : template.kind) === "single" ||
                        !template.services.some((entry) =>
                          groups?.items?.some(
                            (group) =>
                              group.id === groupId &&
                              group.serviceId === entry.serviceId,
                          ),
                        )
                      ) {
                        setGroupId("");
                      }
                      const templateKind = template?.planType
                        ? planTypeKind(template.planType)
                        : (template?.kind ?? "fixed_package");
                      setForm({
                        ...form,
                        planTemplateId: template?.id ?? "",
                        name: template?.name ?? "",
                        totalValueInCents: template?.totalValueInCents ?? 0,
                        services:
                          template?.services.map((entry) => ({ ...entry })) ??
                          [],
                        kind: templateKind,
                        installments:
                          templateKind === "recurring" ? 1 : form.installments,
                        ...(template?.planType
                          ? {
                              validUntil: planPeriodEnd(
                                template.planType,
                                form.validFrom,
                              ),
                              autoRenew:
                                Boolean(planPeriodMonths(template.planType)) &&
                                form.autoRenew,
                            }
                          : {}),
                      });
                    }}
                  >
                    <option value="">Selecione um plano</option>
                    {templates?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ·{" "}
                        {currency.format(item.totalValueInCents / 100)}
                      </option>
                    ))}
                  </select>
                </label>
                {catalogError ? (
                  <div className="form-error" role="alert">
                    {catalogError}{" "}
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      onClick={() => {
                        setCatalogError("");
                        setTemplates(null);
                        setCatalogAttempt((attempt) => attempt + 1);
                      }}
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : templates === null ? (
                  <LoadingBlock />
                ) : templates.length === 0 ? (
                  <p className="muted-copy">
                    {catalogKind
                      ? `Nenhum plano ${catalogKind === "single" ? "avulso" : "recorrente"} ativo cadastrado.`
                      : "Nenhum plano ativo cadastrado."}{" "}
                    Cadastre um plano em Configurações › Planos.
                    {canView("settings") && (
                      <>
                        {" "}
                        <NavLink to="/configuracoes">
                          Abrir configurações
                        </NavLink>
                      </>
                    )}
                  </p>
                ) : null}
              </div>
            )}
            {!renewing &&
              templates?.find((item) => item.id === form.planTemplateId)
                ?.planType && (
                <p className="span-2 muted-copy">
                  {
                    planTypeLabels[
                      templates.find((item) => item.id === form.planTemplateId)!
                        .planType!
                    ]
                  }{" "}
                  · Valor total do período.
                </p>
              )}
            {form.services.map((entry, index) => (
              <fieldset className="span-2 form-grid" key={entry.serviceId}>
                <legend>
                  {renewing?.services.find(
                    (item) => item.serviceId === entry.serviceId,
                  )?.serviceName ??
                    services.find((item) => item.id === entry.serviceId)
                      ?.name ??
                    "Serviço"}
                </legend>
                {renewing && (
                  <p className="span-2">
                    Saldo atual:{" "}
                    {
                      renewing.services.find(
                        (item) => item.serviceId === entry.serviceId,
                      )?.remainingSessions
                    }{" "}
                    sessões. A renovação criará o novo saldo informado abaixo.
                  </p>
                )}
                <label>
                  Sessões do serviço {index + 1}
                  <input
                    required
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    readOnly={!sessionsEditable}
                    value={entry.totalSessions}
                    onChange={(event) => {
                      const totalSessions = Number(event.target.value);
                      const reference = references.find(
                        (item) => item.serviceId === entry.serviceId,
                      );
                      const entries = form.services.map((item, position) =>
                        position === index
                          ? {
                              ...item,
                              totalSessions,
                              totalValueInCents: reference
                                ? planServiceValueForSessions(
                                    reference,
                                    totalSessions,
                                  )
                                : item.totalValueInCents,
                            }
                          : item,
                      );
                      setForm({
                        ...form,
                        services: entries,
                        totalValueInCents: servicesTotal(entries),
                      });
                    }}
                  />
                </label>
                <label>
                  Valor do serviço {index + 1}
                  <input
                    readOnly
                    value={currency.format(entry.totalValueInCents / 100)}
                  />
                </label>
                <p className="span-2 muted-copy">
                  {sessionsEditable
                    ? "Avulso: o valor é calculado pelo preço por sessão do plano."
                    : "Sessões e valor seguem o plano cadastrado."}
                </p>
              </fieldset>
            ))}
            <label className="span-2">
              Valor total
              <input
                readOnly
                value={currency.format(form.totalValueInCents / 100)}
              />
            </label>
            <label>
              Início
              <input
                required
                type="date"
                value={form.validFrom}
                onChange={(e) => {
                  const selected = templates?.find(
                    (item) => item.id === form.planTemplateId,
                  );
                  setForm({
                    ...form,
                    validFrom: e.target.value,
                    ...(!renewing &&
                    selected?.planType &&
                    planPeriodMonths(selected.planType)
                      ? {
                          validUntil: planPeriodEnd(
                            selected.planType,
                            e.target.value,
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
                onChange={(e) =>
                  setForm({
                    ...form,
                    validUntil: e.target.value,
                    autoRenew: Boolean(e.target.value) && form.autoRenew,
                  })
                }
              />
            </label>
            <label>
              Forma de pagamento
              <select
                value={form.paymentMethod ?? ""}
                onChange={(event) => {
                  const paymentMethod = event.target.value as
                    PaymentMethod | "";
                  const next = { ...form };
                  if (paymentMethod) next.paymentMethod = paymentMethod;
                  else delete next.paymentMethod;
                  setForm(next);
                }}
              >
                <option value="">A combinar</option>
                {paymentMethodSchema.options.map((method) => (
                  <option value={method} key={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </label>
            <PlanInstallmentsField
              kind={form.kind}
              installments={form.installments}
              firstDueDate={form.firstDueDate}
              validUntil={form.validUntil}
              paymentMethod={form.paymentMethod}
              settings={paymentSettings}
              template={templates?.find(
                (item) =>
                  item.id === (renewing?.planTemplateId ?? form.planTemplateId),
              )}
              onChange={(installments) => setForm({ ...form, installments })}
            />
            <label>
              Primeiro vencimento
              <input
                required
                type="date"
                value={form.firstDueDate}
                onChange={(e) =>
                  setForm({ ...form, firstDueDate: e.target.value })
                }
              />
            </label>
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={Boolean(form.autoRenew)}
                disabled={!form.validUntil}
                onChange={(e) =>
                  setForm({ ...form, autoRenew: e.target.checked })
                }
              />
              {form.validUntil
                ? "Renovar automaticamente ao fim da validade, com as mesmas condições"
                : "Renovação automática exige o fim da validade"}
            </label>
            {groups && form.kind !== "single" && form.services.length > 0 && (
              <PlanGroupPicker
                groups={groups}
                services={form.services}
                value={groupId}
                onChange={setGroupId}
                disabled={loading}
              />
            )}
            {renderAdditional?.(form)}
          </fieldset>
          {error && (
            <div className="form-error span-2" role="alert">
              {error}
            </div>
          )}
          {missing.hint}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={cancel}
              disabled={loading}
            >
              {fixedPatient ? "Voltar" : "Cancelar"}
            </button>
            <button
              className="primary-button"
              disabled={loading || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {renewing
                ? loading
                  ? "Renovando…"
                  : "Renovar plano e gerar parcelas"
                : loading
                  ? "Criando…"
                  : "Criar plano e parcelas"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
