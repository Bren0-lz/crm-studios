import type {
  AppointmentInput,
  AppointmentPromotion,
  AppointmentVisitType,
  AutoCampaignPromotionOffer,
  PackageWeeklySlot,
  Patient,
  PatientOption,
  PatientPlan,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import {
  appointmentPlanServiceIds,
  packageScheduleStarts,
  planHasSessionBalance,
  recurringOccurrenceStarts,
  serviceAvailableFor,
} from "@crm/contracts";
import { X } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { api, ApiClientError } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { FixedPatient } from "../../shared/components/FixedPatient";
import {
  appointmentVisitTypes,
  currency,
  localIsoDate,
  toLocalDateTimeInput,
  visitTypeLabels,
} from "../../shared/lib/formatting";
import { AppointmentPatientWarnings } from "./AppointmentPatientWarnings";
import { AppointmentOrderSummary } from "./AppointmentOrderSummary";
import { AppointmentPlanField } from "./AppointmentPlanField";
import { AppointmentPatientCreateModal } from "./AppointmentPatientCreateModal";
import { AppointmentPromotionField } from "./AppointmentPromotionField";
import { initialPackageSlot } from "./model";
import { PackageWeeklySlotsFields } from "./PackageWeeklySlotsFields";
import {
  useConfirmDiscard,
  useModalDirty,
} from "../../shared/workflows/ModalGuardContext";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { PlanSaleContext } from "../../shared/workflows/PlanSaleContext";

/** Opções especiais do campo "Serviço" (não viram `serviceId`). */
const SELL_SINGLE_PLAN = "__sell-single-plan";
const BACK_TO_PLAN_SERVICES = "__plan-services";

export function AppointmentForm({
  patients,
  professionals,
  rooms,
  services,
  fixedPatient,
  onCancel,
  onBusyChange,
  onSubmit,
  onPatientCreated,
  onNestedModalChange,
  initialSlot,
  packageSessions,
  offerPromotions = false,
  additional,
  additionalDirty = false,
}: {
  patients: PatientOption[];
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
  fixedPatient?: PatientOption | undefined;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onSubmit: (
    input: AppointmentInput & {
      promotion?: AppointmentPromotion | undefined;
    },
    recurrence?: {
      occurrences: number;
      intervalWeeks: number;
      customStartsAt?: string[];
    },
  ) => Promise<void>;
  onPatientCreated?: (patient: Patient) => void;
  onNestedModalChange?: (open: boolean) => void;
  initialSlot?: { professionalId: string; startsAt: string } | undefined;
  /**
   * Sessões por serviço do pacote que está sendo contratado: abre em "Dias fixos na
   * semana" e usa esse total como número de sessões.
   */
  packageSessions?: Record<string, number> | undefined;
  /** Pergunta se o atendimento usa a promoção de uma campanha automática. */
  offerPromotions?: boolean | undefined;
  /** Campos extras do modal (ex.: documento para assinatura), antes dos avisos do cliente. */
  additional?: ReactNode;
  additionalDirty?: boolean;
}) {
  const { can, canEdit, canView } = useAuthorization();
  const renderPlanSale = useContext(PlanSaleContext);
  const [form, setForm] = useState({
    patientId: fixedPatient?.id ?? "",
    visitType: "" as AppointmentVisitType | "",
    professionalId: initialSlot?.professionalId ?? "",
    roomId: "",
    serviceId: "",
    startsAt: initialSlot?.startsAt ?? "",
    notes: "",
    recurring:
      can("agenda.recurring") &&
      (!can("agenda.create") || Boolean(packageSessions)),
    occurrences: 4,
    intervalWeeks: 1,
    // "Escolher datas": as demais ocorrências (além de startsAt) definidas à mão.
    manualDates: false,
    extraStarts: [] as string[],
    // "Dias fixos na semana": pacote marcado nos dias/horários abaixo até acabar as sessões.
    packageDays: Boolean(packageSessions) && can("agenda.recurring"),
    // Vazio: um único dia fixo, o do atendimento escolhido acima.
    slots: [] as PackageWeeklySlot[],
    occurrencesEdited: false,
    promotion: undefined as AppointmentPromotion | undefined,
    // Plano de onde sai a sessão (AP4); vazio na experimental e na contratação do plano.
    planId: "",
  });
  // Experimental não usa plano; na contratação o plano é o que está sendo vendido.
  const needsPlan =
    !packageSessions && form.visitType !== "" && form.visitType !== "trial";
  // Planos do cliente: limitam o "Serviço" (AP6) e sugerem o número de sessões do pacote.
  const [plansVersion, setPlansVersion] = useState(0);
  const patientPlans = usePatientPlans(
    needsPlan || (form.packageDays && !packageSessions && canView("plans"))
      ? form.patientId
      : "",
    plansVersion,
  );
  const fetchedRemaining =
    form.packageDays && !packageSessions && canView("plans")
      ? packageRemainingOf(patientPlans?.items, form.serviceId)
      : null;
  const packageRemaining = packageSessions
    ? (packageSessions[form.serviceId] ?? null)
    : fetchedRemaining;
  const packageSlots = form.slots.length
    ? form.slots
    : [initialPackageSlot(form.startsAt)];
  // Sem alteração manual, o número de sessões acompanha o saldo do pacote do cliente.
  const sessionCount =
    form.packageDays &&
    !form.occurrencesEdited &&
    packageRemaining !== null &&
    packageRemaining >= 2
      ? Math.min(packageRemaining, 52)
      : form.occurrences;
  const packageStarts = form.packageDays
    ? packageScheduleStarts({
        fromDate: form.startsAt.split("T")[0] || localIsoDate(),
        slots: packageSlots,
        count: sessionCount,
      })
    : [];
  const startTime = form.startsAt.split("T")[1] ?? "";
  const [promotionOffer, setPromotionOffer] = useState<
    AutoCampaignPromotionOffer | undefined
  >();
  const selectedOffer =
    form.promotion &&
    promotionOffer?.campaignId === form.promotion.campaignId &&
    promotionOffer.occurrenceKey === form.promotion.occurrenceKey
      ? promotionOffer
      : undefined;
  const summaryStarts = occurrenceStarts(
    form.recurring
      ? form.manualDates
        ? { kind: "manual", starts: [form.startsAt, ...form.extraStarts] }
        : form.packageDays
          ? { kind: "manual", starts: packageStarts }
          : {
              kind: "weekly",
              startsAt: form.startsAt,
              occurrences: form.occurrences,
              intervalWeeks: form.intervalWeeks,
            }
      : { kind: "manual", starts: [form.startsAt] },
  );
  const firstStart = summaryStarts[0] ?? "";
  const planStartsAt = completeDateTime.test(firstStart)
    ? new Date(firstStart).toISOString()
    : undefined;
  const choosePlan = useCallback(
    (planId: string) => setForm((current) => ({ ...current, planId })),
    [],
  );
  // Só os serviços atendidos pelo profissional e pela sala escolhidos (U10).
  const availableServices = services.filter((item) =>
    serviceAvailableFor(item, form.professionalId, form.roomId),
  );
  // Atendimento que sai de plano (AP6): "Serviço" mostra só os serviços dos planos do
  // cliente; "Vender plano avulso…" troca para os serviços com plano avulso, com o preço.
  const canSellSinglePlan =
    Boolean(renderPlanSale) && canEdit("plans") && can("plans.create");
  const [sellSinglePlan, setSellSinglePlan] = useState(false);
  const planServicesLoading =
    needsPlan && Boolean(form.patientId) && patientPlans === null;
  const coveredServiceIds =
    needsPlan && patientPlans?.items
      ? appointmentPlanServiceIds(
          patientPlans.items,
          form.startsAt.split("T")[0] || localIsoDate(),
        )
      : undefined;
  const sellingSinglePlan =
    Boolean(coveredServiceIds) && canSellSinglePlan && sellSinglePlan;
  // Na venda do avulso lista todos: sem plano avulso cadastrado, o campo "Plano" orienta.
  const serviceOptions = availableServices.filter(
    (item) =>
      !coveredServiceIds ||
      sellingSinglePlan ||
      item.id === form.serviceId ||
      coveredServiceIds.has(item.id),
  );
  const showServicePrice = !coveredServiceIds || sellingSinglePlan;
  const serviceHint = planServicesLoading
    ? ""
    : needsPlan && form.patientId && patientPlans?.error
      ? "Não foi possível carregar os planos do cliente; mostrando todos os serviços."
      : sellingSinglePlan
        ? "Escolha o serviço do plano avulso a vender."
        : coveredServiceIds && coveredServiceIds.size === 0
          ? canSellSinglePlan
            ? "Cliente sem plano ativo. Use “Vender plano avulso…” para agendar."
            : "Cliente sem plano ativo. Peça a quem vende planos para contratar o plano."
          : "";
  const serviceHintId = useId();
  // E vice-versa: com um serviço escolhido, só as salas que o atendem.
  const selectedService = services.find((item) => item.id === form.serviceId);
  const availableRooms = selectedService
    ? rooms.filter((item) => serviceAvailableFor(selectedService, "", item.id))
    : rooms;
  function keepAvailableRoom(next: typeof form) {
    const service = services.find((item) => item.id === next.serviceId);
    return service && !serviceAvailableFor(service, "", next.roomId)
      ? { ...next, roomId: "" }
      : next;
  }
  function keepAvailableService(next: typeof form) {
    const service = services.find((item) => item.id === next.serviceId);
    return service &&
      !serviceAvailableFor(service, next.professionalId, next.roomId)
      ? { ...next, serviceId: "" }
      : next;
  }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Sem cliente, "Confirmar atendimento" fica desativado e diz o que falta (QM14).
  const missing = [
    !form.patientId && "Cliente",
    needsPlan && form.patientId && form.serviceId && !form.planId && "Plano",
  ].filter((item): item is string => Boolean(item));
  const missingId = useId();
  useModalDirty(useFormDirty(form) || additionalDirty);
  const confirmDiscard = useConfirmDiscard();
  const submitting = useRef(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    null,
  );
  const [pickerVersion, setPickerVersion] = useState(0);
  const patientInputRef = useRef<HTMLInputElement>(null);
  const restorePatientFocus = useRef(false);
  useLayoutEffect(() => {
    if (!patientModalOpen && restorePatientFocus.current) {
      restorePatientFocus.current = false;
      patientInputRef.current?.focus();
    }
  }, [patientModalOpen, pickerVersion]);
  const patientChoices =
    selectedPatient &&
    !patients.some((patient) => patient.id === selectedPatient.id)
      ? [...patients, selectedPatient]
      : patients;
  function closePatientModal() {
    restorePatientFocus.current = true;
    setPatientModalOpen(false);
    onNestedModalChange?.(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!form.patientId) {
      setError("Selecione um cliente para confirmar o atendimento.");
      patientInputRef.current?.focus();
      return;
    }
    if (form.recurring && form.packageDays && packageStarts.length < 2) {
      setError("Informe os dias e horários fixos e ao menos 2 sessões.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    onBusyChange(true);
    setError("");
    try {
      const input: AppointmentInput & {
        promotion?: AppointmentPromotion | undefined;
      } = {
        patientId: form.patientId,
        professionalId: form.professionalId,
        roomId: form.roomId,
        serviceId: form.serviceId,
        startsAt: new Date(
          form.recurring && form.packageDays
            ? packageStarts[0]!
            : form.startsAt,
        ).toISOString(),
        notes: form.notes,
        visitType: form.visitType as AppointmentVisitType,
        ...(needsPlan && form.planId ? { planId: form.planId } : {}),
        ...(form.promotion ? { promotion: form.promotion } : {}),
      };
      await onSubmit(
        input,
        !form.recurring
          ? undefined
          : form.manualDates
            ? {
                occurrences: form.extraStarts.length + 1,
                intervalWeeks: 1,
                customStartsAt: form.extraStarts.map((value) =>
                  new Date(value).toISOString(),
                ),
              }
            : form.packageDays
              ? {
                  occurrences: packageStarts.length,
                  intervalWeeks: 1,
                  customStartsAt: packageStarts
                    .slice(1)
                    .map((value) => new Date(value).toISOString()),
                }
              : {
                  occurrences: form.occurrences,
                  intervalWeeks: form.intervalWeeks,
                },
      );
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível agendar.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
      onBusyChange(false);
    }
  }
  return (
    <>
      {(can("agenda.create") || can("agenda.recurring")) && (
        <form className="form-grid" onSubmit={submit}>
          <fieldset className="form-fields form-grid span-2" disabled={loading}>
            {fixedPatient ? (
              <FixedPatient patient={fixedPatient} />
            ) : (
              <div>
                <PatientPicker
                  required
                  key={pickerVersion}
                  patients={patientChoices}
                  value={form.patientId}
                  inputRef={patientInputRef}
                  disabled={loading}
                  onAddPatient={
                    can("patients.create") && onPatientCreated
                      ? () => {
                          setPatientModalOpen(true);
                          onNestedModalChange?.(true);
                        }
                      : undefined
                  }
                  onChange={(patientId, patient) => {
                    if (patient) setSelectedPatient(patient);
                    setSellSinglePlan(false);
                    setForm((current) => ({
                      ...current,
                      patientId,
                      promotion:
                        current.patientId === patientId
                          ? current.promotion
                          : undefined,
                    }));
                  }}
                />
              </div>
            )}
            <label>
              Tipo
              <select
                autoFocus={Boolean(fixedPatient)}
                required
                value={form.visitType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    visitType: e.target.value as AppointmentVisitType,
                  })
                }
              >
                <option value="">Selecione</option>
                {appointmentVisitTypes.map((item) => (
                  <option value={item} key={item}>
                    {visitTypeLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={form.recurring}
                disabled={!can("agenda.create") || !can("agenda.recurring")}
                onChange={(e) =>
                  setForm({ ...form, recurring: e.target.checked })
                }
              />
              Repetir este atendimento
            </label>
            {form.recurring && (
              <>
                {form.manualDates ? (
                  <p className="field-hint recurrence-count">
                    {form.extraStarts.length + 1} ocorrências: a data do
                    atendimento e as escolhidas abaixo.
                  </p>
                ) : (
                  <label>
                    {form.packageDays
                      ? "Número de sessões"
                      : "Número de ocorrências"}
                    <input
                      type="number"
                      min={2}
                      max={52}
                      value={sessionCount}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          occurrences: Number(e.target.value),
                          occurrencesEdited: true,
                        })
                      }
                    />
                    {form.packageDays && packageRemaining !== null && (
                      <span className="field-hint">
                        {packageSessions
                          ? "Sessões do pacote neste serviço"
                          : "Saldo do pacote neste serviço"}
                        : {packageRemaining}{" "}
                        {packageRemaining === 1 ? "sessão" : "sessões"}.
                      </span>
                    )}
                  </label>
                )}
                <label>
                  Intervalo
                  <select
                    value={
                      form.manualDates
                        ? "custom"
                        : form.packageDays
                          ? "package"
                          : form.intervalWeeks
                    }
                    onChange={(e) =>
                      setForm(
                        e.target.value === "custom"
                          ? {
                              ...form,
                              manualDates: true,
                              packageDays: false,
                              extraStarts: form.extraStarts.length
                                ? form.extraStarts
                                : [`T${startTime}`],
                            }
                          : e.target.value === "package"
                            ? {
                                ...form,
                                manualDates: false,
                                packageDays: true,
                              }
                            : {
                                ...form,
                                manualDates: false,
                                packageDays: false,
                                intervalWeeks: Number(e.target.value),
                              },
                      )
                    }
                  >
                    <option value={1}>Toda semana</option>
                    <option value={2}>A cada 2 semanas</option>
                    <option value={3}>A cada 3 semanas</option>
                    <option value={4}>A cada 4 semanas</option>
                    <option value="package">
                      Dias fixos na semana (pacote)
                    </option>
                    <option value="custom">Escolher datas</option>
                  </select>
                </label>
              </>
            )}
            <label>
              Profissional
              <select
                required
                value={form.professionalId}
                onChange={(e) =>
                  setForm(
                    keepAvailableService({
                      ...form,
                      professionalId: e.target.value,
                    }),
                  )
                }
              >
                <option value="">Selecione</option>
                {professionals.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sala
              <select
                required
                value={form.roomId}
                onChange={(e) =>
                  setForm(
                    keepAvailableService({ ...form, roomId: e.target.value }),
                  )
                }
              >
                <option value="">Selecione</option>
                {availableRooms.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label>
                Serviço
                <select
                  required
                  value={planServicesLoading ? "" : form.serviceId}
                  disabled={planServicesLoading}
                  aria-describedby={serviceHint ? serviceHintId : undefined}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (
                      value === SELL_SINGLE_PLAN ||
                      value === BACK_TO_PLAN_SERVICES
                    ) {
                      setSellSinglePlan(value === SELL_SINGLE_PLAN);
                      setForm({ ...form, serviceId: "" });
                      return;
                    }
                    setForm(keepAvailableRoom({ ...form, serviceId: value }));
                  }}
                >
                  <option value="">
                    {planServicesLoading
                      ? "Carregando planos do cliente…"
                      : "Selecione"}
                  </option>
                  {!planServicesLoading &&
                    serviceOptions.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                        {showServicePrice && item.singleSessionPriceInCents
                          ? ` · ${currency.format(item.singleSessionPriceInCents / 100)}`
                          : ""}
                      </option>
                    ))}
                  {coveredServiceIds &&
                    canSellSinglePlan &&
                    (sellingSinglePlan ? (
                      <option value={BACK_TO_PLAN_SERVICES}>
                        Voltar aos serviços dos planos
                      </option>
                    ) : (
                      <option value={SELL_SINGLE_PLAN}>
                        Vender plano avulso…
                      </option>
                    ))}
                </select>
              </label>
              {serviceHint && (
                <span className="field-hint" id={serviceHintId}>
                  {serviceHint}
                </span>
              )}
            </div>
            <div>
              <AppointmentDateTimePicker
                value={form.startsAt}
                onChange={(startsAt) =>
                  setForm((current) => ({ ...current, startsAt }))
                }
                professionalId={form.professionalId}
                roomId={form.roomId}
                disabled={loading}
              />
            </div>
            {needsPlan && (
              <AppointmentPlanField
                patient={
                  fixedPatient ??
                  patientChoices.find((item) => item.id === form.patientId)
                }
                serviceId={form.serviceId}
                startsAt={planStartsAt}
                sessions={summaryStarts.length}
                value={form.planId}
                onChange={choosePlan}
                onPlanSold={() => {
                  // O plano novo entra na lista: o serviço passa a constar dos planos.
                  setSellSinglePlan(false);
                  setPlansVersion((current) => current + 1);
                }}
                disabled={loading}
                onNestedModalChange={onNestedModalChange}
              />
            )}
            {form.recurring && form.packageDays && (
              <PackageWeeklySlotsFields
                slots={packageSlots}
                starts={packageStarts}
                onChange={(slots) =>
                  setForm((current) => ({ ...current, slots }))
                }
              />
            )}
            {form.recurring && form.manualDates && (
              <div className="recurrence-dates span-2">
                <div className="recurrence-dates-head">
                  <div>
                    <h4>Outras datas</h4>
                    <p>
                      A primeira ocorrência é a data e o horário acima. Escolha
                      os demais dias do atendimento.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button button-sm"
                    disabled={form.extraStarts.length >= 51}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        extraStarts: [...current.extraStarts, `T${startTime}`],
                      }))
                    }
                  >
                    Adicionar data
                  </button>
                </div>
                {form.extraStarts.map((value, index) => (
                  <div className="recurrence-date-row" key={index}>
                    <AppointmentDateTimePicker
                      label={`Ocorrência ${index + 2}`}
                      value={value}
                      onChange={(next) =>
                        setForm((current) => ({
                          ...current,
                          extraStarts: current.extraStarts.map(
                            (item, position) =>
                              position === index ? next : item,
                          ),
                        }))
                      }
                      professionalId={form.professionalId}
                      roomId={form.roomId}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover ocorrência ${index + 2}`}
                      disabled={form.extraStarts.length <= 1}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          extraStarts: current.extraStarts.filter(
                            (_, position) => position !== index,
                          ),
                        }))
                      }
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {offerPromotions && can("agenda.create") && (
              <AppointmentPromotionField
                patientId={form.patientId}
                value={form.promotion}
                onChange={(promotion, offer) => {
                  setPromotionOffer(offer);
                  setForm((current) => ({ ...current, promotion }));
                }}
              />
            )}
            <label className="span-2">
              Observação
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </label>
            {additional}
            {offerPromotions && (
              <AppointmentOrderSummary
                patientId={form.patientId}
                serviceId={form.serviceId}
                serviceName={
                  services.find((item) => item.id === form.serviceId)?.name ??
                  ""
                }
                starts={summaryStarts}
                promotion={selectedOffer}
                planId={needsPlan ? form.planId : undefined}
              />
            )}
            {/* No fim do formulário: o aviso chega depois da busca dos planos e não desloca os campos. */}
            <AppointmentPatientWarnings
              patient={
                fixedPatient ??
                patientChoices.find((item) => item.id === form.patientId)
              }
              onNestedModalChange={onNestedModalChange}
            />
          </fieldset>
          {error && (
            <div className="form-error span-2" role="alert">
              {error}
            </div>
          )}
          {missing.length > 0 && (
            <p className="field-hint span-2" id={missingId}>
              Falta: {missing.join(", ")}.
            </p>
          )}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={() => confirmDiscard(onCancel)}
              disabled={loading}
            >
              {fixedPatient ? "Voltar" : "Cancelar"}
            </button>
            <button
              className="primary-button"
              disabled={loading || missing.length > 0}
              aria-describedby={missing.length > 0 ? missingId : undefined}
            >
              {loading ? "Agendando…" : "Confirmar atendimento"}
            </button>
          </div>
        </form>
      )}
      {patientModalOpen &&
        createPortal(
          <AppointmentPatientCreateModal
            onClose={closePatientModal}
            onSaved={(patient) => {
              onPatientCreated?.(patient);
              setSelectedPatient(patient);
              setPickerVersion((version) => version + 1);
              setForm((current) => ({
                ...current,
                patientId: patient.id,
                promotion: undefined,
              }));
              closePatientModal();
            }}
          />,
          document.body,
        )}
    </>
  );
}

const completeDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Datas das ocorrências para o resumo, na ordem em que a API cria os atendimentos (a 1ª
 * leva a promoção). Data ainda incompleta vira "" (a definir) e vai para o fim.
 */
function occurrenceStarts(
  input:
    | { kind: "manual"; starts: string[] }
    | {
        kind: "weekly";
        startsAt: string;
        occurrences: number;
        intervalWeeks: number;
      },
): string[] {
  if (input.kind === "manual") {
    const complete = input.starts
      .filter((value) => completeDateTime.test(value))
      .sort();
    return [
      ...complete,
      ...input.starts
        .filter((value) => !completeDateTime.test(value))
        .map(() => ""),
    ];
  }
  const count = Math.max(1, Math.min(52, input.occurrences || 1));
  if (!completeDateTime.test(input.startsAt))
    return Array.from({ length: count }, () => "");
  return recurringOccurrenceStarts({
    startsAt: input.startsAt,
    occurrences: count,
    intervalWeeks: input.intervalWeeks,
  }).map((iso) => toLocalDateTimeInput(new Date(iso)));
}

/**
 * Planos do cliente (`GET /plans`). `undefined` sem cliente; `null` carregando. Ao recarregar
 * (`version`, ex.: depois de vender um plano) mantém a lista anterior do mesmo cliente.
 */
function usePatientPlans(patientId: string, version: number) {
  const [state, setState] = useState<{
    patientId: string;
    items?: PatientPlan[];
    error?: true;
  } | null>(null);
  useEffect(() => {
    if (!patientId) return;
    let active = true;
    api
      .plans(patientId)
      .then((items) => {
        if (active)
          setState({ patientId, items: Array.isArray(items) ? items : [] });
      })
      .catch(() => {
        if (active) setState({ patientId, error: true });
      });
    return () => {
      active = false;
    };
  }, [patientId, version]);
  if (!patientId) return undefined;
  return state?.patientId === patientId ? state : null;
}

/**
 * Saldo de sessões do serviço nos planos vigentes do cliente (pacote contratado), para
 * sugerir quantas sessões marcar. `null` enquanto não houver cliente/serviço ou plano.
 */
function packageRemainingOf(
  plans: PatientPlan[] | undefined,
  serviceId: string,
) {
  if (!plans || !serviceId) return null;
  const today = localIsoDate();
  const services = plans
    .filter(
      (plan) =>
        plan.status === "active" &&
        // Recorrente não tem saldo que acaba: não sugere quantas sessões marcar.
        planHasSessionBalance(plan) &&
        plan.validFrom <= today &&
        (!plan.validUntil || plan.validUntil >= today),
    )
    .flatMap((plan) => plan.services ?? [])
    .filter((service) => service.serviceId === serviceId);
  return services.length
    ? services.reduce((total, service) => total + service.remainingSessions, 0)
    : null;
}
