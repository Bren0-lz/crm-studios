import {
  patientFirstName,
  patientTagDisplayColor,
  discountedPlanInstallments,
  planInstallmentSchedule,
  planPixChargeMessage,
  productSizeLabel,
  whatsappLink,
  withPlanFirstCharge,
} from "@crm/contracts";
import {
  isValidCpf,
  patientTagKey,
  type GroupClass,
  type GuidedPatientInput,
  type GuidedPatientNext,
  type Patient,
  type PatientDiscount,
  type PatientInput,
  type PatientTag,
  type Product,
  withoutAutomaticPatientTags,
} from "@crm/contracts";
import {
  CalendarPlus,
  Layers,
  MessageCircle,
  ShoppingBag,
  Ticket,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { CpfInput } from "../../shared/components/CpfInput";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { planGroupMissing } from "../../shared/lib/plan-groups";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { TagChoice } from "../../shared/components/TagChoice";
import {
  currency,
  localIsoDate,
  tagColorLookup,
} from "../../shared/lib/formatting";
import { planKindLabels } from "../plans/index";
import { sellableStock } from "../sales/index";
import { GuidedDemonstrationFields } from "./GuidedDemonstrationFields";
import { GuidedGroupField } from "./GuidedGroupField";
import { GuidedOrderSummary } from "./GuidedOrderSummary";
import { GuidedPlanFields } from "./GuidedPlanFields";
import {
  GuidedProductFields,
  GuidedProductPaymentFields,
  type GuidedProductPayment,
} from "./GuidedProductFields";
import {
  guidedOrder,
  type GuidedProductLine,
  type OrderPlanItem,
} from "./order";
import {
  defaultGuidedDemonstration,
  defaultGuidedPlanEntry,
  defaultSingleForm,
  guidedNotice,
  guidedPlanKinds,
  guidedStepOrder,
  guidedStepPermissions,
  guidedSubmitLabels,
  maxGuidedPlans,
  missingPlanFields,
  withPlanDiscount,
} from "./model";
import {
  PatientDiscountModal,
  type DiscountTarget,
} from "./PatientDiscountModal";
import { PlanDiscountSummary } from "./PlanDiscountSummary";
import { PatientTimelineSection } from "./PatientTimelineSection";
import { PatientProfileFields } from "./PatientProfileFields";
import type {
  GuidedPlanEntry,
  GuidedPlanForm,
  GuidedSingleEntry,
  GuidedSingleForm,
  PatientRegistrationResult,
} from "./types";

export function PatientModal({
  patient,
  configuredTags,
  onClose,
  onSaved,
}: {
  patient: Patient | undefined;
  /** Etiquetas configuradas: as únicas que podem ser escolhidas no cadastro. */
  configuredTags: { tags: PatientTag[] | null; error: string };
  onClose: () => void;
  /** `result` preserva os registros já criados para continuar sem repetir as operações. */
  onSaved: (
    patient: Patient,
    notice?: string,
    result?: PatientRegistrationResult,
  ) => void;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [form, setForm] = useState<PatientInput>(() => ({
    ...patient,
    fullName: patient?.fullName ?? "",
    phone: patient?.phone ?? "",
    whatsapp: patient?.whatsapp ?? "",
    cpf: patient?.cpf ?? "",
    email: patient?.email ?? "",
    birthDate: patient?.birthDate ?? "",
    emergencyContactName: patient?.emergencyContactName ?? "",
    emergencyContactPhone: patient?.emergencyContactPhone ?? "",
    notes: patient?.notes ?? "",
    // "Pagamento atrasado" é automática: não aparece para marcar nem desmarcar.
    tags: withoutAutomaticPatientTags(patient?.tags ?? []),
  }));
  // O histórico usa acesso comercial: a fisioterapia não vê nem chama a rota.
  const showHistory = Boolean(patient) && can("patients.timeline");
  const editable = patient ? can("patients.update") : can("patients.create");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Desconto (de plano, produto ou geral) em edição no modal: o atual e onde gravá-lo.
  const [discountTarget, setDiscountTarget] = useState<{
    target: DiscountTarget;
    discount: PatientDiscount | undefined;
    apply: (discount: PatientDiscount | null) => void;
  } | null>(null);
  const submitting = useRef(false);
  function field<K extends keyof PatientInput>(key: K, value: PatientInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const tagColor = tagColorLookup(configuredTags.tags);
  const configuredKeys = new Set(
    (configuredTags.tags ?? []).map((tag) => patientTagKey(tag.name)),
  );
  // Etiqueta que o cliente já tem e não está mais configurada aparece para poder ser retirada.
  const tagChoices = [
    ...(configuredTags.tags ?? []).map((tag) => ({
      name: tag.name,
      color: patientTagDisplayColor(tag),
    })),
    ...form.tags
      .filter((tag) => !configuredKeys.has(patientTagKey(tag)))
      .map((tag) => ({ name: tag, color: tagColor(tag) })),
  ];
  function toggleTag(tag: string) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }
  // Cadastro guiado (só na criação): cada opção aparece para quem edita o módulo afetado.
  const guidedSteps = patient
    ? []
    : guidedStepOrder.filter((step) => can(guidedStepPermissions[step]));
  const canBookDemonstration = guidedSteps.includes("demonstration");
  const canSellPlans = guidedSteps.includes("plan");
  const canSellSingles = guidedSteps.includes("single");
  // Aula experimental adicionada: é agendada sozinha (sem planos nem avulsos).
  const [demonstrationAdded, setDemonstrationAdded] = useState(false);
  const [demonstration, setDemonstration] = useState(
    defaultGuidedDemonstration,
  );
  // Planos adicionados no cadastro: o cliente pode assinar vários de uma vez.
  const nextPlanId = useRef(1);
  const [plans, setPlans] = useState<GuidedPlanEntry[]>([]);
  function updatePlan(id: number, patch: Partial<GuidedPlanEntry>) {
    setPlans((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function planFormSetter(
    id: number,
  ): Dispatch<SetStateAction<GuidedPlanForm>> {
    return (action) =>
      setPlans((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                form:
                  typeof action === "function" ? action(entry.form) : action,
              }
            : entry,
        ),
      );
  }
  // Serviços avulsos adicionados (sozinhos ou junto com os planos).
  const [singles, setSingles] = useState<GuidedSingleEntry[]>([]);
  // Próximo passo enviado à API, derivado do que foi adicionado: um avulso sozinho é
  // `single`; planos (com ou sem avulsos) são `plan`; nada (ou só produtos) é `none`.
  const step: GuidedPatientNext = demonstrationAdded
    ? "demonstration"
    : plans.length
      ? "plan"
      : singles.length === 1
        ? "single"
        : singles.length
          ? "plan"
          : "none";
  function singleFormSetter(
    id: number,
  ): Dispatch<SetStateAction<GuidedSingleForm>> {
    return (action) =>
      setSingles((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                form:
                  typeof action === "function" ? action(entry.form) : action,
              }
            : entry,
        ),
      );
  }
  function editDiscount<T extends { discount?: PatientDiscount | undefined }>(
    discount: PatientDiscount | undefined,
    setForm: Dispatch<SetStateAction<T>>,
  ) {
    setDiscountTarget({
      target: "plan",
      discount,
      apply: (next) => setForm((current) => withPlanDiscount(current, next)),
    });
  }
  // Produtos levados junto com o plano/serviço avulso (mesma venda da tela Vendas).
  const sellsProducts =
    can("patients.inventory_view") &&
    can("patients.tabs_create") &&
    can("patients.tabs_items") &&
    can("patients.tabs_close");
  const nextProductKey = useRef(1);
  const [productLines, setProductLines] = useState<GuidedProductLine[]>([]);
  const [productPayment, setProductPayment] = useState<GuidedProductPayment>(
    () => ({
      settlement: "paid",
      paymentMethod: "pix",
      paymentInstallments: 1,
      dueDate: localIsoDate(),
    }),
  );
  // Produtos ativos da filial; `null` enquanto não buscados.
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState("");
  const productsRequested = useRef(false);
  const [orderDiscount, setOrderDiscount] = useState<PatientDiscount>();
  function updateProductLine(key: number, patch: Partial<GuidedProductLine>) {
    setProductLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function addProductLine() {
    setProductLines((current) => [
      ...current,
      {
        key: nextProductKey.current++,
        productId: "",
        size: "",
        quantity: 1,
        unitPriceInCents: 0,
      },
    ]);
    if (productsRequested.current) return;
    productsRequested.current = true;
    api
      .inventoryWorkspace()
      .then((workspace) =>
        setProducts(workspace.products.filter((item) => item.active)),
      )
      .catch((cause: Error) => setProductsError(cause.message));
  }
  // Chave Pix da clínica para a cobrança do plano vendido no cadastro; `null` enquanto carrega.
  const sellsPlans = guidedSteps.some(
    (item) => item === "plan" || item === "single",
  );
  const [pixKey, setPixKey] = useState<string | null>(null);
  // Modelo da mensagem configurado pela clínica; vazio = texto padrão.
  const [pixTemplate, setPixTemplate] = useState("");
  useEffect(() => {
    if (!sellsPlans) return;
    let active = true;
    api
      .clinicBranding()
      .then((branding) => {
        if (!active) return;
        setPixKey(branding.pixKey ?? "");
        setPixTemplate(branding.pixMessageTemplate ?? "");
      })
      .catch(() => {
        if (active) setPixKey("");
      });
    return () => {
      active = false;
    };
  }, [sellsPlans]);
  // Cadastro salvo com plano no Pix: a cobrança fica à vista para enviar antes de fechar.
  const [pixCharge, setPixCharge] = useState<{
    patient: Patient;
    notice: string;
    result: PatientRegistrationResult;
    message: string;
  } | null>(null);
  // Turmas carregadas uma vez (sobrevivem à troca de opção); `null` enquanto não buscadas.
  const [groups, setGroups] = useState<GroupClass[] | null>(null);
  /** Horários da turma escolhida: base do 1º pagamento proporcional do plano. */
  const slotsOf = (groupId: string) =>
    groups?.find((group) => group.id === groupId)?.weeklySlots;
  // Plano de aulas em grupo exige a turma (quem não matricula escolhe depois).
  const canEnroll = can("groups.enroll");
  const groupMissing = (plan: GuidedPlanForm, groupId: string) =>
    canEnroll && planGroupMissing(groups, plan.services, groupId);
  const dirty = useFormDirty({
    form,
    demonstrationAdded,
    demonstration,
    plans,
    singles,
    productLines,
    orderDiscount,
  });
  // O que falta no cadastro e na etapa guiada escolhida: o botão fica desativado listando (QM14).
  const planLabel = (index: number) =>
    plans.length > 1 ? `Plano ${index + 1}` : "Plano";
  const singleLabel = (index: number) =>
    singles.length > 1 ? `Serviço avulso ${index + 1}` : "Serviço avulso";
  const productOf = (id: string) => products?.find((item) => item.id === id);
  // Produtos vendidos depois do cadastro, junto com o que mais foi adicionado.
  const soldProducts = productLines.filter((line) => productOf(line.productId));
  const orderPlans: (OrderPlanItem & { form: GuidedSingleForm })[] = [
    ...plans.map((entry, index) => ({
      key: `plan-${entry.id}`,
      label: planLabel(index),
      form: entry.form,
      terms: withPlanFirstCharge(entry.form, slotsOf(entry.groupId)),
    })),
    ...singles.map((entry, index) => ({
      key: `plan-${entry.id}`,
      label: singleLabel(index),
      form: entry.form,
      terms: entry.form,
    })),
  ]
    .filter((item) => item.form.planTemplateId)
    .map((item) => ({
      key: item.key,
      name: item.form.name || item.label,
      detail: `${item.label} · ${item.form.installments === 1 ? "1 cobrança" : `${item.form.installments} parcelas`}`,
      terms: item.terms,
      discount: item.form.discount,
      form: item.form,
    }));
  const order = guidedOrder(
    orderPlans,
    soldProducts.map((line) => {
      const product = productOf(line.productId)!;
      return {
        key: `product-${line.key}`,
        name: product.name,
        detail: `${line.quantity} × ${currency.format(line.unitPriceInCents / 100)}${line.size ? ` · ${productSizeLabel(line.size)}` : ""}`,
        quantity: line.quantity,
        unitPriceInCents: line.unitPriceInCents,
        discount: line.discount,
      };
    }),
    orderDiscount,
  );
  const orderLine = (key: string) =>
    order.lines.find((line) => line.key === key);
  /** Termos do plano com a parte do desconto geral que coube a ele. */
  function withOrderShare<T extends GuidedSingleForm>(form: T, key: string): T {
    const terms = { ...form };
    delete terms.orderDiscountInCents;
    const share = orderLine(key)?.orderDiscountInCents ?? 0;
    return share ? { ...terms, orderDiscountInCents: share } : terms;
  }
  const missing = useMissingFields([
    ...(form.fullName.trim() ? [] : ["Nome completo"]),
    ...(form.cpf.trim() ? [] : ["CPF"]),
    ...(form.phone.trim() ? [] : ["Telefone"]),
    ...(step === "demonstration"
      ? [
          !demonstration.serviceId && "Serviço",
          !demonstration.professionalId && "Profissional",
          !demonstration.roomId && "Sala",
          !demonstration.startsAt && "Data e horário",
        ].filter((item): item is string => Boolean(item))
      : []),
    ...plans.flatMap(({ form: plan, groupId }, index) =>
      [
        ...missingPlanFields(plan),
        ...(groupMissing(plan, groupId) ? ["Turma"] : []),
      ].map((item) =>
        plans.length > 1 ? `${planLabel(index)}: ${item}` : item,
      ),
    ),
    ...singles.flatMap(({ form: single }, index) =>
      missingPlanFields(single).map((item) =>
        step === "single" ? item : `${singleLabel(index)}: ${item}`,
      ),
    ),
    // A API só junta vários avulsos quando há um plano principal.
    ...(!plans.length && singles.length > 1
      ? ["Plano (para vender mais de um serviço avulso)"]
      : []),
    ...(productLines.length
      ? productLines.flatMap((line, index) => {
          const label =
            productLines.length > 1 ? `Produto ${index + 1}` : "Produto";
          const product = productOf(line.productId);
          if (!product) return [`${label}: produto`];
          if (product.sizes.length && !line.size) return [`${label}: tamanho`];
          return line.quantity > sellableStock(product, line.size || undefined)
            ? [`${label}: quantidade dentro do estoque`]
            : [];
        })
      : []),
  ]);
  function guidedInput(): GuidedPatientInput | string {
    if (step === "demonstration") {
      if (!demonstration.startsAt)
        return "Informe a data e o horário da aula experimental.";
      return {
        next: "demonstration",
        patient: form,
        appointment: {
          serviceId: demonstration.serviceId,
          professionalId: demonstration.professionalId,
          roomId: demonstration.roomId,
          startsAt: new Date(demonstration.startsAt).toISOString(),
          notes: demonstration.notes,
        },
      };
    }
    if ([...plans, ...singles].some((entry) => !entry.form.planTemplateId))
      return "Selecione um plano cadastrado.";
    if (step === "single")
      return {
        next: "single",
        patient: form,
        plan: withOrderShare(singles[0]!.form, `plan-${singles[0]!.id}`),
      };
    if (step === "plan" && !plans.length)
      return "Para vender mais de um serviço avulso, adicione também um plano.";
    if (step === "plan") {
      if (plans.some((entry) => groupMissing(entry.form, entry.groupId)))
        return "Selecione a turma do plano de aulas em grupo.";
      const groupIds = plans.map((entry) => entry.groupId).filter(Boolean);
      if (new Set(groupIds).size !== groupIds.length)
        return "A mesma turma foi escolhida em mais de um plano.";
      const [first, ...rest] = plans;
      return {
        next: "plan",
        patient: form,
        plan: withOrderShare(
          withPlanFirstCharge(first!.form, slotsOf(first!.groupId)),
          `plan-${first!.id}`,
        ),
        ...(first!.groupId ? { groupId: first!.groupId } : {}),
        ...(rest.length || singles.length
          ? {
              additionalPlans: [
                ...rest.map((entry) => ({
                  plan: withOrderShare(
                    withPlanFirstCharge(entry.form, slotsOf(entry.groupId)),
                    `plan-${entry.id}`,
                  ),
                  ...(entry.groupId ? { groupId: entry.groupId } : {}),
                })),
                ...singles.map((entry) => ({
                  plan: {
                    ...withOrderShare(entry.form, `plan-${entry.id}`),
                    kind: "single" as const,
                  },
                })),
              ],
            }
          : {}),
      };
    }
    return { next: "none", patient: form };
  }
  /**
   * Vende os produtos da sacola depois do cadastro (mesma venda da tela Vendas), com o
   * preço unitário já descontado. Devolve o complemento do aviso; se a venda falhar, o
   * cadastro e os planos continuam salvos e o erro aparece num aviso.
   */
  async function sellProducts(patientId: string) {
    if (!soldProducts.length) return "";
    const discountInCents = soldProducts.reduce((sum, line) => {
      const item = orderLine(`product-${line.key}`);
      return (
        sum + (item ? item.itemDiscountInCents + item.orderDiscountInCents : 0)
      );
    }, 0);
    try {
      const sale = await api.createProductSale({
        patientId,
        notes: discountInCents
          ? `Venda do cadastro do cliente, com ${currency.format(discountInCents / 100)} de desconto.`
          : "Venda do cadastro do cliente.",
        items: soldProducts.map((line) => ({
          productId: line.productId,
          ...(line.size ? { size: line.size } : {}),
          quantity: line.quantity,
          unitPriceInCents:
            orderLine(`product-${line.key}`)?.unitNetInCents ??
            line.unitPriceInCents,
        })),
        settlement: productPayment.settlement,
        ...(productPayment.settlement === "paid"
          ? {
              paymentMethod: productPayment.paymentMethod,
              ...(productPayment.paymentInstallments > 1
                ? { paymentInstallments: productPayment.paymentInstallments }
                : {}),
            }
          : {}),
        dueDate: productPayment.dueDate,
      });
      return ` Venda de produtos de ${currency.format(sale.totalInCents / 100)} registrada.`;
    } catch (cause) {
      toast.error(
        `Cadastro salvo, mas a venda dos produtos não foi registrada: ${(cause as Error).message}`,
      );
      return "";
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!isValidCpf(form.cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError("");
    if (patient) {
      setLoading(true);
      try {
        const saved = await api.updatePatient(patient.id, form);
        toast.success(
          `Cadastro de ${patientFirstName(saved.fullName)} atualizado.`,
        );
        onSaved(saved);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        submitting.current = false;
        setLoading(false);
      }
      return;
    }
    const input = guidedInput();
    if (typeof input === "string") {
      setError(input);
      submitting.current = false;
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (input.next === "none") {
        const created = await api.createPatient(form);
        const soldNotice = await sellProducts(created.id);
        toast.success(
          `Cadastro de ${patientFirstName(created.fullName)} criado.${soldNotice}`,
        );
        onSaved(created);
        return;
      }
      // O cadastro guiado já confirma num aviso detalhado na lista (savedNotice).
      const result = await api.createGuidedPatient(input);
      const soldNotice = await sellProducts(result.patient.id);
      const notice = `${guidedNotice(result, groups ?? [])}${soldNotice}`;
      const registration = {
        ...result,
        group: groups?.find((group) => group.id === result.enrollment?.groupId),
      };
      // Vários planos no Pix: uma cobrança só, com os nomes e a soma dos valores.
      // A resposta vem na ordem do que foi enviado (principal e depois os adicionais).
      const sentPlans =
        input.next === "plan"
          ? [
              input.plan,
              ...(input.additionalPlans ?? []).map((entry) => entry.plan),
            ]
          : input.next === "single"
            ? [input.plan]
            : [];
      const createdPlans = [
        ...(result.plan ? [result.plan] : []),
        ...(result.additionalPlans ?? []).map((entry) => entry.plan),
      ];
      const pixPlans = createdPlans.filter(
        (plan) => plan.paymentMethod === "pix",
      );
      // 1º pagamento de cada item no Pix (proporcional à turma e com o desconto do plano),
      // somado.
      const pixFirstCharges = createdPlans.flatMap((plan, index) => {
        const firstInstallmentInCents =
          sentPlans[index]?.firstInstallmentInCents;
        const discounted = discountedPlanInstallments(
          planInstallmentSchedule({ ...plan, firstInstallmentInCents }),
          sentPlans[index]?.discount,
          undefined,
          sentPlans[index]?.orderDiscountInCents,
        );
        const first = discounted.installments[0];
        return plan.paymentMethod === "pix" && first
          ? [
              {
                prorated: firstInstallmentInCents !== undefined,
                amountInCents:
                  first.amountInCents + first.customerDiscountInCents,
                discountInCents: first.customerDiscountInCents,
              },
            ]
          : [];
      });
      const pixDiscount = pixFirstCharges.reduce(
        (sum, item) => sum + item.discountInCents,
        0,
      );
      if (pixPlans.length > 0 && pixKey) {
        const installments = pixPlans[0]!.installments;
        setPixCharge({
          patient: result.patient,
          notice,
          result: registration,
          message: planPixChargeMessage({
            patientName: result.patient.fullName,
            planName: pixPlans.map((plan) => plan.name).join(" + "),
            totalValueInCents: pixPlans.reduce(
              (sum, plan) => sum + plan.totalValueInCents,
              0,
            ),
            // Parcelas diferentes entre os planos: a mensagem cobra o total.
            installments: pixPlans.every(
              (plan) => plan.installments === installments,
            )
              ? installments
              : 1,
            totalSessions: pixPlans.reduce(
              (sum, plan) => sum + plan.totalSessions,
              0,
            ),
            pixKey,
            template: pixTemplate,
            firstChargeInCents: pixFirstCharges.some((item) => item.prorated)
              ? pixFirstCharges.reduce(
                  (sum, item) => sum + item.amountInCents,
                  0,
                )
              : undefined,
            ...(pixDiscount ? { discountInCents: pixDiscount } : {}),
          }),
        });
        return;
      }
      onSaved(result.patient, notice, registration);
    } catch (cause) {
      // Tudo ou nada: nada foi gravado, o formulário continua preenchido.
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }
  function addItem(key: "demonstration" | "plan" | "single" | "product") {
    if (key === "demonstration") return setDemonstrationAdded(true);
    if (key === "product") return addProductLine();
    const id = nextPlanId.current++;
    if (key === "plan")
      return setPlans((current) => [...current, defaultGuidedPlanEntry(id)]);
    setSingles((current) => [...current, { id, form: defaultSingleForm() }]);
  }
  // Itens que podem entrar no cadastro, cada um com o seu botão "Adicionar".
  const sellsItems = plans.length + singles.length;
  const addOptions: {
    key: "demonstration" | "plan" | "single" | "product";
    label: string;
    detail: string;
    icon: LucideIcon;
    disabled: boolean;
  }[] = [
    ...(canBookDemonstration
      ? [
          {
            key: "demonstration" as const,
            label: "Agendar aula experimental",
            detail: "Reserva um horário na agenda",
            icon: CalendarPlus,
            disabled: demonstrationAdded || sellsItems > 0,
          },
        ]
      : []),
    ...(canSellPlans
      ? [
          {
            key: "plan" as const,
            label: "Adicionar plano",
            detail: "Pacote ou mensalidade, com turma",
            icon: Layers,
            disabled: demonstrationAdded || sellsItems >= maxGuidedPlans,
          },
        ]
      : []),
    ...(canSellSingles
      ? [
          {
            key: "single" as const,
            label: "Adicionar serviço avulso",
            detail: "Sessão ou procedimento pago à parte",
            icon: Ticket,
            disabled:
              demonstrationAdded ||
              sellsItems >= maxGuidedPlans ||
              // Mais de um avulso só junto com um plano.
              (!plans.length && singles.length > 0),
          },
        ]
      : []),
    ...(sellsProducts
      ? [
          {
            key: "product" as const,
            label: "Adicionar produto",
            detail: "Item do estoque vendido na hora",
            icon: ShoppingBag,
            disabled: false,
          },
        ]
      : []),
  ];
  const addedSummary = demonstrationAdded
    ? "A aula experimental é agendada sozinha; para vender planos ou serviços, remova-a."
    : sellsItems || productLines.length
      ? "Os itens adicionados aparecem abaixo e podem ser removidos."
      : "Nada adicionado: só o cadastro do cliente será salvo.";
  const removeButton = (label: string, onRemove: () => void) => (
    <div className="guided-plan-actions">
      <button
        type="button"
        className="secondary-button"
        disabled={loading}
        onClick={onRemove}
      >
        <Trash2 size={16} aria-hidden="true" />
        {`Remover ${label}`}
      </button>
    </div>
  );
  const productBlocks = productLines.map((line, index) => (
    <fieldset className="form-fieldset span-2" key={`product-${line.key}`}>
      <legend>
        {productLines.length > 1 ? `Produto ${index + 1}` : "Produto"}
      </legend>
      {productsError ? (
        <p className="form-error">{`Não foi possível carregar os produtos: ${productsError}`}</p>
      ) : products === null ? (
        <LoadingBlock />
      ) : !products.length ? (
        <p className="muted-copy">
          Nenhum produto ativo. Cadastre produtos em Vendas › Estoque.
        </p>
      ) : (
        <GuidedProductFields
          line={line}
          lines={productLines}
          products={products}
          disabled={!editable || loading}
          onChange={(patch) => updateProductLine(line.key, patch)}
          onRemove={() =>
            setProductLines((current) =>
              current.filter((item) => item.key !== line.key),
            )
          }
          onEditDiscount={() =>
            setDiscountTarget({
              target: "product",
              discount: line.discount,
              apply: (next) =>
                updateProductLine(line.key, { discount: next ?? undefined }),
            })
          }
        />
      )}
    </fieldset>
  ));
  if (pixCharge) {
    const finish = () =>
      onSaved(pixCharge.patient, pixCharge.notice, pixCharge.result);
    const phone = pixCharge.patient.whatsapp || pixCharge.patient.phone;
    return (
      <Modal
        eyebrow="Cadastro rápido"
        title="Enviar cobrança Pix"
        subtitle={`${pixCharge.notice} Envie a chave Pix para ${patientFirstName(pixCharge.patient.fullName)} pelo WhatsApp.`}
        onClose={finish}
      >
        <div className="form-grid">
          <label className="span-2">
            Mensagem
            <textarea readOnly rows={5} value={pixCharge.message} />
          </label>
          <div className="modal-actions span-2">
            <button type="button" className="secondary-button" onClick={finish}>
              Concluir
            </button>
            <a
              className="whatsapp-button"
              href={whatsappLink(phone, pixCharge.message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar Pix pelo WhatsApp
            </a>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal
      eyebrow={patient ? "Clientes" : "Cadastro rápido"}
      title={patient ? "Editar cliente" : "Novo cliente"}
      subtitle={
        patient
          ? `Atualize o cadastro ${patient.recordNumber}.`
          : "Cadastre as informações essenciais. O restante pode ser completado depois."
      }
      busy={loading}
      dirty={dirty}
      inactive={Boolean(discountTarget)}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nome completo
          <input
            required
            value={form.fullName}
            onChange={(e) => field("fullName", e.target.value)}
            autoFocus
          />
        </label>
        <label className="span-2">
          Apelido
          <input
            maxLength={80}
            placeholder="Como o cliente prefere ser chamado"
            value={form.nickname ?? ""}
            onChange={(e) => field("nickname", e.target.value)}
          />
        </label>
        <label className="span-2">
          CPF
          <CpfInput
            required
            value={form.cpf}
            onChange={(digits) => field("cpf", digits)}
          />
        </label>
        <fieldset className="form-fieldset span-2">
          <legend>Contato</legend>
          <div className="form-fieldset-grid">
            <div className="field-with-hint">
              <label>
                Telefone
                <PhoneInput
                  required
                  value={form.phone}
                  onChange={(digits) => field("phone", digits)}
                />
              </label>
            </div>
            <div className="field-with-hint">
              <label>
                WhatsApp
                <PhoneInput
                  value={form.whatsapp ?? ""}
                  onChange={(digits) => field("whatsapp", digits)}
                />
              </label>
              <small className="field-hint">
                Em branco, as mensagens usam o telefone de contato.
              </small>
            </div>
          </div>
        </fieldset>
        <label>
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => field("email", e.target.value)}
          />
        </label>
        <label>
          Data de nascimento
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => field("birthDate", e.target.value)}
          />
        </label>
        {/* Cadastro rápido (U15): o essencial à vista; o restante fica recolhido. */}
        <details className="more-info span-2" open={Boolean(patient)}>
          <summary>Mais informações</summary>
          <div className="form-grid">
            <PatientProfileFields
              form={form}
              onChange={(key, value) =>
                setForm((current) => ({ ...current, [key]: value }))
              }
            />
            <fieldset className="form-fieldset emergency-fieldset span-2">
              <legend>Contato de emergência</legend>
              <div className="form-fieldset-grid">
                <label>
                  Nome
                  <input
                    autoComplete="off"
                    placeholder="Ex.: Maria Souza (mãe)"
                    value={form.emergencyContactName}
                    onChange={(e) =>
                      field("emergencyContactName", e.target.value)
                    }
                  />
                </label>
                <label>
                  Telefone
                  <PhoneInput
                    value={form.emergencyContactPhone ?? ""}
                    onChange={(digits) =>
                      field("emergencyContactPhone", digits)
                    }
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="form-fieldset span-2">
              <legend>Etiquetas</legend>
              {configuredTags.error ? (
                <p className="form-error">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
              ) : configuredTags.tags === null ? (
                <LoadingBlock />
              ) : tagChoices.length === 0 ? (
                <p className="muted-copy">
                  Nenhuma etiqueta configurada. Cadastre as etiquetas em
                  Configurações › Etiquetas.
                </p>
              ) : (
                <div className="tag-filter-list">
                  {tagChoices.map((tag) => (
                    <TagChoice
                      key={tag.name}
                      name={tag.name}
                      color={patientTagDisplayColor(tag)}
                      pressed={form.tags.includes(tag.name)}
                      disabled={!editable}
                      onToggle={() => toggleTag(tag.name)}
                    />
                  ))}
                </div>
              )}
            </fieldset>
            <label className="span-2">
              Observações
              <textarea
                value={form.notes}
                onChange={(e) => field("notes", e.target.value)}
                rows={3}
              />
            </label>
          </div>
        </details>
        {addOptions.length > 0 && (
          <fieldset className="form-fieldset guided-add span-2">
            <legend>O que o cliente vai fazer?</legend>
            <p className="field-hint">{addedSummary}</p>
            <div className="guided-add-grid">
              {addOptions.map(
                ({ key, label, detail, icon: Icon, disabled }) => (
                  <button
                    type="button"
                    key={key}
                    className="guided-add-option"
                    aria-label={label}
                    aria-describedby={`guided-add-${key}`}
                    disabled={disabled || !editable || loading}
                    onClick={() => addItem(key)}
                  >
                    <span className="guided-add-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="guided-add-text">
                      <strong>{label}</strong>
                      <small id={`guided-add-${key}`}>{detail}</small>
                    </span>
                  </button>
                ),
              )}
            </div>
          </fieldset>
        )}
        {demonstrationAdded && (
          <fieldset className="form-fieldset span-2">
            <legend>Aula experimental</legend>
            <GuidedDemonstrationFields
              value={demonstration}
              setValue={setDemonstration}
            />
            {removeButton("aula experimental", () =>
              setDemonstrationAdded(false),
            )}
          </fieldset>
        )}
        {plans.map((entry, index) => (
          <fieldset className="form-fieldset span-2" key={entry.id}>
            <legend>{planLabel(index)}</legend>
            <GuidedPlanFields
              form={entry.form}
              setForm={planFormSetter(entry.id)}
              onServiceChange={() => updatePlan(entry.id, { groupId: "" })}
              groupSlots={slotsOf(entry.groupId)}
              patientName={form.fullName}
              pixKey={pixKey}
              pixTemplate={pixTemplate}
              kindField={
                <label>
                  Modelo
                  <select
                    value={entry.form.kind}
                    onChange={(e) => {
                      const kind = e.target.value as GuidedPlanForm["kind"];
                      updatePlan(entry.id, {
                        form: {
                          ...entry.form,
                          kind,
                          // Recorrente: uma cobrança por ciclo.
                          installments:
                            kind === "recurring" ? 1 : entry.form.installments,
                          autoRenew:
                            kind === "recurring" &&
                            Boolean(entry.form.validUntil),
                        },
                      });
                    }}
                  >
                    {guidedPlanKinds.map((kind) => (
                      <option value={kind} key={kind}>
                        {planKindLabels[kind]}
                      </option>
                    ))}
                  </select>
                </label>
              }
            >
              <GuidedGroupField
                serviceIds={entry.form.services.map(
                  (service) => service.serviceId,
                )}
                value={entry.groupId}
                onChange={(groupId) => updatePlan(entry.id, { groupId })}
                groups={groups}
                setGroups={setGroups}
              />
            </GuidedPlanFields>
            {entry.form.planTemplateId && (
              <PlanDiscountSummary
                discount={entry.form.discount}
                emptyLabel="Sem desconto neste plano."
                disabled={!editable || loading}
                onEdit={() =>
                  editDiscount(entry.form.discount, planFormSetter(entry.id))
                }
              />
            )}
            {removeButton(planLabel(index).toLowerCase(), () =>
              setPlans((current) =>
                current.filter((item) => item.id !== entry.id),
              ),
            )}
          </fieldset>
        ))}
        {singles.map((entry, index) => (
          <fieldset className="form-fieldset span-2" key={entry.id}>
            <legend>{singleLabel(index)}</legend>
            <GuidedPlanFields
              form={entry.form}
              setForm={singleFormSetter(entry.id)}
              patientName={form.fullName}
              pixKey={pixKey}
              pixTemplate={pixTemplate}
            />
            {entry.form.planTemplateId && (
              <PlanDiscountSummary
                discount={entry.form.discount}
                emptyLabel="Sem desconto neste serviço."
                disabled={!editable || loading}
                onEdit={() =>
                  editDiscount(entry.form.discount, singleFormSetter(entry.id))
                }
              />
            )}
            {removeButton(singleLabel(index).toLowerCase(), () =>
              setSingles((current) =>
                current.filter((item) => item.id !== entry.id),
              ),
            )}
          </fieldset>
        ))}
        {productBlocks}
        {productLines.length > 0 && (
          <fieldset className="form-fieldset span-2">
            <legend>Pagamento dos produtos</legend>
            <GuidedProductPaymentFields
              value={productPayment}
              onChange={(patch) =>
                setProductPayment((current) => ({ ...current, ...patch }))
              }
            />
          </fieldset>
        )}
        {(sellsItems > 0 || productLines.length > 0) && (
          <GuidedOrderSummary
            order={order}
            orderDiscount={orderDiscount}
            disabled={!editable || loading}
            onEditOrderDiscount={() =>
              setDiscountTarget({
                target: "order",
                discount: orderDiscount,
                apply: (next) => setOrderDiscount(next ?? undefined),
              })
            }
          />
        )}
        {error && <div className="form-error span-2">{error}</div>}
        {!editable && (
          <p className="muted-copy span-2">
            Seu acesso a Clientes é só de consulta: as alterações não podem ser
            salvas.
          </p>
        )}
        {editable && missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={loading}>
            {editable ? "Cancelar" : "Fechar"}
          </ModalCancelButton>
          {editable && (
            <button
              className="primary-button"
              disabled={loading || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {loading
                ? "Salvando…"
                : patient
                  ? "Salvar alterações"
                  : step === "none" && productLines.length
                    ? "Salvar e registrar venda"
                    : guidedSubmitLabels[step]}
            </button>
          )}
        </div>
      </form>
      {showHistory && patient && (
        <PatientTimelineSection patientId={patient.id} />
      )}
      {discountTarget &&
        createPortal(
          <PatientDiscountModal
            discount={discountTarget.discount}
            target={discountTarget.target}
            onApply={(discount) => {
              discountTarget.apply(discount);
              setDiscountTarget(null);
            }}
            onClose={() => setDiscountTarget(null)}
          />,
          document.body,
        )}
    </Modal>
  );
}
