import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import type { CloseGuard } from "../../shared/workflows/types";
import {
  nextPlanPeriod,
  planPeriodEnd,
  planPeriodMonths,
  planInstallmentPreview,
  planServiceValueForSessions,
  planTypeKind,
  planTypeLabels,
  type PatientOption,
  type PatientPlan,
  type PatientPlanInput,
  type PlanTemplate,
  type Service,
  renewalPlanPayment,
  withPlanFirstCharge,
} from "@crm/contracts";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { NavLink } from "react-router-dom";
import { withFirstChargeChoice } from "./first-charge";
import { PlanFirstChargeFields } from "./PlanFirstChargeFields";
import { PlanPaymentFields } from "./PlanPaymentFields";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { FixedPatient } from "../../shared/components/FixedPatient";
import { InstallmentsPreview } from "../../shared/components/InstallmentsPreview";
import { useMissingFields } from "../../shared/components/MissingFields";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PlanGroupPicker } from "../../shared/components/PlanGroupPicker";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import { planGroupMissing } from "../../shared/lib/plan-groups";
import { planRecurrenceMissing } from "../../shared/lib/payment-parts";
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
  initialTemplateId,
  submitBlocked = "",
}: {
  patients: PatientOption[];
  services: Service[];
  renewing?: PatientPlan | undefined;
  fixedPatient?: PatientOption | undefined;
  groups?: GroupChoices | undefined;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onSubmit: (input: PatientPlanInput, groupId?: string) => Promise<void>;
  /** `groupId`: turma escolhida no formulário (vazia sem turma). */
  renderAdditional?:
    ((input: PatientPlanInput, groupId: string) => ReactNode) | undefined;
  additionalDirty?: boolean;
  registerCloseGuard?: ((guard: CloseGuard) => () => void) | undefined;
  /** Restringe os planos cadastrados a avulsos ou recorrentes (atalho da ficha do cliente). */
  catalogKind?: PlanCatalogKind | undefined;
  /** Plano cadastrado já escolhido ao abrir (ex.: avulso do serviço, vendido no agendamento). */
  initialTemplateId?: string | undefined;
  /** Motivo que impede salvar (ex.: sessões da contratação em conflito); vazio = liberado. */
  submitBlocked?: string | undefined;
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
        // Nunca sem forma de pagamento: começa no Pix.
        paymentMethod: "pix",
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
      // A renovação segue as formas recorrentes (Pix quando o plano antigo não tinha).
      paymentMethod: "pix" as const,
      ...renewalPlanPayment(renewing),
      autoRenew: renewing.autoRenew && Boolean(period.validUntil),
      ...period,
    };
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [groupId, setGroupId] = useState("");
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  // Plano de aulas em grupo (serviço com turma ativa) só é contratado com a turma escolhida.
  const groupMissing =
    Boolean(groups) &&
    !renewing &&
    form.kind !== "single" &&
    planGroupMissing(groups?.items, form.services, groupId);
  // O que falta para contratar ou renovar: o botão fica desativado listando (QM14).
  const missing = useMissingFields(
    [
      !renewing && !form.patientId && "Cliente",
      !renewing && !form.planTemplateId && "Plano cadastrado",
      Boolean(renewing) && !form.name.trim() && "Nome do plano",
      !form.validFrom && "Início",
      !form.firstDueDate && "Primeiro vencimento",
      groupMissing && "Turma",
      ...planRecurrenceMissing(form),
    ].filter((item): item is string => Boolean(item)),
  );
  const formElement = useRef<HTMLFormElement>(null);
  const [templates, setTemplates] = useState<PlanTemplate[] | null>(null);
  const paymentSettings = usePaymentMethodSettings();
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const preselected = useRef(false);
  useEffect(() => {
    if (renewing) return;
    let active = true;
    api
      .planTemplates()
      .then((items) => {
        if (!active) return;
        const list = items.filter(
          (item) =>
            item.active &&
            item.services.length > 0 &&
            (!catalogKind || planTemplateCatalogKind(item) === catalogKind),
        );
        setTemplates(list);
        if (
          !preselected.current &&
          initialTemplateId &&
          list.some((item) => item.id === initialTemplateId)
        ) {
          preselected.current = true;
          const next = chooseTemplate(form, initialTemplateId, list);
          setForm(next);
          // Pré-escolhido não conta como alteração do usuário.
          setBaseline(JSON.stringify(next));
        }
      })
      .catch((cause: Error) => {
        if (active) setCatalogError(cause.message);
      });
    return () => {
      active = false;
    };
    // O formulário inicial é a base da pré-escolha (feita uma vez, ao carregar o catálogo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewing, catalogAttempt, catalogKind]);
  /** Aplica o plano cadastrado escolhido: sessões, valor, modelo e período. */
  function chooseTemplate(
    current: PatientPlanInput,
    templateId: string,
    list = templates,
  ): PatientPlanInput {
    const template = list?.find((item) => item.id === templateId);
    if (
      !template ||
      (template.planType ? planTypeKind(template.planType) : template.kind) ===
        "single" ||
      !template.services.some((entry) =>
        groups?.items?.some(
          (group) =>
            group.id === groupId && group.serviceId === entry.serviceId,
        ),
      )
    ) {
      setGroupId("");
    }
    const templateKind = template?.planType
      ? planTypeKind(template.planType)
      : (template?.kind ?? "fixed_package");
    return {
      ...current,
      planTemplateId: template?.id ?? "",
      name: template?.name ?? "",
      totalValueInCents: template?.totalValueInCents ?? 0,
      // Valor novo: as formas picadas voltam a uma.
      paymentParts: undefined,
      services: template?.services.map((entry) => ({ ...entry })) ?? [],
      kind: templateKind,
      installments: templateKind === "recurring" ? 1 : current.installments,
      ...(template?.planType
        ? {
            validUntil: planPeriodEnd(template.planType, current.validFrom),
            autoRenew:
              Boolean(planPeriodMonths(template.planType)) && current.autoRenew,
          }
        : {}),
    };
  }
  async function save() {
    if (submitting.current)
      throw new Error("Aguarde o salvamento em andamento.");
    // Sessões em conflito ou fora da vigência: nem o "Salvar" do aviso de alterações fecha a
    // contratação.
    if (submitBlocked && !renewing) throw new Error(submitBlocked);
    if (formElement.current && !formElement.current.checkValidity())
      throw new Error(
        "Preencha os campos obrigatórios antes de salvar o plano.",
      );
    if (
      !renewing &&
      !shownTemplates?.some((item) => item.id === form.planTemplateId)
    ) {
      setError("Selecione um plano cadastrado.");
      throw new Error("Selecione um plano cadastrado.");
    }
    if (groupMissing) {
      setError("Selecione a turma do plano de aulas em grupo.");
      throw new Error("Selecione a turma do plano de aulas em grupo.");
    }
    submitting.current = true;
    setLoading(true);
    onBusyChange(true);
    setError("");
    try {
      await onSubmit(
        withPlanFirstCharge(form, firstChargeSlots),
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
  // 1º pagamento proporcional às aulas da turma escolhida; a renovação mantém o valor cheio.
  const firstChargeSlots = renewing
    ? undefined
    : groups?.items?.find((group) => group.id === groupId)?.weeklySlots;
  // Plano é fixo: sessões e valor vêm do plano cadastrado (ou do plano renovado).
  // Só o avulso muda as sessões, e o valor acompanha o preço por sessão.
  const references = renewing
    ? renewing.services
    : (templates?.find((item) => item.id === form.planTemplateId)?.services ??
      []);
  // A lista de planos cadastrados acompanha o Modelo escolhido (avulso ou recorrente).
  const shownCatalogKind: PlanCatalogKind =
    catalogKind ?? (form.kind === "single" ? "single" : "recurring");
  const shownTemplates = templates?.filter(
    (item) => planTemplateCatalogKind(item) === shownCatalogKind,
  );
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
    // Modais abertos por cima do plano (exceção de uma sessão, horários da contratação) são
    // portais: o envio do formulário deles sobe pela árvore do React até aqui e não pode
    // criar o plano.
    if (event.target !== event.currentTarget) return;
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
                        const selected = templates?.find(
                          (item) => item.id === form.planTemplateId,
                        );
                        // Plano escolhido de outro modelo sai da seleção.
                        if (
                          selected &&
                          planTemplateCatalogKind(selected) !==
                            (kind === "single" ? "single" : "recurring")
                        ) {
                          setForm({
                            ...form,
                            kind,
                            planTemplateId: "",
                            name: "",
                            services: [],
                            totalValueInCents: 0,
                            installments:
                              kind === "recurring" ? 1 : form.installments,
                            autoRenew: kind === "recurring",
                          });
                          setGroupId("");
                          return;
                        }
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
                    disabled={!shownTemplates?.length || loading}
                    onChange={(event) =>
                      setForm(chooseTemplate(form, event.target.value))
                    }
                  >
                    <option value="">Selecione um plano</option>
                    {shownTemplates?.map((item) => (
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
                ) : !shownTemplates?.length ? (
                  <p className="muted-copy">
                    {catalogKind || templates.length
                      ? `Nenhum plano ${shownCatalogKind === "single" ? "avulso" : "recorrente"} ativo cadastrado.`
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
            <PlanPaymentFields
              plan={form}
              settings={paymentSettings}
              template={templates?.find(
                (item) =>
                  item.id === (renewing?.planTemplateId ?? form.planTemplateId),
              )}
              disabled={loading}
              onChange={(fields) => setForm({ ...form, ...fields })}
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
            {!renewing && (
              <PlanFirstChargeFields
                plan={form}
                slots={firstChargeSlots}
                disabled={loading}
                onChange={(choice) =>
                  setForm((current) => withFirstChargeChoice(current, choice))
                }
              />
            )}
            {form.totalValueInCents > 0 && (
              <InstallmentsPreview
                className="span-2"
                rows={planInstallmentPreview({
                  ...withPlanFirstCharge(form, firstChargeSlots),
                  previousDiscount: renewing?.discount,
                })}
                note={
                  form.kind === "recurring"
                    ? "Plano recorrente: as próximas cobranças são geradas a cada renovação."
                    : undefined
                }
              />
            )}
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
                required
              />
            )}
            {renderAdditional?.(form, groupId)}
          </fieldset>
          {error && (
            <div className="form-error span-2" role="alert">
              {error}
            </div>
          )}
          {submitBlocked && !renewing && (
            <div className="form-error span-2" role="alert">
              {submitBlocked}
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
              disabled={
                loading ||
                missing.blocked ||
                Boolean(submitBlocked && !renewing)
              }
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
