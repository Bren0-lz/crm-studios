import {
  type PatientProfileFilter,
  type PatientSegmentSummary,
  INCOMPLETE_REGISTRATION_TAG,
  INVALID_CPF_TAG,
  lacksEmail,
  lacksRequiredContact,
  MISSING_CPF_TAG,
  MISSING_EMAIL_TAG,
  matchesPatientProfile,
  matchesPatientSegment,
  patientDiscountDescription,
  patientImportFieldLabels,
  patientImportFields,
  patientImportRequiredFields,
  patientProfileLabels,
  PATIENT_IMPORT_EXTRA_FIELD,
} from "@crm/contracts/patients";
import type {
  GroupClass,
  PatientDiscount,
  GuidedPatientNext,
  GuidedPatientResult,
  Lead,
  Patient,
  PatientExportColumn,
  PatientInput,
  PatientImportColumn,
  PatientImportDuplicate,
  PatientImportField,
  PatientImportRow,
  PatientTimelineKind,
  PermissionKey,
} from "@crm/contracts";
import { withPrefix, withQuotedPrefix } from "@crm/contracts";
import { EXTRA_FIELDS_LABEL } from "@crm/contracts/common";
import {
  type LucideIcon,
  CalendarDays,
  CircleDollarSign,
  Eye,
  MessageCircle,
  PackageOpen,
  PencilLine,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Send,
  Signature,
  Star,
  X,
} from "lucide-react";
import { planRecurrenceMissing } from "../../shared/lib/payment-parts";
import {
  localIsoDate,
  shortDate,
  timeLabel,
  toLocalDateTimeInput,
} from "../../shared/lib/formatting";
import type {
  GuidedDemonstrationForm,
  GuidedPlanEntry,
  GuidedSingleForm,
  PatientRecordFilter,
  PatientSort,
  PatientStatusFilter,
  TimelineFilter,
} from "./types";

export function countLabel(
  count: number,
  singular: string,
  pluralForm: string,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function defaultGuidedDemonstration(): GuidedDemonstrationForm {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(9, 0, 0, 0);
  return {
    serviceId: "",
    professionalId: "",
    roomId: "",
    startsAt: toLocalDateTimeInput(startsAt),
    notes: "",
  };
}

export const defaultPatientFilters = {
  profile: {} as PatientProfileFilter,
  status: "all" as PatientStatusFilter,
  record: "all" as PatientRecordFilter,
  tags: [] as string[],
  sort: "name_asc" as PatientSort,
  /** Assinantes sem turma vinculada: calculado na API (`GET /patients?withoutGroup=true`). */
  withoutGroup: false,
};

/** Plano novo do passo "Assinar um plano"; `id` identifica o bloco na lista. */
export function defaultGuidedPlanEntry(id: number): GuidedPlanEntry {
  return {
    id,
    form: { kind: "fixed_package", ...defaultPlanTerms() },
    groupId: "",
    document: null,
  };
}

export function defaultSingleForm(): GuidedSingleForm {
  return {
    ...defaultPlanTerms(),
    name: "Serviço avulso",
    installments: 1,
    validUntil: "",
  };
}

export function defaultPlanTerms(): GuidedSingleForm {
  const today = localIsoDate();
  return {
    planTemplateId: "",
    name: "",
    services: [],
    validFrom: today,
    validUntil: "",
    totalValueInCents: 0,
    installments: 3,
    firstDueDate: today,
    autoRenew: false,
    // Nunca sem forma de pagamento: começa no Pix.
    paymentMethod: "pix",
  };
}

export function describeImportDuplicate(
  duplicate: PatientImportDuplicate,
  input?: PatientImportRow["input"],
): string {
  const field = duplicate.field === "cpf" ? "mesmo CPF" : "mesmo telefone";
  return duplicate.kind === "existing"
    ? `Já cadastrado: ${duplicate.fullName} (${field})${input?.extraFields ? ` · “${EXTRA_FIELDS_LABEL}” será atualizado` : ""}`
    : `Repete a linha ${duplicate.line} (${field})`;
}

/** Linhas de clientes já cadastrados que trazem "Outros": a importação mescla esses dados. */
export function importMergeCount(rows: readonly PatientImportRow[]): number {
  return rows.filter(
    (row) =>
      row.status === "duplicate" &&
      row.duplicateOf?.kind === "existing" &&
      row.input?.extraFields,
  ).length;
}

/**
 * Detalhe da linha válida na prévia da importação: o que falta e a etiqueta automática que o
 * cliente vai receber ("Falta CPF", "Cadastro incompleto", "Sem e-mail").
 */
export function importRowNotes(input: PatientImportRow["input"]): string[] {
  if (!input) return [];
  return [
    ...(input.cpf
      ? []
      : input.invalidCpf
        ? [
            `CPF inválido na planilha: entra sem CPF (etiqueta “${INVALID_CPF_TAG}”)`,
          ]
        : [`sem CPF (etiqueta “${MISSING_CPF_TAG}”)`]),
    ...(lacksRequiredContact(input)
      ? [
          `sem WhatsApp ou contato de emergência (etiqueta “${INCOMPLETE_REGISTRATION_TAG}”)`,
        ]
      : []),
    ...(lacksEmail(input)
      ? [`sem e-mail (etiqueta “${MISSING_EMAIL_TAG}”)`]
      : []),
  ];
}

export function filterPatients(
  patients: Patient[],
  filters: typeof defaultPatientFilters,
  segments: PatientSegmentSummary[] = [],
) {
  const currentMonth = new Date().getMonth() + 1;
  return patients
    .filter(
      (patient) =>
        matchesPatientProfile(patient, filters.profile) &&
        matchesPatientSegment(
          segments.find((item) => item.patientId === patient.id),
          filters.profile.segment,
        ),
    )
    .filter(
      (patient) =>
        filters.status === "all" || patient.status === filters.status,
    )
    .filter((patient) => {
      if (filters.record === "with_email") return Boolean(patient.email);
      if (filters.record === "without_email") return !patient.email;
      if (filters.record === "birthday_month")
        return (
          Boolean(patient.birthDate) &&
          Number(patient.birthDate!.slice(5, 7)) === currentMonth
        );
      return true;
    })
    .filter(
      (patient) =>
        filters.tags.length === 0 ||
        filters.tags.some((tag) => patient.tags.includes(tag)),
    )
    .sort((a, b) => {
      if (filters.sort === "name_desc")
        return b.fullName.localeCompare(a.fullName, "pt-BR");
      if (filters.sort === "newest")
        return b.createdAt.localeCompare(a.createdAt);
      if (filters.sort === "oldest")
        return a.createdAt.localeCompare(b.createdAt);
      return a.fullName.localeCompare(b.fullName, "pt-BR");
    });
}

export { groupVacancyLabel } from "../../shared/lib/formatting";

export function guidedNotice(
  result: GuidedPatientResult,
  groups: GroupClass[],
) {
  const { appointment, plan, enrollment } = result;
  if (appointment) {
    const startsAt = new Date(appointment.startsAt);
    return `Aula experimental agendada para ${shortDate.format(startsAt)}, às ${timeLabel.format(startsAt)}.`;
  }
  // Turma cheia (TW3): só a Lista de espera do serviço, sem plano nem cobrança.
  const waitlisted = (result.waitlistEntries ?? []).map(
    (entry) =>
      `Turma cheia: o cliente entrou na Lista de espera de ${entry.itemName}, sem plano nem cobrança.`,
  );
  if (!plan) return waitlisted.join(" ");
  const entries = [{ plan, enrollment }, ...(result.additionalPlans ?? [])];
  const list = (names: string[]) =>
    new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(
      names.map((name) => `“${name}”`),
    );
  // Serviços avulsos comprados junto com os planos ganham frase própria.
  const subscriptions = entries
    .filter((entry) => entry.plan.kind !== "single")
    .map((entry) => entry.plan.name);
  const singles = entries
    .filter((entry) => entry.plan.kind === "single")
    .map((entry) => entry.plan.name);
  const created = [
    ...(subscriptions.length === 1
      ? [`${withQuotedPrefix("Plano", subscriptions[0]!)} criado.`]
      : subscriptions.length > 1
        ? [`Planos ${list(subscriptions)} criados.`]
        : []),
    ...(singles.length === 1
      ? [`${withQuotedPrefix("Serviço avulso", singles[0]!)} criado.`]
      : singles.length > 1
        ? [`Serviços avulsos ${list(singles)} criados.`]
        : []),
  ].join(" ");
  return [
    created,
    ...entries.flatMap(({ enrollment: item }) => {
      if (!item) return [];
      const groupName =
        groups.find((group) => group.id === item.groupId)?.name ?? "escolhida";
      return item.status === "waitlisted"
        ? `A ${withPrefix("turma", groupName)} está cheia: o cliente entrou na lista de espera${
            item.queuePosition ? ` (posição ${item.queuePosition})` : ""
          }.`
        : `Matrícula feita na ${withPrefix("turma", groupName)}.`;
    }),
    ...waitlisted,
  ].join(" ");
}

/** Turma escolhida sem vaga (TW3): o plano vira Lista de espera, sem pagamento nem contrato. */
export function guidedGroupFull(groups: GroupClass[] | null, groupId: string) {
  const group = groupId
    ? groups?.find((item) => item.id === groupId)
    : undefined;
  return Boolean(group && group.activeEnrollments >= group.capacity);
}

export const guidedPlanKinds = ["fixed_package", "recurring"] as const;

/** Planos que o cliente pode assinar de uma vez no cadastro guiado (o principal + 9 adicionais). */
export const maxGuidedPlans = 10;

/** Campos obrigatórios ainda vazios de um plano do cadastro guiado. */
export function missingPlanFields(plan: GuidedSingleForm) {
  return [
    !plan.planTemplateId && "Plano cadastrado",
    !plan.validFrom && "Início",
    !plan.firstDueDate && "Primeiro vencimento",
    ...planRecurrenceMissing(plan),
  ].filter((item): item is string => Boolean(item));
}

export const guidedStepOrder = ["demonstration", "plan", "single"] as const;

export const guidedStepPermissions: Record<
  (typeof guidedStepOrder)[number],
  PermissionKey
> = {
  demonstration: "agenda.create",
  plan: "plans.create",
  single: "plans.create",
};

/**
 * LC1: cadastro de cliente já preenchido com o que o lead guarda (conversão do lead). O que o
 * lead não tem fica em branco; etiquetas do lead entram pela conversão, na API.
 */
export function leadPatientInput(lead: Lead): PatientInput {
  return {
    fullName: lead.fullName,
    cpf: lead.cpf ?? "",
    phone: lead.phone,
    whatsapp: lead.whatsapp ?? "",
    email: lead.email ?? "",
    birthDate: lead.birthDate ?? "",
    postalCode: lead.postalCode ?? "",
    residenceType: lead.residenceType ?? "",
    address: lead.address ?? "",
    addressNumber: lead.addressNumber ?? "",
    complement: lead.complement ?? "",
    buildingName: lead.buildingName ?? "",
    block: lead.block ?? "",
    floor: lead.floor ?? "",
    unit: lead.unit ?? "",
    referencePoint: lead.referencePoint ?? "",
    neighborhood: lead.neighborhood ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    occupation: lead.occupation ?? "",
    source: lead.source ?? "",
    gender: lead.gender ?? "",
    clientSince: lead.clientSince ?? "",
    imageConsent: lead.imageConsent ?? false,
    emergencyContactName: lead.emergencyContactName ?? "",
    emergencyContactPhone: lead.emergencyContactPhone ?? "",
    emergencyContactWhatsapp: lead.emergencyContactWhatsapp ?? "",
    notes: lead.notes ?? "",
    ...(lead.interests?.length ? { interests: lead.interests } : {}),
    tags: [],
  };
}

export const guidedSubmitLabels: Record<GuidedPatientNext, string> = {
  demonstration: "Salvar e agendar aula experimental",
  plan: "Salvar e criar plano",
  single: "Salvar e criar serviço avulso",
  waitlist: "Salvar e colocar na lista de espera",
  none: "Salvar cliente",
};

export const patientExportColumnNames: Record<PatientExportColumn, string> = {
  ...patientProfileLabels,
  fullName: "Nome",
  recordNumber: "Prontuário",
  cpf: "CPF",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  birthDate: "Nascimento",
  tags: "Etiquetas",
  status: "Situação",
  emergencyContactName: "Contato de emergência",
  emergencyContactPhone: "Telefone de emergência",
  emergencyContactWhatsapp: "WhatsApp de emergência",
  notes: "Observações",
  createdAt: "Cadastrado em",
  leadOrigin: "Origem: evento/lead",
  extraFields: EXTRA_FIELDS_LABEL,
};

export const patientImportStatusLabels: Record<
  PatientImportRow["status"],
  string
> = {
  valid: "Válida",
  error: "Erro",
  duplicate: "Duplicada",
};

export type PatientImportMapping = (PatientImportField | null)[];

const importMappingStorageKey = "crm.patientImportMapping";

/** Opções do seletor de cada coluna: campos com valor e, à parte, os DDDs separados. */
export const patientImportFieldOptions = {
  values: patientImportFields
    .filter((field) => !field.endsWith("AreaCode"))
    .map((field) => ({ field, label: patientImportFieldOptionLabel(field) })),
  areaCodes: patientImportFields
    .filter((field) => field.endsWith("AreaCode"))
    .map((field) => ({ field, label: patientImportFieldOptionLabel(field) })),
};

function patientImportFieldOptionLabel(field: PatientImportField) {
  const label = patientImportFieldLabels[field];
  return (patientImportRequiredFields as readonly string[]).includes(field)
    ? `${label} (obrigatório)`
    : label;
}

/** Nome da coluna na tela: o título da planilha ou "Coluna N" quando está em branco. */
export function patientImportColumnTitle(column: PatientImportColumn) {
  return column.title || `Coluna ${column.index + 1}`;
}

/**
 * Atribui `field` à coluna `index`; se outra coluna já usava o campo, ela passa a
 * "Não importar" (um campo só pode vir de uma coluna). "Outros" pode ficar em várias.
 */
export function assignImportColumn(
  mapping: PatientImportMapping,
  index: number,
  field: PatientImportField | null,
): PatientImportMapping {
  return mapping.map((current, position) =>
    position === index
      ? field
      : field && field !== PATIENT_IMPORT_EXTRA_FIELD && current === field
        ? null
        : current,
  );
}

function importHeaderSignature(columns: readonly PatientImportColumn[]) {
  return columns
    .map((column) =>
      column.title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim(),
    )
    .join("|");
}

/** Mapeamento salvo neste navegador para planilhas com os mesmos títulos de coluna. */
export function storedImportMapping(
  columns: readonly PatientImportColumn[],
): PatientImportMapping | undefined {
  try {
    const saved = JSON.parse(
      localStorage.getItem(importMappingStorageKey) ?? "null",
    ) as { signature?: unknown; mapping?: unknown } | null;
    if (
      !saved ||
      saved.signature !== importHeaderSignature(columns) ||
      !Array.isArray(saved.mapping) ||
      saved.mapping.length !== columns.length
    )
      return undefined;
    const known = new Set<string>(patientImportFields);
    return saved.mapping.map((field) =>
      typeof field === "string" && known.has(field)
        ? (field as PatientImportField)
        : null,
    );
  } catch {
    return undefined;
  }
}

export function storeImportMapping(
  columns: readonly PatientImportColumn[],
  mapping: PatientImportMapping,
) {
  try {
    localStorage.setItem(
      importMappingStorageKey,
      JSON.stringify({ signature: importHeaderSignature(columns), mapping }),
    );
  } catch {
    // Sem armazenamento: o mapeamento só não é lembrado na próxima importação.
  }
}

export const patientImportTemplate = [
  "nome;cpf;telefone;whatsapp;email;nascimento;etiquetas;observações",
  "Maria da Silva;123.456.789-09;(11) 99999-0000;(11) 99999-0000;maria@exemplo.com;15/03/1990;pilates, vip;Prefere horários pela manhã",
].join("\r\n");

export const patientImportTemplateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${patientImportTemplate}\r\n`)}`;

export const patientRecordFilterLabels: Record<PatientRecordFilter, string> = {
  all: "Todos",
  with_email: "Com e-mail",
  without_email: "Sem e-mail",
  birthday_month: "Aniversariantes do mês",
};

export const patientsPerPage = 20;

export { readFileAsBase64 } from "../../shared/lib/import-file";

export function timelineDate(value: string) {
  const date = new Date(value);
  return `${shortDate.format(date)} de ${date.getFullYear()} · ${timeLabel.format(date)}`;
}

export const timelineFilterLabels: Array<
  [Exclude<TimelineFilter, "all">, string]
> = [
  ["appointments", "Atendimentos"],
  ["plans", "Planos"],
  ["payments", "Pagamentos"],
  ["contacts", "Contatos"],
  ["messages", "Mensagens"],
  ["satisfaction", "Satisfação"],
  ["edits", "Cadastro"],
];

export const timelineKindConfig: Record<
  PatientTimelineKind,
  { filter: Exclude<TimelineFilter, "all">; icon: LucideIcon }
> = {
  appointment: { filter: "appointments", icon: CalendarDays },
  plan_created: { filter: "plans", icon: PackageOpen },
  plan_renewed: { filter: "plans", icon: RefreshCw },
  plan_cancelled: { filter: "plans", icon: X },
  payment: { filter: "payments", icon: CircleDollarSign },
  payment_reversal: { filter: "payments", icon: RotateCcw },
  // Recibo da baixa (RC4): enviado, visualizado e assinado ficam com os pagamentos.
  receipt_sent: { filter: "payments", icon: Send },
  receipt_viewed: { filter: "payments", icon: Eye },
  receipt_signed: { filter: "payments", icon: Signature },
  contact: { filter: "contacts", icon: PhoneCall },
  message: { filter: "messages", icon: MessageCircle },
  satisfaction: { filter: "satisfaction", icon: Star },
  patient_updated: { filter: "edits", icon: PencilLine },
};

/** "10% de desconto · nas próximas 3 cobranças (1 usada)"; vazio sem desconto. */
export const patientDiscountLabel = patientDiscountDescription;

/** Termos do plano com o desconto escolhido (ou sem desconto). */
export function withPlanDiscount<
  T extends { discount?: PatientDiscount | undefined },
>(form: T, discount: PatientDiscount | null): T {
  const terms = { ...form };
  delete terms.discount;
  return discount ? { ...terms, discount } : terms;
}
