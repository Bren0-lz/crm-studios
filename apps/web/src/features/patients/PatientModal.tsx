import {
  patientFirstName,
  patientNotesMaxLength,
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
  INVALID_CPF_TAG,
  MISSING_CPF_TAG,
} from "@crm/contracts";
import {
  CalendarPlus,
  CheckCircle2,
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
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { ChangeReasonField } from "../../shared/components/ChangeReasonField";
import { CpfInput } from "../../shared/components/CpfInput";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { planGroupMissing } from "../../shared/lib/plan-groups";
import { productSaleInstallments } from "../../shared/lib/product-installments";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import {
  GuidedSaleContext,
  type GuidedFollowUpRequest,
  type GuidedSaleItem,
} from "../../shared/workflows/GuidedSaleContext";
import {
  SignatureTemplateField,
  useCanRequestSignature,
  useSignatureTemplates,
} from "../contracts/index";
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
import { GuidedItemFieldset } from "./GuidedItemFieldset";
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
  guidedGroupFull,
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
import {
  effectiveDrafts,
  paymentDraftsIssue,
  toPaymentParts,
} from "../../shared/lib/payment-parts";
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
    emergencyContactWhatsapp: patient?.emergencyContactWhatsapp ?? "",
    notes: patient?.notes ?? "",
    // Etiquetas automáticas ("Pagamento atrasado", "Falta CPF"): não aparecem para marcar.
    tags: withoutAutomaticPatientTags(patient?.tags ?? []),
  }));
  // O histórico usa acesso comercial: a fisioterapia não vê nem chama a rota.
  const showHistory = Boolean(patient) && can("patients.timeline");
  const editable = patient ? can("patients.update") : can("patients.create");
  // B6-05: cadastro novo exige CPF; quem já está sem CPF (importado da planilha) pode ser
  // editado sem ele e mantém a etiqueta "Falta CPF" até preencher. CPF gravado não se apaga.
  const cpfOptional = Boolean(patient) && !patient?.cpf;
  // CD1: o mesmo para WhatsApp e contato de emergência — obrigatórios no cadastro novo; quem
  // foi cadastrado antes sem eles segue editável, mas o que já está gravado não se apaga.
  const whatsappOptional = Boolean(patient) && !patient?.whatsapp;
  const emergencyNameOptional =
    Boolean(patient) && !patient?.emergencyContactName;
  const emergencyPhoneOptional =
    Boolean(patient) && !patient?.emergencyContactPhone;
  const emergencyWhatsappOptional =
    Boolean(patient) && !patient?.emergencyContactWhatsapp;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [changeReason, setChangeReason] = useState("");
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
  function updateSingle(id: number, patch: Partial<GuidedSingleEntry>) {
    setSingles((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  // Contrato de cada plano e sessões do avulso, vendidos junto com o cadastro (RC8).
  const guidedSale = useContext(GuidedSaleContext);
  const canSign = useCanRequestSignature() && !patient;
  const signatureTemplates = useSignatureTemplates(canSign);
  const [scheduleNested, setScheduleNested] = useState(false);
  const [scheduleBlocked, setScheduleBlocked] = useState<
    Record<number, string>
  >({});
  // Passos finais (link do contrato, horários e pagamento), um estágio por vez.
  const [followUp, setFollowUp] = useState<GuidedFollowUpRequest | null>(null);
  // Turmas carregadas uma vez (sobrevivem à troca de opção); `null` enquanto não buscadas.
  const [groups, setGroups] = useState<GroupClass[] | null>(null);
  // Turma cheia (TW3): o plano não é vendido; o cliente vai para a Lista de espera do serviço.
  const soldPlans = plans.filter(
    (entry) => !guidedGroupFull(groups, entry.groupId),
  );
  const waitlistPlans = plans.filter((entry) =>
    guidedGroupFull(groups, entry.groupId),
  );
  // Próximo passo enviado à API, derivado do que foi adicionado: um avulso sozinho é
  // `single`; planos (com ou sem avulsos) são `plan`; só turmas cheias é `waitlist`; nada (ou
  // só produtos) é `none`.
  const step: GuidedPatientNext = demonstrationAdded
    ? "demonstration"
    : plans.length
      ? soldPlans.length || singles.length
        ? "plan"
        : "waitlist"
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
      parts: [{ paymentMethod: "pix", amountInCents: null, installments: 1 }],
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
    /** Depois da cobrança: a pergunta do pagamento (se houver contrato) e o fim do cadastro. */
    next: () => void;
  } | null>(null);
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
    ...plans.flatMap((entry, index) =>
      soldPlans.includes(entry)
        ? [
            {
              key: `plan-${entry.id}`,
              label: planLabel(index),
              form: entry.form,
              terms: withPlanFirstCharge(entry.form, slotsOf(entry.groupId)),
            },
          ]
        : [],
    ),
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
  // Total da venda dos produtos (preço já descontado), dividido entre as formas.
  const productsTotalInCents = soldProducts.reduce(
    (sum, line) =>
      sum +
      line.quantity *
        (orderLine(`product-${line.key}`)?.unitNetInCents ??
          line.unitPriceInCents),
    0,
  );
  const productParts = effectiveDrafts(
    productPayment.parts,
    productsTotalInCents,
  );
  const productLinesOfOrder = order.lines.filter(
    (line) => line.kind === "product",
  );
  // Prévia por parcela só com uma forma; no picado, cada forma aparece no próprio campo.
  const productInstallments =
    productLinesOfOrder.length && productParts.length <= 1
      ? productSaleInstallments({
          items: productLinesOfOrder.map((line) => ({
            label: line.name,
            grossInCents: line.grossInCents,
          })),
          discountInCents: productLinesOfOrder.reduce(
            (sum, line) => sum + line.grossInCents - line.netInCents,
            0,
          ),
          settlement: productPayment.settlement,
          dueDate: productPayment.dueDate,
          paymentMethod: productParts[0]?.paymentMethod ?? "pix",
          paymentInstallments: productParts[0]?.installments ?? 1,
        })
      : undefined;
  /** Termos do plano com a parte do desconto geral que coube a ele. */
  function withOrderShare<T extends GuidedSingleForm>(form: T, key: string): T {
    const terms = { ...form };
    delete terms.orderDiscountInCents;
    const share = orderLine(key)?.orderDiscountInCents ?? 0;
    return share ? { ...terms, orderDiscountInCents: share } : terms;
  }
  const missing = useMissingFields([
    ...(form.fullName.trim() ? [] : ["Nome completo"]),
    ...(form.cpf.trim() || cpfOptional ? [] : ["CPF"]),
    ...(form.phone.trim() ? [] : ["Telefone"]),
    ...(form.whatsapp?.trim() || whatsappOptional ? [] : ["WhatsApp"]),
    ...(form.emergencyContactName?.trim() || emergencyNameOptional
      ? []
      : ["Nome do contato de emergência"]),
    ...(form.emergencyContactPhone?.trim() || emergencyPhoneOptional
      ? []
      : ["Telefone do contato de emergência"]),
    ...(form.emergencyContactWhatsapp?.trim() || emergencyWhatsappOptional
      ? []
      : ["WhatsApp do contato de emergência"]),
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
        // Na Lista de espera não há pagamento: basta o plano (o serviço) e a turma.
        ...(guidedGroupFull(groups, groupId)
          ? []
          : [
              ...missingPlanFields(plan),
              ...(groupMissing(plan, groupId) ? ["Turma"] : []),
            ]),
      ].map((item) =>
        plans.length > 1 ? `${planLabel(index)}: ${item}` : item,
      ),
    ),
    ...singles.flatMap(({ form: single }, index) =>
      missingPlanFields(single).map((item) =>
        step === "single" ? item : `${singleLabel(index)}: ${item}`,
      ),
    ),
    // Avulso precisa de um plano vendido junto; turma cheia não conta como plano (TW3).
    ...(plans.length && !soldPlans.length && singles.length
      ? ["Plano com vaga na turma (para vender o serviço avulso)"]
      : []),
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
    ...(soldProducts.length &&
    productsTotalInCents > 0 &&
    paymentDraftsIssue(productPayment.parts, productsTotalInCents)
      ? ["Formas de pagamento dos produtos somando o total"]
      : []),
  ]);
  // Sessões do avulso em conflito ou ainda em verificação: o cadastro espera (como o Novo plano).
  const scheduleBlockedMessage = singles
    .map((entry) => scheduleBlocked[entry.id])
    .find(Boolean);
  /** Contrato e sessões do avulso enviados junto com ele. */
  function singleSale(entry: GuidedSingleEntry) {
    return {
      ...(entry.document ? { document: entry.document } : {}),
      ...(entry.appointments.length
        ? { appointments: entry.appointments }
        : {}),
    };
  }
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
    if (scheduleBlockedMessage) return scheduleBlockedMessage;
    if (step === "single")
      return {
        next: "single",
        patient: form,
        plan: withOrderShare(singles[0]!.form, `plan-${singles[0]!.id}`),
        ...singleSale(singles[0]!),
      };
    // Turma cheia: só a Lista de espera do serviço da turma, sem plano nem cobrança (TW3).
    const waitlist = waitlistPlans.map((entry) => ({
      serviceId: groups!.find((group) => group.id === entry.groupId)!.serviceId,
      groupId: entry.groupId,
    }));
    if (step === "waitlist")
      return { next: "waitlist", patient: form, waitlist };
    if (step === "plan" && !soldPlans.length)
      return plans.length
        ? "Com a turma cheia, o plano não é vendido: venda o serviço avulso junto de um plano com vaga ou depois do cadastro."
        : "Para vender mais de um serviço avulso, adicione também um plano.";
    if (step === "plan") {
      if (plans.some((entry) => groupMissing(entry.form, entry.groupId)))
        return "Selecione a turma do plano de aulas em grupo.";
      const groupIds = plans.map((entry) => entry.groupId).filter(Boolean);
      if (new Set(groupIds).size !== groupIds.length)
        return "A mesma turma foi escolhida em mais de um plano.";
      const [first, ...rest] = soldPlans;
      return {
        next: "plan",
        patient: form,
        plan: withOrderShare(
          withPlanFirstCharge(first!.form, slotsOf(first!.groupId)),
          `plan-${first!.id}`,
        ),
        ...(first!.groupId ? { groupId: first!.groupId } : {}),
        ...(first!.document ? { document: first!.document } : {}),
        ...(rest.length || singles.length
          ? {
              additionalPlans: [
                ...rest.map((entry) => ({
                  plan: withOrderShare(
                    withPlanFirstCharge(entry.form, slotsOf(entry.groupId)),
                    `plan-${entry.id}`,
                  ),
                  ...(entry.groupId ? { groupId: entry.groupId } : {}),
                  ...(entry.document ? { document: entry.document } : {}),
                })),
                ...singles.map((entry) => ({
                  plan: {
                    ...withOrderShare(entry.form, `plan-${entry.id}`),
                    kind: "single" as const,
                  },
                  ...singleSale(entry),
                })),
              ],
            }
          : {}),
        ...(waitlist.length ? { waitlist } : {}),
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
        // Pago agora: as formas recebidas; a receber: as previstas.
        ...(productParts.length > 1
          ? { payments: toPaymentParts(productParts) }
          : {
              paymentMethod: productParts[0]!.paymentMethod,
              ...(productParts[0]!.installments > 1
                ? { paymentInstallments: productParts[0]!.installments }
                : {}),
            }),
        dueDate: productPayment.dueDate,
        ...(discountInCents > 0 ? { discountInCents } : {}),
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
    if (!(cpfOptional && !form.cpf.trim()) && !isValidCpf(form.cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError("");
    if (patient) {
      setLoading(true);
      try {
        const saved = await api.updatePatient(patient.id, form, changeReason);
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
      // Cobrança Pix pelo WhatsApp: só nos planos de forma única no Pix.
      const pixPlans = createdPlans.filter(
        (plan) => plan.paymentMethod === "pix" && !plan.paymentParts,
      );
      // 1º pagamento de cada item no Pix (proporcional à turma e com o desconto do plano),
      // somado.
      const pixFirstCharges = createdPlans.flatMap((plan, index) => {
        const proratedChargeInCents = sentPlans[index]?.proratedChargeInCents;
        const discounted = discountedPlanInstallments(
          planInstallmentSchedule({ ...plan, proratedChargeInCents }),
          sentPlans[index]?.discount,
          undefined,
          sentPlans[index]?.orderDiscountInCents,
        );
        const first = discounted.installments[0];
        return plan.paymentMethod === "pix" && !plan.paymentParts && first
          ? [
              {
                prorated: proratedChargeInCents !== undefined,
                manual: sentPlans[index]?.manualFirstCharge === true,
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
      // Passos finais: link de cada contrato e horários → cobrança Pix → pergunta do
      // pagamento de cada plano com contrato → fim do cadastro.
      const sales: GuidedSaleItem[] = [
        ...(result.plan
          ? [
              {
                plan: result.plan,
                document: result.document,
                appointments: result.appointments,
              },
            ]
          : []),
        ...(result.additionalPlans ?? []),
      ];
      const patientName = patientFirstName(result.patient.fullName);
      const finish = () => onSaved(result.patient, notice, registration);
      const askPayment = () => {
        setPixCharge(null);
        if (guidedSale && sales.some((sale) => sale.document))
          setFollowUp({
            stage: "payment",
            patientName,
            sales,
            onDone: finish,
          });
        else finish();
      };
      let afterSend = askPayment;
      if (pixPlans.length > 0 && pixKey) {
        const installments = pixPlans[0]!.installments;
        const charge = {
          patient: result.patient,
          notice,
          result: registration,
          next: askPayment,
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
            manualFirstCharge: pixFirstCharges.some((item) => item.manual),
            ...(pixDiscount ? { discountInCents: pixDiscount } : {}),
          }),
        };
        afterSend = () => {
          setFollowUp(null);
          setPixCharge(charge);
        };
      }
      if (
        guidedSale &&
        sales.some((sale) => sale.document || sale.appointments?.length)
      ) {
        setFollowUp({
          stage: "send",
          patientName,
          sales,
          onDone: afterSend,
        });
        return;
      }
      afterSend();
    } catch (cause) {
      // Tudo ou nada: nada foi gravado, o formulário continua preenchido.
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }
  // Aviso do último item adicionado ou removido; `id` reinicia a animação a cada aviso.
  const [itemNotice, setItemNotice] = useState<{ id: number; text: string }>();
  function announce(text: string) {
    setItemNotice((current) => ({ id: (current?.id ?? 0) + 1, text }));
  }
  const planLabelFor = (count: number) =>
    count > 1 ? `Plano ${count}` : "Plano";
  const singleLabelFor = (count: number) =>
    count > 1 ? `Serviço avulso ${count}` : "Serviço avulso";
  function addItem(key: "demonstration" | "plan" | "single" | "product") {
    if (key === "demonstration") {
      setDemonstrationAdded(true);
      return announce("Aula experimental adicionada logo abaixo.");
    }
    if (key === "product") {
      addProductLine();
      return announce(
        `${productLines.length ? `Produto ${productLines.length + 1}` : "Produto"} adicionado logo abaixo.`,
      );
    }
    const id = nextPlanId.current++;
    if (key === "plan") {
      setPlans((current) => [...current, defaultGuidedPlanEntry(id)]);
      return announce(
        `${planLabelFor(plans.length + 1)} adicionado logo abaixo.`,
      );
    }
    setSingles((current) => [
      ...current,
      { id, form: defaultSingleForm(), document: null, appointments: [] },
    ]);
    announce(`${singleLabelFor(singles.length + 1)} adicionado logo abaixo.`);
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
    <GuidedItemFieldset
      key={`product-${line.key}`}
      legend={productLines.length > 1 ? `Produto ${index + 1}` : "Produto"}
      onRemoved={() => {
        setProductLines((current) =>
          current.filter((item) => item.key !== line.key),
        );
        announce("Produto removido da sacola.");
      }}
    >
      {(remove) =>
        productsError ? (
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
            onRemove={remove}
            onEditDiscount={() =>
              setDiscountTarget({
                target: "product",
                discount: line.discount,
                apply: (next) =>
                  updateProductLine(line.key, { discount: next ?? undefined }),
              })
            }
          />
        )
      }
    </GuidedItemFieldset>
  ));
  if (followUp && guidedSale)
    return guidedSale.renderFollowUp({
      ...followUp,
      // Estágio seguinte: a cobrança Pix ou a pergunta do pagamento (outro estágio).
      onDone: () => {
        setFollowUp(null);
        followUp.onDone();
      },
    });
  if (pixCharge) {
    const finish = pixCharge.next;
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
      inactive={Boolean(discountTarget) || scheduleNested}
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
        <div className="field-with-hint span-2">
          <label>
            CPF
            <CpfInput
              required={!cpfOptional}
              hintId={cpfOptional ? "patient-cpf-hint" : undefined}
              value={form.cpf}
              onChange={(digits) => field("cpf", digits)}
            />
          </label>
          {cpfOptional && (
            <span className="field-hint" id="patient-cpf-hint">
              {patient?.importedInvalidCpf
                ? `A planilha trouxe o CPF “${patient.importedInvalidCpf}”, que não confere: preencha o CPF correto e a etiqueta “${INVALID_CPF_TAG}” sai sozinha.`
                : `Cliente sem CPF: preencha quando tiver. A etiqueta “${MISSING_CPF_TAG}” sai sozinha.`}
            </span>
          )}
        </div>
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
                  required={!whatsappOptional}
                  value={form.whatsapp ?? ""}
                  onChange={(digits) => field("whatsapp", digits)}
                />
              </label>
              {whatsappOptional && (
                <small className="field-hint">
                  Cadastro sem WhatsApp: preencha quando tiver. Em branco, as
                  mensagens usam o telefone de contato.
                </small>
              )}
            </div>
          </div>
        </fieldset>
        <fieldset className="form-fieldset emergency-fieldset span-2">
          <legend>Contato de emergência</legend>
          <div className="form-fieldset-grid">
            <label className="span-2">
              Nome
              <input
                autoComplete="off"
                placeholder="Ex.: Maria Souza (mãe)"
                required={!emergencyNameOptional}
                value={form.emergencyContactName}
                onChange={(e) => field("emergencyContactName", e.target.value)}
              />
            </label>
            <label>
              Telefone
              <PhoneInput
                required={!emergencyPhoneOptional}
                value={form.emergencyContactPhone ?? ""}
                onChange={(digits) => field("emergencyContactPhone", digits)}
              />
            </label>
            <label>
              WhatsApp
              <PhoneInput
                required={!emergencyWhatsappOptional}
                value={form.emergencyContactWhatsapp ?? ""}
                onChange={(digits) => field("emergencyContactWhatsapp", digits)}
              />
            </label>
          </div>
          {/* Quem não tem contato de emergência repete o próprio nome, telefone e WhatsApp. */}
          <button
            className="secondary-button"
            type="button"
            disabled={
              !form.fullName.trim() &&
              !form.phone.trim() &&
              !form.whatsapp?.trim()
            }
            onClick={() =>
              setForm((current) => ({
                ...current,
                emergencyContactName: current.fullName,
                emergencyContactPhone: current.phone,
                emergencyContactWhatsapp: current.whatsapp || current.phone,
              }))
            }
          >
            Usar os dados do cliente
          </button>
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
                maxLength={patientNotesMaxLength}
                value={form.notes}
                onChange={(e) => field("notes", e.target.value)}
                rows={3}
              />
            </label>
          </div>
        </details>
        {demonstrationAdded && (
          <GuidedItemFieldset
            legend="Aula experimental"
            onRemoved={() => {
              setDemonstrationAdded(false);
              announce("Aula experimental removida.");
            }}
          >
            {(remove) => (
              <>
                <GuidedDemonstrationFields
                  value={demonstration}
                  setValue={setDemonstration}
                />
                {removeButton("aula experimental", remove)}
              </>
            )}
          </GuidedItemFieldset>
        )}
        {plans.map((entry, index) => (
          <GuidedItemFieldset
            key={entry.id}
            legend={planLabel(index)}
            onRemoved={() => {
              setPlans((current) =>
                current.filter((item) => item.id !== entry.id),
              );
              announce(`${entry.form.name || planLabel(index)} removido.`);
            }}
          >
            {(remove) => (
              <>
                <GuidedPlanFields
                  form={entry.form}
                  setForm={planFormSetter(entry.id)}
                  onServiceChange={() => updatePlan(entry.id, { groupId: "" })}
                  groupSlots={slotsOf(entry.groupId)}
                  waitlisted={guidedGroupFull(groups, entry.groupId)}
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
                                kind === "recurring"
                                  ? 1
                                  : entry.form.installments,
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
                {canSign && !guidedGroupFull(groups, entry.groupId) && (
                  <SignatureTemplateField
                    state={signatureTemplates}
                    value={entry.document}
                    onChange={(document) => updatePlan(entry.id, { document })}
                    disabled={!editable || loading}
                  />
                )}
                {entry.form.planTemplateId &&
                  !guidedGroupFull(groups, entry.groupId) && (
                    <PlanDiscountSummary
                      discount={entry.form.discount}
                      emptyLabel="Sem desconto neste plano."
                      disabled={!editable || loading}
                      onEdit={() =>
                        editDiscount(
                          entry.form.discount,
                          planFormSetter(entry.id),
                        )
                      }
                    />
                  )}
                {removeButton(planLabel(index).toLowerCase(), remove)}
              </>
            )}
          </GuidedItemFieldset>
        ))}
        {singles.map((entry, index) => (
          <GuidedItemFieldset
            key={entry.id}
            legend={singleLabel(index)}
            onRemoved={() => {
              setSingles((current) =>
                current.filter((item) => item.id !== entry.id),
              );
              announce(`${entry.form.name || singleLabel(index)} removido.`);
            }}
          >
            {(remove) => (
              <>
                <GuidedPlanFields
                  form={entry.form}
                  setForm={singleFormSetter(entry.id)}
                  patientName={form.fullName}
                  pixKey={pixKey}
                  pixTemplate={pixTemplate}
                />
                {canSign && (
                  <SignatureTemplateField
                    state={signatureTemplates}
                    value={entry.document}
                    onChange={(document) =>
                      updateSingle(entry.id, { document })
                    }
                    disabled={!editable || loading}
                  />
                )}
                {guidedSale?.renderScheduling({
                  plan: { ...entry.form, kind: "single", patientId: "" },
                  appointments: entry.appointments,
                  onChange: (appointments) =>
                    updateSingle(entry.id, { appointments }),
                  onNestedChange: setScheduleNested,
                  onBlockedChange: (message) =>
                    setScheduleBlocked((current) =>
                      current[entry.id] === message
                        ? current
                        : { ...current, [entry.id]: message },
                    ),
                })}
                {entry.form.planTemplateId && (
                  <PlanDiscountSummary
                    discount={entry.form.discount}
                    emptyLabel="Sem desconto neste serviço."
                    disabled={!editable || loading}
                    onEdit={() =>
                      editDiscount(
                        entry.form.discount,
                        singleFormSetter(entry.id),
                      )
                    }
                  />
                )}
                {removeButton(singleLabel(index).toLowerCase(), remove)}
              </>
            )}
          </GuidedItemFieldset>
        ))}
        {productBlocks}
        {productLines.length > 0 && (
          <fieldset className="form-fieldset span-2">
            <legend>Pagamento dos produtos</legend>
            <GuidedProductPaymentFields
              value={productPayment}
              totalInCents={productsTotalInCents}
              disabled={!editable || loading}
              onChange={(patch) =>
                setProductPayment((current) => ({ ...current, ...patch }))
              }
            />
          </fieldset>
        )}
        {/* Menu de adicionar sempre depois do último item, logo acima da sacola. */}
        {addOptions.length > 0 && (
          <fieldset className="form-fieldset guided-add span-2">
            <legend>O que o cliente vai fazer?</legend>
            <p className="field-hint">{addedSummary}</p>
            <p className="guided-item-notice" role="status">
              {itemNotice && (
                <span key={itemNotice.id}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {itemNotice.text}
                </span>
              )}
            </p>
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
        {(soldPlans.length + singles.length > 0 || productLines.length > 0) && (
          <GuidedOrderSummary
            order={order}
            productInstallments={productInstallments}
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
        {patient && editable && (
          <ChangeReasonField
            value={changeReason}
            onChange={setChangeReason}
            disabled={loading}
          />
        )}
        {error && <div className="form-error span-2">{error}</div>}
        {!editable && (
          <p className="muted-copy span-2">
            Seu acesso a Clientes é só de consulta: as alterações não podem ser
            salvas.
          </p>
        )}
        {editable && scheduleBlockedMessage && (
          <div className="form-error span-2" role="alert">
            {scheduleBlockedMessage}
          </div>
        )}
        {editable && missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={loading}>
            {editable ? "Cancelar" : "Fechar"}
          </ModalCancelButton>
          {editable && (
            <button
              className="primary-button"
              disabled={
                loading || missing.blocked || Boolean(scheduleBlockedMessage)
              }
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
