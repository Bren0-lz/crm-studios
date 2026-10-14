import {
  type PatientProfileFilter,
  type PatientSegmentSummary,
  matchesPatientProfile,
  matchesPatientSegment,
  patientProfileLabels,
} from "@crm/contracts/patients";
import type {
  GroupClass,
  GuidedPatientNext,
  GuidedPatientResult,
  Patient,
  PatientExportColumn,
  PatientImportDuplicate,
  PatientImportRow,
  PatientTimelineKind,
  PermissionKey,
} from "@crm/contracts";
import {
  type LucideIcon,
  CalendarDays,
  CircleDollarSign,
  MessageCircle,
  PackageOpen,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import {
  localIsoDate,
  shortDate,
  timeLabel,
  toLocalDateTimeInput,
} from "../../shared/lib/formatting";
import type {
  GuidedDemonstrationForm,
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
  };
}

export function describeImportDuplicate(
  duplicate: PatientImportDuplicate,
): string {
  const field = duplicate.field === "cpf" ? "mesmo CPF" : "mesmo telefone";
  return duplicate.kind === "existing"
    ? `Já cadastrado: ${duplicate.fullName} (${field})`
    : `Repete a linha ${duplicate.line} (${field})`;
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

export function groupVacancyLabel(group: GroupClass) {
  const free = group.capacity - group.activeEnrollments;
  if (free <= 0) return "turma cheia (lista de espera)";
  return free === 1 ? "1 vaga" : `${free} vagas`;
}

export function guidedNotice(
  result: GuidedPatientResult,
  groups: GroupClass[],
) {
  const { appointment, plan, enrollment } = result;
  if (appointment) {
    const startsAt = new Date(appointment.startsAt);
    return `Aula de demonstração agendada para ${shortDate.format(startsAt)}, às ${timeLabel.format(startsAt)}.`;
  }
  if (!plan) return "";
  if (plan.kind === "single") return `Serviço avulso “${plan.name}” criado.`;
  const created = `Plano “${plan.name}” criado.`;
  if (!enrollment) return created;
  const groupName =
    groups.find((item) => item.id === enrollment.groupId)?.name ?? "escolhida";
  if (enrollment.status === "waitlisted")
    return `${created} A turma ${groupName} está cheia: o cliente entrou na lista de espera${
      enrollment.queuePosition ? ` (posição ${enrollment.queuePosition})` : ""
    }.`;
  return `${created} Matrícula feita na turma ${groupName}.`;
}

export const guidedPlanKinds = ["fixed_package", "recurring"] as const;

export const guidedStepLabels: Record<GuidedPatientNext, string> = {
  demonstration: "Aula de demonstração",
  plan: "Assinar um plano",
  single: "Serviço avulso",
  none: "Só cadastrar por enquanto",
};

export const guidedStepOrder = ["demonstration", "plan", "single"] as const;

export const guidedStepPermissions: Record<
  (typeof guidedStepOrder)[number],
  PermissionKey
> = {
  demonstration: "agenda.create",
  plan: "plans.create",
  single: "plans.create",
};

export const guidedSubmitLabels: Record<GuidedPatientNext, string> = {
  demonstration: "Salvar e agendar demonstração",
  plan: "Salvar e criar plano",
  single: "Salvar e criar serviço avulso",
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
  notes: "Observações",
  createdAt: "Cadastrado em",
};

export const patientImportStatusLabels: Record<
  PatientImportRow["status"],
  string
> = {
  valid: "Válida",
  error: "Erro",
  duplicate: "Duplicada",
};

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

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

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
  contact: { filter: "contacts", icon: PhoneCall },
  message: { filter: "messages", icon: MessageCircle },
  satisfaction: { filter: "satisfaction", icon: Star },
};
