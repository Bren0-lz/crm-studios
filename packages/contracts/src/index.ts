import { z } from "zod";

export const patientStatusSchema = z.enum(["active", "inactive"]);
export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const appointmentStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "excused_absence",
  "professional_absence",
  "cancelled",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

// Formato brasileiro com DDD: (11) 3333-4444 para fixo e (11) 99999-9999 para celular.
// Também formata valores parciais, para ser usado enquanto a pessoa digita.
export function formatPhone(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${area}) ${number}`;
  const split = number.length === 9 ? 5 : 4;
  return `(${area}) ${number.slice(0, split)}-${number.slice(split)}`;
}

const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((digits) => digits.length === 10 || digits.length === 11, "Informe o telefone com DDD.");
const optionalPhoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((digits) => digits.length === 0 || digits.length === 10 || digits.length === 11, "Informe o telefone com DDD.")
  .optional();

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Tipo de usuário: `admin` tem acesso total (todos os módulos e a Administração); `user`
 * (usuário comum) vê e edita só os módulos marcados pelo admin — sem nenhum marcado, só a
 * Visão geral. Os antigos perfis (gestora, recepção, fisioterapeuta, financeiro) foram
 * convertidos pela migração 0042 sem mudar o acesso de ninguém.
 */
export const userRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof userRoleSchema>;
export const userRoleLabels: Record<UserRole, string> = {
  admin: "Admin",
  user: "Usuário comum",
};

/**
 * Módulos do sistema que o admin libera por usuário (chaves estáveis).
 * "Visão geral" é sempre visível e "Administração" é sempre só do admin: nenhum dos dois é
 * módulo configurável.
 */
export const appModuleSchema = z.enum([
  "agenda",
  "groups",
  "patients",
  "plans",
  "crm",
  "relationship",
  "communications",
  "contracts",
  "clinical",
  "finance",
  "reports",
  "settings",
]);
export type AppModule = z.infer<typeof appModuleSchema>;
export const appModuleLabels: Record<AppModule, string> = {
  agenda: "Agenda",
  groups: "Turmas",
  patients: "Clientes",
  plans: "Planos e sessões",
  crm: "CRM comercial",
  relationship: "Contatos sugeridos",
  communications: "Comunicações",
  contracts: "Contratos",
  clinical: "Prontuários",
  finance: "Financeiro",
  reports: "Relatórios",
  settings: "Configurações",
};
/**
 * Módulos efetivos: admin tem sempre todos; usuário comum só os gravados (nulo/ausente =
 * nenhum), sem duplicatas e na ordem do enum.
 */
export function effectiveModules(
  role: UserRole,
  modules?: readonly AppModule[] | null,
): AppModule[] {
  if (role === "admin") return [...appModuleSchema.options];
  const chosen = modules ?? [];
  return appModuleSchema.options.filter((module) => chosen.includes(module));
}
/**
 * Módulos com edição efetiva: admin edita tudo; usuário comum só os gravados (nulo/ausente =
 * nenhum). Editar implica ver: o resultado é sempre subconjunto de
 * `effectiveModules(role, modules)`, sem duplicatas e na ordem do enum.
 */
export function effectiveEditModules(
  role: UserRole,
  modules?: readonly AppModule[] | null,
  editModules?: readonly AppModule[] | null,
): AppModule[] {
  if (role === "admin") return [...appModuleSchema.options];
  const chosen = editModules ?? [];
  return effectiveModules(role, modules).filter((module) => chosen.includes(module));
}
const jobTitleSchema = z.string().trim().max(80);
const userModulesSchema = z
  .array(appModuleSchema)
  .max(appModuleSchema.options.length * 2)
  .nullable();
const strongPasswordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.");
/**
 * Regra de comissão do próprio usuário (`commission_rules.user_id`), sem exigir profissional
 * ligado. Vale nos atendimentos do profissional da agenda ligado ao usuário a partir de
 * `effectiveFrom` e prevalece sobre a regra do profissional (Financeiro); nova vigência cria
 * uma regra nova (o histórico é mantido).
 */
export const adminUserCommissionInputSchema = z.object({
  percentage: z.number().min(0).max(100),
  effectiveFrom: z.iso.date(),
});
export type AdminUserCommissionInput = z.infer<
  typeof adminUserCommissionInputSchema
>;
export const adminUserInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  email: z.email().transform((value) => value.toLowerCase()),
  role: userRoleSchema,
  password: strongPasswordSchema,
  /** Cargo informativo; vazio = sem cargo. */
  jobTitle: jobTitleSchema.optional(),
  /** Módulos que o usuário comum vê; ausente ou `null` = nenhum (admin ignora: vê tudo). */
  modules: userModulesSchema.optional(),
  /** Módulos com edição; ausente ou `null` = nenhum (editar sem ver é descartado). */
  editModules: userModulesSchema.optional(),
  /** Comissão do usuário já na criação; ausente = sem comissão. */
  commission: adminUserCommissionInputSchema.optional(),
});
export type AdminUserInput = z.infer<typeof adminUserInputSchema>;
export const adminUserUpdateSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  role: userRoleSchema,
  active: z.boolean(),
  /** Ausente = mantém o cargo atual; vazio = remove o cargo. */
  jobTitle: jobTitleSchema.optional(),
  /** Ausente = mantém os módulos atuais; `null` = nenhum. */
  modules: userModulesSchema.optional(),
  /** Ausente = mantém os módulos com edição atuais; `null` = nenhum. */
  editModules: userModulesSchema.optional(),
});
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;
export const passwordResetSchema = z.object({ password: strongPasswordSchema });
export const clinicSettingsInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  phone: optionalPhoneSchema,
  email: z.email().optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  timezone: z.string().trim().min(3).max(80),
});
export type ClinicSettingsInput = z.infer<typeof clinicSettingsInputSchema>;

export const patientInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  cpf: z.string().trim().min(11).max(14).optional().or(z.literal("")),
  email: z.email().optional().or(z.literal("")),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  birthDate: z.iso.date().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactPhone: optionalPhoneSchema,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type PatientInput = z.infer<typeof patientInputSchema>;

/** Cor das etiquetas criadas sem cor e das importadas na migração 0044. */
export const DEFAULT_PATIENT_TAG_COLOR = "#64748b";
const patientTagNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da etiqueta.")
  .max(40, "O nome da etiqueta pode ter até 40 caracteres.");
const patientTagColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.")
  .transform((value) => value.toLowerCase());
/** `POST /patient-tags`: cor opcional (padrão `DEFAULT_PATIENT_TAG_COLOR`). */
export const patientTagInputSchema = z.object({
  name: patientTagNameSchema,
  color: patientTagColorSchema.default(DEFAULT_PATIENT_TAG_COLOR),
});
export type PatientTagInput = z.infer<typeof patientTagInputSchema>;
/** `PATCH /patient-tags/:id`: renomear e/ou trocar a cor (ao menos um dos dois). */
export const patientTagUpdateSchema = z
  .object({ name: patientTagNameSchema.optional(), color: patientTagColorSchema.optional() })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: "Informe o novo nome ou a nova cor.",
  });
export type PatientTagUpdate = z.infer<typeof patientTagUpdateSchema>;
/** Etiqueta configurada da clínica (Configurações › Etiquetas). */
export interface PatientTag {
  id: string;
  clinicId: string;
  name: string;
  /** `#rrggbb` (minúsculas). */
  color: string;
  /** Quantos clientes têm a etiqueta. */
  patientCount: number;
  createdAt: string;
  updatedAt: string;
}
/**
 * Chave de comparação do nome da etiqueta: sem acentos, minúsculas e espaços internos
 * colapsados. Dois nomes com a mesma chave são a mesma etiqueta ("Pós-operatório" =
 * "pos-operatorio").
 */
export function patientTagKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}
/**
 * Confere etiquetas informadas contra as configuradas: devolve os nomes oficiais (na grafia
 * configurada, sem repetição, na ordem informada) e as desconhecidas.
 */
export function resolvePatientTags(
  tags: readonly string[],
  configured: readonly Pick<PatientTag, "name">[],
): { tags: string[]; unknown: string[] } {
  const byKey = new Map(configured.map((tag) => [patientTagKey(tag.name), tag.name]));
  const resolved: string[] = [];
  const unknown: string[] = [];
  for (const tag of tags) {
    const name = byKey.get(patientTagKey(tag));
    if (name === undefined) {
      if (!unknown.includes(tag)) unknown.push(tag);
    } else if (!resolved.includes(name)) resolved.push(name);
  }
  return { tags: resolved, unknown };
}

/** Colunas aceitas em `GET /patients/export?columns=` (na ordem em que saem no arquivo). */
export const patientExportColumnSchema = z.enum(
  [
    "fullName",
    "recordNumber",
    "cpf",
    "phone",
    "whatsapp",
    "email",
    "birthDate",
    "tags",
    "status",
    "emergencyContactName",
    "emergencyContactPhone",
    "notes",
    "createdAt",
  ],
  "Coluna de exportação desconhecida.",
);
export type PatientExportColumn = z.infer<typeof patientExportColumnSchema>;
export const patientExportColumns = patientExportColumnSchema.options;
/** Cabeçalho pt-BR de cada coluna (coerente com o modelo de importação). */
export const patientExportColumnLabels: Record<PatientExportColumn, string> = {
  fullName: "nome",
  recordNumber: "prontuário",
  cpf: "cpf",
  phone: "telefone",
  whatsapp: "whatsapp",
  email: "email",
  birthDate: "nascimento",
  tags: "etiquetas",
  status: "situação",
  emergencyContactName: "contato de emergência",
  emergencyContactPhone: "telefone de emergência",
  notes: "observações",
  createdAt: "cadastrado em",
};

/** Parâmetro de query vazio (`param=`) conta como ausente. */
const emptyQueryToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;
/** Lista separada por vírgula (ou parâmetro repetido); itens vazios são ignorados. */
const queryList = (value: unknown) => {
  const parts = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parts.length > 0 ? parts : undefined;
};
const queryBoolean = z.preprocess(
  emptyQueryToUndefined,
  z
    .enum(["true", "false"], "Use true ou false.")
    .transform((value) => value === "true")
    .optional(),
);

/**
 * Query de `GET /patients/export`. Parâmetros vazios são ignorados.
 * - `format`: `csv` (padrão) ou `xlsx`;
 * - `status`: `active` | `inactive` (ausente = todas as situações);
 * - `tags=a,b`: cliente com **qualquer uma** das etiquetas;
 * - `birthdayMonth=true`: nascimento no mês atual da clínica (`false`/ausente = sem filtro);
 * - `activePlan=true|false`: com / sem plano com status `active` (ausente = sem filtro);
 * - `withoutGroup=true`: assinantes sem turma vinculada (ver `patientListQuerySchema`);
 * - `search`: mesma busca da lista de clientes;
 * - `columns=a,b`: colunas de `patientExportColumns` (ausente = todas, na ordem padrão).
 */
export const patientExportFilterSchema = z.object({
  format: z.preprocess(
    emptyQueryToUndefined,
    z.enum(["csv", "xlsx"], "Formato inválido. Use csv ou xlsx.").default("csv"),
  ),
  status: z.preprocess(emptyQueryToUndefined, patientStatusSchema.optional()),
  tags: z.preprocess(queryList, z.array(z.string().max(40)).max(50).optional()),
  birthdayMonth: queryBoolean,
  activePlan: queryBoolean,
  withoutGroup: queryBoolean,
  search: z.preprocess(emptyQueryToUndefined, z.string().trim().max(160).optional()),
  columns: z.preprocess(
    queryList,
    z
      .array(patientExportColumnSchema)
      .optional()
      .transform((value) =>
        value
          ? patientExportColumns.filter((column) => value.includes(column))
          : [...patientExportColumns],
      ),
  ),
});
export type PatientExportFilter = z.infer<typeof patientExportFilterSchema>;

export const professionalInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  crefito: z.string().trim().min(4).max(40),
  specialty: z.string().trim().min(2).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ProfessionalInput = z.infer<typeof professionalInputSchema>;

export const roomInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  capacity: z.number().int().min(1).max(100),
});
export type RoomInput = z.infer<typeof roomInputSchema>;

export const serviceInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(15).max(480),
  priceInCents: z.number().int().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ServiceInput = z.infer<typeof serviceInputSchema>;

// Tipo do atendimento: normal, aula experimental ou avaliação.
export const appointmentVisitTypeSchema = z.enum([
  "regular",
  "trial",
  "evaluation",
]);
export type AppointmentVisitType = z.infer<typeof appointmentVisitTypeSchema>;

export const appointmentInputSchema = z.object({
  patientId: z.uuid(),
  professionalId: z.uuid(),
  roomId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  visitType: appointmentVisitTypeSchema.default("regular"),
});
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export const appointmentRescheduleInputSchema = z.object({
  professionalId: z.uuid(),
  roomId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
});
export type AppointmentRescheduleInput = z.infer<
  typeof appointmentRescheduleInputSchema
>;

export const recurringAppointmentInputSchema = appointmentInputSchema.extend({
  occurrences: z.number().int().min(2).max(52),
  intervalWeeks: z.number().int().min(1).max(4).default(1),
});
export type RecurringAppointmentInput = z.infer<
  typeof recurringAppointmentInputSchema
>;

// Atendimento de lead ainda não convertido: só experimental ou avaliação.
export const leadAppointmentInputSchema = z.object({
  professionalId: z.uuid(),
  roomId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  visitType: z.enum(["trial", "evaluation"]),
});
export type LeadAppointmentInput = z.infer<typeof leadAppointmentInputSchema>;

export const scheduleBlockInputSchema = z
  .object({
    professionalId: z.uuid().optional(),
    roomId: z.uuid().optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((value) => value.professionalId || value.roomId, {
    message: "Informe o profissional ou a sala.",
    path: ["professionalId"],
  })
  .refine(
    (value) =>
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    {
      message: "O término deve ser posterior ao início.",
      path: ["endsAt"],
    },
  );
export type ScheduleBlockInput = z.infer<typeof scheduleBlockInputSchema>;

const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const groupWeeklySlotsSchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
}).refine((slot) => slot.endTime > slot.startTime, {
  message: "O término deve ser posterior ao início.",
  path: ["endTime"],
})).max(14).refine(
  (slots) => slots.every((slot, index) => slots.every((other, otherIndex) =>
    otherIndex === index || other.weekday !== slot.weekday ||
    other.startTime >= slot.endTime || other.endTime <= slot.startTime)),
  "Os horários de um mesmo dia não podem se sobrepor.",
);
export type GroupWeeklySlot = z.infer<typeof groupWeeklySlotsSchema>[number];

export function groupLetter(sequence: number): string {
  let letters = "";
  for (let rest = sequence; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

export function groupClassName(serviceName: string, sequence: number): string {
  return `${serviceName} Turma ${groupLetter(sequence)}`;
}

const scheduleWeekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const schedulePeriods = [
  { label: "da manhã", until: "12:00" },
  { label: "da tarde", until: "18:00" },
  { label: "da noite", until: "24:00" },
];

function joinWithAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

export function describeGroupSchedule(slots: readonly Pick<GroupWeeklySlot, "weekday" | "startTime">[]): string {
  if (slots.length === 0) return "Horários ainda não definidos";
  const weekOrder = (weekday: number) => (weekday + 6) % 7;
  const parts = schedulePeriods.flatMap((period, index) => {
    const from = schedulePeriods[index - 1]?.until ?? "00:00";
    const days = [...new Set(
      slots.filter((slot) => slot.startTime >= from && slot.startTime < period.until).map((slot) => slot.weekday),
    )].sort((a, b) => weekOrder(a) - weekOrder(b));
    return days.length ? [`${joinWithAnd(days.map((day) => scheduleWeekdayNames[day]!))} ${period.label}`] : [];
  });
  return `Turma de ${joinWithAnd(parts)}`;
}

export const groupClassInputSchema = z.object({
  serviceId: z.uuid(),
  professionalId: z.uuid(),
  roomId: z.uuid(),
  capacity: z.number().int().min(1).max(100),
  weeklySlots: groupWeeklySlotsSchema.min(1),
});
export type GroupClassInput = z.infer<typeof groupClassInputSchema>;
export const groupClassUpdateSchema = z.object({
  capacity: z.number().int().min(1).max(100),
  weeklySlots: groupWeeklySlotsSchema.min(1),
});
export type GroupClassUpdateInput = z.infer<typeof groupClassUpdateSchema>;
export const groupEnrollmentInputSchema = z.object({
  groupId: z.uuid(),
  patientId: z.uuid(),
});
export type GroupEnrollmentInput = z.infer<typeof groupEnrollmentInputSchema>;
export const groupAttendanceInputSchema = z.object({
  status: z.enum(["present", "absent", "excused_absence"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type GroupAttendanceInput = z.infer<typeof groupAttendanceInputSchema>;
export const replacementBookingInputSchema = z.object({
  creditId: z.uuid(),
  sessionId: z.uuid(),
});
export type ReplacementBookingInput = z.infer<
  typeof replacementBookingInputSchema
>;

export const productInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(20).default("un"),
  costInCents: z.number().int().min(0),
  salePriceInCents: z.number().int().min(0),
  initialStock: z.number().int().min(0).max(1_000_000).default(0),
  minimumStock: z.number().int().min(0).max(1_000_000).default(0),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export const stockMovementInputSchema = z.object({
  productId: z.uuid(),
  kind: z.enum(["purchase", "adjustment_in", "adjustment_out", "loss"]),
  quantity: z.number().int().min(1).max(1_000_000),
  notes: z.string().trim().min(3).max(500),
});
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;
export const patientTabInputSchema = z.object({
  patientId: z.uuid(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type PatientTabInput = z.infer<typeof patientTabInputSchema>;
export const patientTabItemInputSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(10_000),
});
export type PatientTabItemInput = z.infer<typeof patientTabItemInputSchema>;
export const appointmentStatusInputSchema = z.object({
  status: appointmentStatusSchema,
});

export const clinicalRecordStatusSchema = z.enum(["draft", "finalized"]);
export type ClinicalRecordStatus = z.infer<typeof clinicalRecordStatusSchema>;

export const clinicalRecordInputSchema = z.object({
  appointmentId: z.uuid(),
  subjective: z.string().trim().max(5000).default(""),
  objective: z.string().trim().max(5000).default(""),
  assessment: z.string().trim().max(5000).default(""),
  plan: z.string().trim().max(5000).default(""),
  painScale: z.number().int().min(0).max(10).optional(),
});
export type ClinicalRecordInput = z.infer<typeof clinicalRecordInputSchema>;

export const assessmentFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(60),
  label: z.string().trim().min(2).max(120),
  type: z.enum(["text", "number", "scale", "boolean"]),
  required: z.boolean().default(false),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type AssessmentField = z.infer<typeof assessmentFieldSchema>;

export const assessmentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  specialty: z.string().trim().min(2).max(100),
  fields: z.array(assessmentFieldSchema).min(1).max(60),
});
export type AssessmentTemplateInput = z.infer<
  typeof assessmentTemplateInputSchema
>;

const assessmentValueSchema = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
]);
export const clinicalAssessmentInputSchema = z.object({
  patientId: z.uuid(),
  templateId: z.uuid(),
  appointmentId: z.uuid().optional().or(z.literal("")),
  values: z.record(z.string(), assessmentValueSchema),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});
export type ClinicalAssessmentInput = z.infer<
  typeof clinicalAssessmentInputSchema
>;

export const therapeuticGoalInputSchema = z.object({
  patientId: z.uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  baselineValue: z.number().optional(),
  targetValue: z.number().optional(),
  unit: z.string().trim().max(30).optional().or(z.literal("")),
  targetDate: z.iso.date().optional().or(z.literal("")),
});
export type TherapeuticGoalInput = z.infer<typeof therapeuticGoalInputSchema>;
export const therapeuticGoalStatusSchema = z.enum([
  "active",
  "achieved",
  "cancelled",
]);
export type TherapeuticGoalStatus = z.infer<typeof therapeuticGoalStatusSchema>;

export const clinicalMeasurementInputSchema = z.object({
  patientId: z.uuid(),
  goalId: z.uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  value: z.number(),
  unit: z.string().trim().min(1).max(30),
  measuredAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type ClinicalMeasurementInput = z.infer<
  typeof clinicalMeasurementInputSchema
>;

export const treatmentClosureInputSchema = z.object({
  patientId: z.uuid(),
  kind: z.enum(["discharge", "referral", "abandonment"]),
  summary: z.string().trim().min(10).max(5000),
  recommendations: z.string().trim().max(3000).optional().or(z.literal("")),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type TreatmentClosureInput = z.infer<typeof treatmentClosureInputSchema>;

export const clinicalAttachmentInputSchema = z.object({
  patientId: z.uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
  contentBase64: z.string().min(4).max(7_000_000),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type ClinicalAttachmentInput = z.infer<
  typeof clinicalAttachmentInputSchema
>;

export const clinicalAddendumInputSchema = z.object({
  clinicalRecordId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
  content: z.string().trim().min(10).max(5000),
});
export type ClinicalAddendumInput = z.infer<typeof clinicalAddendumInputSchema>;

export const planKindSchema = z.enum([
  "single",
  "fixed_package",
  "recurring",
  "custom",
]);
export const planStatusSchema = z.enum([
  "active",
  "paused",
  "expired",
  "cancelled",
]);
export const planTransitionSchema = z.enum(["active", "paused", "cancelled"]);
export type PlanStatus = z.infer<typeof planStatusSchema>;
const planTermsSchema = z.object({
  name: z.string().trim().min(3).max(120),
  totalSessions: z.number().int().min(1).max(1000),
  validFrom: z.iso.date(),
  validUntil: z.iso.date().optional().or(z.literal("")),
  totalValueInCents: z.number().int().min(0),
  installments: z.number().int().min(1).max(36),
  firstDueDate: z.iso.date(),
  autoRenew: z.boolean().optional(),
});
type PlanTerms = z.infer<typeof planTermsSchema>;
const validPlanPeriod = (value: PlanTerms) =>
  !value.validUntil || value.validUntil >= value.validFrom;
const renewablePlanPeriod = (value: PlanTerms) =>
  !value.autoRenew || Boolean(value.validUntil);
const planPeriodIssue = {
  message: "A validade final deve ser posterior à inicial.",
  path: ["validUntil"],
};
const autoRenewIssue = {
  message: "A renovação automática exige o fim da validade.",
  path: ["autoRenew"],
};

export const patientPlanInputSchema = planTermsSchema
  .extend({
    patientId: z.uuid(),
    serviceId: z.uuid(),
    kind: planKindSchema,
  })
  .refine(validPlanPeriod, planPeriodIssue)
  .refine(renewablePlanPeriod, autoRenewIssue);
export type PatientPlanInput = z.infer<typeof patientPlanInputSchema>;

export const planRenewalInputSchema = planTermsSchema
  .refine(validPlanPeriod, planPeriodIssue)
  .refine(renewablePlanPeriod, autoRenewIssue);
export type PlanRenewalInput = z.infer<typeof planRenewalInputSchema>;

export const planAutoRenewInputSchema = z.object({ autoRenew: z.boolean() });

/** Plano criado no cadastro guiado: termos de `patientPlanInputSchema`, sem `patientId`. */
const guidedPlanTermsSchema = planTermsSchema.extend({ serviceId: z.uuid() });
/**
 * `POST /patients/guided`: cria o cliente já com o próximo passo, tudo ou nada.
 * - `none`: só o cadastro (igual a `POST /patients`);
 * - `demonstration`: atendimento experimental (`visitType: "trial"`) com serviço, profissional,
 *   sala e data/hora (mesmas regras de feriado e conflito da agenda);
 * - `plan`: plano `recurring` ou `fixed_package` e, opcionalmente, matrícula na turma `groupId`
 *   (precisa ser do mesmo serviço do plano; turma cheia = lista de espera);
 * - `single`: serviço avulso (plano `single`).
 */
export const guidedPatientInputSchema = z.discriminatedUnion("next", [
  z.object({ next: z.literal("none"), patient: patientInputSchema }),
  z.object({
    next: z.literal("demonstration"),
    patient: patientInputSchema,
    appointment: leadAppointmentInputSchema.omit({ visitType: true }),
  }),
  z.object({
    next: z.literal("plan"),
    patient: patientInputSchema,
    plan: guidedPlanTermsSchema
      .extend({ kind: z.enum(["recurring", "fixed_package"]) })
      .refine(validPlanPeriod, planPeriodIssue)
      .refine(renewablePlanPeriod, autoRenewIssue),
    groupId: z
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
  }),
  z.object({
    next: z.literal("single"),
    patient: patientInputSchema,
    plan: guidedPlanTermsSchema
      .refine(validPlanPeriod, planPeriodIssue)
      .refine(renewablePlanPeriod, autoRenewIssue),
  }),
]);
export type GuidedPatientInput = z.infer<typeof guidedPatientInputSchema>;
export type GuidedPatientNext = GuidedPatientInput["next"];
/** Resposta de `POST /patients/guided` (só os registros criados pelo passo escolhido). */
export interface GuidedPatientResult {
  patient: Patient;
  appointment?: Appointment;
  plan?: PatientPlan;
  /** `status: "waitlisted"` quando a turma estava cheia. */
  enrollment?: GroupEnrollment;
}

/**
 * Query de `GET /patients`: `search` e `withoutGroup=true` (assinantes sem turma vinculada:
 * plano ativo que não é avulso e sem matrícula ativa em turma do serviço desse plano).
 */
export const patientListQuerySchema = z.object({
  search: z.preprocess(emptyQueryToUndefined, z.string().trim().max(160).optional()),
  withoutGroup: queryBoolean,
});
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

function addDaysToIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
}

function addMonthsToIsoDate(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, month! - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year!, month! - 1 + months, Math.min(day!, lastDay)))
    .toISOString()
    .slice(0, 10);
}

/**
 * Período seguinte de um plano com fim de validade: começa no dia seguinte ao fim
 * e repete a duração. Períodos de meses inteiros (ex.: 01/03–31/05) seguem por
 * meses; os demais repetem a mesma quantidade de dias. O primeiro vencimento
 * mantém a mesma distância do início do período.
 */
export function nextPlanPeriod(plan: {
  validFrom: string;
  validUntil?: string | undefined;
  firstDueDate: string;
}): { validFrom: string; validUntil: string; firstDueDate: string } | null {
  if (!plan.validUntil) return null;
  const validFrom = addDaysToIsoDate(plan.validUntil, 1);
  for (let months = 1; months <= 120; months += 1) {
    const end = addDaysToIsoDate(addMonthsToIsoDate(plan.validFrom, months), -1);
    if (end > plan.validUntil) break;
    if (end === plan.validUntil) {
      return {
        validFrom,
        validUntil: addDaysToIsoDate(addMonthsToIsoDate(validFrom, months), -1),
        firstDueDate: addMonthsToIsoDate(plan.firstDueDate, months),
      };
    }
  }
  const days =
    (Date.parse(plan.validUntil) - Date.parse(plan.validFrom)) / 86_400_000 + 1;
  return {
    validFrom,
    validUntil: addDaysToIsoDate(validFrom, days - 1),
    firstDueDate: addDaysToIsoDate(plan.firstDueDate, days),
  };
}

/**
 * Parcelas de um plano: uma por mês a partir do primeiro vencimento (dia
 * limitado ao fim do mês), com o resto da divisão nos primeiros centavos.
 */
export function planInstallmentSchedule(plan: {
  totalValueInCents: number;
  installments: number;
  firstDueDate: string;
}): { installmentNumber: number; dueDate: string; amountInCents: number }[] {
  const baseAmount = Math.floor(plan.totalValueInCents / plan.installments);
  const remainder = plan.totalValueInCents % plan.installments;
  return Array.from({ length: plan.installments }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addMonthsToIsoDate(plan.firstDueDate, index),
    amountInCents: baseAmount + (index < remainder ? 1 : 0),
  }));
}

export const receivableStatusSchema = z.enum(["open", "paid", "cancelled"]);
export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;
export const paymentMethodSchema = z.enum([
  "pix",
  "card",
  "cash",
  "bank_transfer",
  "boleto",
  "other",
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const paymentInputSchema = z.object({
  paymentMethod: paymentMethodSchema.default("pix"),
});
export const patientTabCloseInputSchema = z
  .object({
    settlement: z.enum(["paid", "receivable"]),
    paymentMethod: paymentMethodSchema.optional(),
    dueDate: z.iso.date(),
  })
  .refine(
    (value) => value.settlement !== "paid" || Boolean(value.paymentMethod),
    { message: "Informe a forma de pagamento.", path: ["paymentMethod"] },
  );
export type PatientTabCloseInput = z.infer<typeof patientTabCloseInputSchema>;
export const receivableAdjustmentInputSchema = z.object({
  amountInCents: z.number().int().min(0),
  reason: z.string().trim().min(5).max(500),
});
export const receivableRenegotiationInputSchema = z.object({
  receivableIds: z.array(z.uuid()).min(1).max(36),
  totalAmountInCents: z.number().int().min(0),
  installments: z.number().int().min(1).max(36),
  firstDueDate: z.iso.date(),
  reason: z.string().trim().min(5).max(500),
});
export type ReceivableRenegotiationInput = z.infer<
  typeof receivableRenegotiationInputSchema
>;
export const commissionRuleInputSchema = z.object({
  professionalId: z.uuid(),
  percentage: z.number().min(0).max(100),
  effectiveFrom: z.iso.date(),
});
export type CommissionRuleInput = z.infer<typeof commissionRuleInputSchema>;
/** Liga o usuário a um profissional da agenda; `null` desliga. Ligar outro troca a ligação. */
export const adminUserProfessionalInputSchema = z.object({
  professionalId: z.uuid().nullable(),
});
export type AdminUserProfessionalInput = z.infer<
  typeof adminUserProfessionalInputSchema
>;
export const commissionGenerationInputSchema = z.object({
  competence: z.string().regex(/^\d{4}-\d{2}$/),
});
export const financialCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["income", "expense"]),
});
export type FinancialCategoryInput = z.infer<
  typeof financialCategoryInputSchema
>;
export const costCenterInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export type CostCenterInput = z.infer<typeof costCenterInputSchema>;
export const payableInputSchema = z.object({
  description: z.string().trim().min(3).max(200),
  supplier: z.string().trim().max(160).optional().or(z.literal("")),
  categoryId: z.uuid(),
  costCenterId: z.uuid(),
  dueDate: z.iso.date(),
  amountInCents: z.number().int().min(1),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type PayableInput = z.infer<typeof payableInputSchema>;

/** Competência mensal no formato AAAA-MM. */
export const competenceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês no formato AAAA-MM.");
export const recurringPayableInputSchema = z
  .object({
    description: z.string().trim().min(3).max(200),
    supplier: z.string().trim().max(160).optional().or(z.literal("")),
    categoryId: z.uuid(),
    costCenterId: z.uuid(),
    amountInCents: z.number().int().min(1),
    dayOfMonth: z.number().int().min(1).max(28),
    startMonth: competenceMonthSchema,
    endMonth: competenceMonthSchema.optional(),
    active: z.boolean().default(true),
  })
  .refine((value) => !value.endMonth || value.endMonth >= value.startMonth, {
    message: "O mês final não pode ser anterior ao mês inicial.",
    path: ["endMonth"],
  });
export type RecurringPayableInput = z.infer<typeof recurringPayableInputSchema>;

function nextCompetence(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, value!, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Competências (AAAA-MM) que uma despesa fixa deve ter até `currentMonth`,
 * inclusive: do mês inicial — ou do mês da reativação, se foi pausada — até o
 * menor entre o mês final e o mês atual. Pausada, não tem nenhuma.
 */
export function recurringPayableCompetences(
  model: {
    startMonth: string;
    endMonth?: string | undefined;
    resumedFromMonth?: string | undefined;
    active: boolean;
  },
  currentMonth: string,
): string[] {
  if (!model.active) return [];
  const from =
    model.resumedFromMonth && model.resumedFromMonth > model.startMonth
      ? model.resumedFromMonth
      : model.startMonth;
  const until =
    model.endMonth && model.endMonth < currentMonth ? model.endMonth : currentMonth;
  const months: string[] = [];
  for (let month = from; month <= until && months.length < 1200; month = nextCompetence(month))
    months.push(month);
  return months;
}

/** Vencimento de uma competência: o dia fixo (1 a 28) dentro do mês. */
export function recurringPayableDueDate(competence: string, dayOfMonth: number): string {
  return `${competence}-${String(dayOfMonth).padStart(2, "0")}`;
}

export const leadStageSchema = z.enum([
  "new_contact",
  "contacted",
  "evaluation",
  "proposal",
  "won",
  "lost",
]);
export type LeadStage = z.infer<typeof leadStageSchema>;
export const leadInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  phone: phoneSchema,
  email: z.email().optional().or(z.literal("")),
  source: z.string().trim().min(2).max(80),
  interest: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  responsibleUserId: z.uuid().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type LeadInput = z.infer<typeof leadInputSchema>;
export const leadMoveSchema = z
  .object({
    stage: leadStageSchema,
    lostReason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.stage !== "lost" || Boolean(value.lostReason), {
    message: "Informe o motivo da perda.",
    path: ["lostReason"],
  });

export const leadContactChannelSchema = z.enum([
  "phone",
  "whatsapp",
  "email",
  "in_person",
  "note",
]);
export type LeadContactChannel = z.infer<typeof leadContactChannelSchema>;
export const leadContactInputSchema = z.object({
  channel: leadContactChannelSchema,
  direction: z.enum(["inbound", "outbound", "internal"]),
  notes: z.string().trim().min(2).max(2000),
  occurredAt: z.iso.datetime().optional(),
});
export type LeadContactInput = z.infer<typeof leadContactInputSchema>;
export const leadTaskStatusSchema = z.enum(["open", "completed", "cancelled"]);
export type LeadTaskStatus = z.infer<typeof leadTaskStatusSchema>;
export const leadTaskInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  dueAt: z.iso.datetime(),
  assignedUserId: z.uuid().optional().or(z.literal("")),
});
export type LeadTaskInput = z.infer<typeof leadTaskInputSchema>;

export const communicationChannelSchema = z.enum(["whatsapp", "email"]);
export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;
export const communicationKindSchema = z.enum([
  "appointment_reminder",
  "payment_reminder",
  "manual",
]);
export type CommunicationKind = z.infer<typeof communicationKindSchema>;
export const communicationPreferenceInputSchema = z.object({
  patientId: z.uuid(),
  channel: communicationChannelSchema,
  allowed: z.boolean(),
});
export type CommunicationPreferenceInput = z.infer<
  typeof communicationPreferenceInputSchema
>;
export const manualMessageInputSchema = z.object({
  patientId: z.uuid(),
  channel: communicationChannelSchema,
  body: z.string().trim().min(1).max(500),
  scheduledFor: z.iso.datetime().optional(),
});
export type ManualMessageInput = z.infer<typeof manualMessageInputSchema>;
export const reminderGenerationInputSchema = z.object({
  referenceDate: z.iso.date(),
});
/**
 * Comunicado segmentado. Segmento vazio = todos os clientes. Etiquetas: basta
 * uma das informadas. `activePlan` ausente = com ou sem plano ativo.
 * `birthdayMonth` = aniversariantes do mês corrente da clínica.
 */
export const broadcastSegmentSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  status: z.preprocess(emptyQueryToUndefined, patientStatusSchema.optional()),
  activePlan: z.preprocess(emptyQueryToUndefined, z.boolean().optional()),
  birthdayMonth: z.boolean().default(false),
});
export type BroadcastSegment = z.infer<typeof broadcastSegmentSchema>;
export const broadcastInputSchema = z.object({
  segment: broadcastSegmentSchema.default({ tags: [], birthdayMonth: false }),
  channel: communicationChannelSchema,
  /** Texto com `{{nome}}` (primeiro nome do cliente). */
  body: z.string().trim().min(1).max(500),
});
export type BroadcastInput = z.infer<typeof broadcastInputSchema>;
export const broadcastSkipReasons = [
  "opt_out",
  "no_destination",
  "message_too_long",
] as const;
export type BroadcastSkipReason = (typeof broadcastSkipReasons)[number];
export const broadcastSkipReasonLabels: Record<BroadcastSkipReason, string> = {
  opt_out: "Não autorizou mensagens neste canal",
  no_destination: "Sem contato cadastrado para o canal",
  message_too_long: "Mensagem passa de 500 caracteres com o nome",
};

export const documentKindSchema = z.enum([
  "contract",
  "attendance_declaration",
  "consent",
  "other",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const documentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  kind: documentKindSchema,
  body: z.string().trim().min(20).max(20_000),
});
export type DocumentTemplateInput = z.infer<typeof documentTemplateInputSchema>;
export const documentTemplateVersionInputSchema = z.object({
  body: z.string().trim().min(20).max(20_000),
});
export const issuedDocumentInputSchema = z.object({
  templateId: z.uuid(),
  patientId: z.uuid(),
  planId: z.uuid().optional(),
  professionalId: z.uuid().optional(),
  title: z.string().trim().min(3).max(160),
});
export type IssuedDocumentInput = z.infer<typeof issuedDocumentInputSchema>;
export const documentStatusSchema = z.enum(["draft", "issued", "cancelled"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export const documentTransitionSchema = z.enum(["issued", "cancelled"]);

export const managementReportFilterSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "A data inicial deve ser anterior à data final.",
    path: ["from"],
  });
export type ManagementReportFilter = z.infer<
  typeof managementReportFilterSchema
>;

export const salesReportFilterSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export type SalesReportFilter = z.infer<typeof salesReportFilterSchema>;

export interface SaleMovement {
  id: string;
  sourceId: string;
  sourceType: "plan" | "product";
  kind: "sale" | "cancellation";
  occurredAt: string;
  patientId: string;
  patientName: string;
  itemName: string;
  quantity: number;
  amountInCents: number;
  receivableId?: string;
}

export interface ReceivedPayment {
  id: string;
  receivableId: string;
  kind: "payment" | "reversal";
  sourceId?: string;
  occurredAt: string;
  patientId: string;
  patientName: string;
  description: string;
  amountInCents: number;
  paymentMethod?: PaymentMethod;
}

export interface PatientWithoutReturn {
  patientId: string;
  patientName: string;
  lastCompletedAt: string;
  nextAppointmentAt?: string;
}

export interface SalesReportPeriod {
  from: string;
  to: string;
  grossSalesInCents: number;
  cancelledSalesInCents: number;
  netSalesInCents: number;
  receivedInCents: number;
  attendedPatients: number;
}

export interface SalesReport {
  month: string;
  generatedAt: string;
  current: SalesReportPeriod;
  previousComparable: SalesReportPeriod;
  changeInCents: number;
  changePercent: number | null;
  sales: SaleMovement[];
  payments: ReceivedPayment[];
  patientsWithoutReturn: PatientWithoutReturn[];
}

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  jobTitle?: string;
  /** Módulos efetivos (já resolvidos com `effectiveModules`). */
  modules: AppModule[];
  /** Módulos com edição efetiva (`effectiveEditModules`; sempre subconjunto de `modules`). */
  editModules: AppModule[];
}

export interface AdminUser extends UserSummary {
  clinicId: string;
  /** `true` quando há módulos ou edição gravados para o usuário comum (admin: sempre `false`). */
  customModules: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Profissional da agenda ligado ao usuário (`professionals.user_id`). */
  professionalId?: string;
  professionalName?: string;
  /**
   * Percentual da regra de comissão do próprio usuário vigente hoje (fuso da clínica); não
   * depende do profissional ligado. Regras só do profissional (Financeiro) não aparecem aqui.
   */
  commissionPercentage?: number;
  /** Início de vigência (aaaa-mm-dd) da regra vigente hoje. */
  commissionEffectiveFrom?: string;
}

export interface ClinicSettings extends ClinicSettingsInput {
  id: string;
  updatedAt: string;
}

export interface AdminAuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PermissionMatrixItem {
  role: UserRole;
  /** Rótulos (pt-BR) dos módulos que o tipo vê por padrão (usuário comum novo: nenhum). */
  modules: string[];
  /** Rótulos (pt-BR) dos módulos que o tipo edita por padrão (subconjunto de `modules`). */
  editModules: string[];
}

export interface Patient extends PatientInput {
  id: string;
  clinicId: string;
  recordNumber: string;
  status: PatientStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cliente na lista mínima de apoio (`GET /patients/options`): só o que Agenda, Comunicações,
 * Contratos e Turmas precisam para escolher o cliente (nome) e filtrar comunicados (etiquetas),
 * sem os dados cadastrais (telefone, CPF, endereço…), que ficam no módulo Clientes.
 */
export interface PatientOption {
  id: string;
  fullName: string;
  tags: string[];
}

export interface Professional extends ProfessionalInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Room extends RoomInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Service extends ServiceInput {
  id: string;
  clinicId: string;
  active: boolean;
}

/**
 * Atendimento da agenda. É de um cliente (`patientId`) ou de um lead ainda não
 * convertido (`leadId`), nunca dos dois. Em atendimento de lead, `patientName`
 * repete o nome do lead (`leadName`) para a agenda exibir o nome sem ramificar.
 */
export interface Appointment extends Omit<AppointmentInput, "patientId"> {
  id: string;
  clinicId: string;
  patientId?: string;
  leadId?: string;
  leadName?: string;
  endsAt: string;
  status: AppointmentStatus;
  patientName: string;
  professionalName: string;
  professionalColor: string;
  roomName: string;
  serviceName: string;
  createdAt: string;
  updatedAt: string;
  seriesId?: string;
}

export interface AppointmentRescheduleEvent {
  id: string;
  appointmentId: string;
  previousStartsAt: string;
  previousEndsAt: string;
  previousProfessionalId: string;
  previousProfessionalName: string;
  previousRoomId: string;
  previousRoomName: string;
  startsAt: string;
  endsAt: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  actorName: string;
  createdAt: string;
}

export interface ScheduleBlock extends ScheduleBlockInput {
  id: string;
  clinicId: string;
  professionalName?: string;
  roomName?: string;
  status: "active" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface GroupClass extends GroupClassInput {
  id: string;
  clinicId: string;
  name: string;
  sequence: number;
  serviceName: string;
  professionalName: string;
  roomName: string;
  activeEnrollments: number;
  waitlistCount: number;
  active: boolean;
  createdAt: string;
}

export interface GroupEnrollment extends GroupEnrollmentInput {
  id: string;
  clinicId: string;
  patientName: string;
  status: "active" | "waitlisted" | "cancelled";
  queuePosition?: number;
  enrolledAt: string;
  updatedAt: string;
}

export interface GroupSession {
  id: string;
  clinicId: string;
  groupId: string;
  groupName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "completed" | "cancelled";
  attendanceCount: number;
  createdAt: string;
}

export interface GroupAttendance {
  id: string;
  clinicId: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  status: "present" | "absent" | "excused_absence" | "replacement";
  notes?: string;
  recordedAt: string;
}

export interface ReplacementCredit {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  sourceSessionId: string;
  status: "available" | "used" | "cancelled";
  usedSessionId?: string;
  createdAt: string;
  usedAt?: string;
}

export interface GroupWorkspace {
  groups: GroupClass[];
  enrollments: GroupEnrollment[];
  sessions: GroupSession[];
  attendance: GroupAttendance[];
  replacementCredits: ReplacementCredit[];
}

export interface Product extends Omit<ProductInput, "initialStock"> {
  id: string;
  clinicId: string;
  currentStock: number;
  lowStock: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  clinicId: string;
  productId: string;
  productName: string;
  kind:
    | "initial_stock"
    | "purchase"
    | "adjustment_in"
    | "adjustment_out"
    | "loss"
    | "sale"
    | "sale_reversal";
  quantity: number;
  balanceAfter: number;
  notes: string;
  patientTabId?: string;
  createdAt: string;
}

export interface PatientTabItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceInCents: number;
  unitCostInCents: number;
  totalInCents: number;
}

export interface PatientTab extends PatientTabInput {
  id: string;
  clinicId: string;
  patientName: string;
  status: "open" | "closed" | "cancelled";
  paymentStatus: "pending" | "paid" | "receivable" | "cancelled";
  totalInCents: number;
  items: PatientTabItem[];
  receivableId?: string;
  openedAt: string;
  closedAt?: string;
  cancelledAt?: string;
}

export interface InventoryWorkspace {
  products: Product[];
  movements: StockMovement[];
  tabs: PatientTab[];
  lowStockCount: number;
  inventoryCostInCents: number;
  openTabsInCents: number;
}

export interface DashboardSummary {
  date: string;
  appointmentsToday: number;
  completedToday: number;
  patientsActive: number;
  noShowsThisMonth: number;
  nextAppointments: Appointment[];
}

export interface ClinicalRecord extends ClinicalRecordInput {
  id: string;
  clinicId: string;
  patientId: string;
  professionalId: string;
  status: ClinicalRecordStatus;
  version: number;
  authorName: string;
  patientName: string;
  professionalName: string;
  professionalCrefito: string;
  appointmentStartsAt: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalRecordRevision {
  id: string;
  clinicalRecordId: string;
  version: number;
  status: ClinicalRecordStatus;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  painScale?: number;
  authorName: string;
  createdAt: string;
}

export interface AssessmentTemplate extends AssessmentTemplateInput {
  id: string;
  clinicId: string;
  version: number;
  active: boolean;
  createdAt: string;
}

export interface ClinicalAssessment extends ClinicalAssessmentInput {
  id: string;
  clinicId: string;
  templateName: string;
  authorName: string;
  createdAt: string;
}

export interface TherapeuticGoal extends TherapeuticGoalInput {
  id: string;
  clinicId: string;
  status: TherapeuticGoalStatus;
  achievedAt?: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalMeasurement extends ClinicalMeasurementInput {
  id: string;
  clinicId: string;
  authorName: string;
  createdAt: string;
}

export interface TreatmentClosure extends TreatmentClosureInput {
  id: string;
  clinicId: string;
  authorName: string;
  createdAt: string;
}

export interface ClinicalAttachment extends Omit<
  ClinicalAttachmentInput,
  "contentBase64"
> {
  id: string;
  clinicId: string;
  sha256: string;
  authorName: string;
  createdAt: string;
}

export interface ClinicalAttachmentContent extends ClinicalAttachment {
  contentBase64: string;
}

export interface ClinicalAddendum extends ClinicalAddendumInput {
  id: string;
  clinicId: string;
  patientId: string;
  authorName: string;
  createdAt: string;
}

export interface ClinicalAccessEvent {
  id: string;
  clinicId: string;
  patientId: string;
  actorUserId: string;
  action: "read" | "export" | "upload" | "download" | "addendum";
  entityType: "workspace" | "attachment" | "clinical_record";
  entityId?: string;
  createdAt: string;
}

export interface ClinicalWorkspace {
  patient: Patient;
  records: ClinicalRecord[];
  templates: AssessmentTemplate[];
  assessments: ClinicalAssessment[];
  goals: TherapeuticGoal[];
  measurements: ClinicalMeasurement[];
  closures: TreatmentClosure[];
  attachments: ClinicalAttachment[];
  addenda: ClinicalAddendum[];
}

export interface PatientPlan extends PatientPlanInput {
  id: string;
  clinicId: string;
  patientName: string;
  serviceName: string;
  status: PlanStatus;
  remainingSessions: number;
  autoRenew: boolean;
  renewedFromPlanId?: string;
  renewedByPlanId?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledValueInCents?: number;
}

export interface SessionMovement {
  id: string;
  planId: string;
  appointmentId?: string;
  kind: "credit" | "consumption" | "reversal" | "adjustment";
  quantity: number;
  reason: string;
  createdAt: string;
}

export interface Receivable {
  id: string;
  clinicId: string;
  patientId: string;
  planId?: string;
  patientName: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amountInCents: number;
  status: ReceivableStatus;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  paymentMethod?: PaymentMethod;
}

export interface FinancialSummary {
  openInCents: number;
  overdueInCents: number;
  paidThisMonthInCents: number;
  receivables: Receivable[];
}

export interface FinancialCategory extends FinancialCategoryInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface CostCenter extends CostCenterInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Payable extends PayableInput {
  id: string;
  clinicId: string;
  categoryName: string;
  costCenterName: string;
  status: "open" | "paid" | "cancelled";
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  /** Despesa fixa que gerou esta conta, com a competência (AAAA-MM). */
  recurringPayableId?: string;
  competence?: string;
}

export interface RecurringPayable {
  id: string;
  clinicId: string;
  description: string;
  supplier?: string;
  categoryId: string;
  costCenterId: string;
  categoryName: string;
  costCenterName: string;
  amountInCents: number;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string;
  active: boolean;
  /** Mês da última reativação: competências pausadas antes dele não são geradas. */
  resumedFromMonth?: string;
  /** Última competência já gerada como conta a pagar. */
  lastCompetence?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialWorkspace {
  summary: FinancialSummary;
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  payables: Payable[];
  payableOpenInCents: number;
  payableOverdueInCents: number;
  paidExpensesThisMonthInCents: number;
  cashBalanceThisMonthInCents: number;
  commissionRules: CommissionRule[];
  commissions: CommissionEntry[];
  commissionOpenInCents: number;
  paidCommissionsThisMonthInCents: number;
}

export interface ReceivableRenegotiation {
  id: string;
  clinicId: string;
  patientId: string;
  originalAmountInCents: number;
  renegotiatedAmountInCents: number;
  reason: string;
  originalReceivableIds: string[];
  newReceivables: Receivable[];
  createdAt: string;
}

export interface CommissionRule extends CommissionRuleInput {
  id: string;
  clinicId: string;
  professionalName: string;
  active: boolean;
  createdAt: string;
}

export interface CommissionEntry {
  id: string;
  clinicId: string;
  professionalId: string;
  professionalName: string;
  appointmentId: string;
  competence: string;
  baseAmountInCents: number;
  percentage: number;
  amountInCents: number;
  status: "open" | "paid";
  paidAt?: string;
  createdAt: string;
}

// Caixa do dia (`GET /finance/daily-cash?date=`)

export const dailyCashFilterSchema = z.object({
  date: z.iso.date("Informe uma data válida.").optional(),
});
export type DailyCashFilter = z.infer<typeof dailyCashFilterSchema>;

/**
 * Forma de pagamento do caixa. `unspecified` agrupa o que não tem forma
 * registrada (comissões pagas e estornos sem pagamento de origem).
 */
export type DailyCashPaymentMethod = PaymentMethod | "unspecified";

export type DailyCashMovementKind =
  | "receipt"
  | "receipt_reversal"
  | "payable"
  | "commission";

export interface DailyCashMovement {
  /** `<kind>:<id da origem>`. */
  id: string;
  kind: DailyCashMovementKind;
  direction: "in" | "out";
  /** ISO 8601 do evento (pagamento, estorno ou baixa). */
  occurredAt: string;
  description: string;
  /** Cliente, fornecedor ou profissional. */
  counterpart?: string;
  paymentMethod: DailyCashPaymentMethod;
  /**
   * Valor com sinal dentro da sua direção: entradas positivas e estornos
   * negativos; saídas positivas (valor pago).
   */
  amountInCents: number;
}

export interface DailyCashMethodTotal {
  paymentMethod: DailyCashPaymentMethod;
  inflowInCents: number;
  outflowInCents: number;
  balanceInCents: number;
}

export interface DailyCash {
  /** Data (aaaa-mm-dd) no fuso da clínica. */
  date: string;
  generatedAt: string;
  /** Só as formas com movimento, na ordem de `paymentMethodSchema` + `unspecified`. */
  byPaymentMethod: DailyCashMethodTotal[];
  totalInflowInCents: number;
  totalOutflowInCents: number;
  balanceInCents: number;
  /** Movimentos em ordem cronológica. */
  movements: DailyCashMovement[];
}

// Previsão financeira (`GET /finance/forecast?months=`)

export const financeForecastFilterSchema = z.object({
  months: z.coerce
    .number("Informe a quantidade de meses.")
    .int("Informe a quantidade de meses.")
    .min(1, "A previsão vai de 1 a 12 meses.")
    .max(12, "A previsão vai de 1 a 12 meses.")
    .default(6),
});
export type FinanceForecastFilter = z.infer<typeof financeForecastFilterSchema>;

/** Entradas, saídas e saldo (entradas − saídas), em centavos. */
export interface FinanceForecastFlow {
  inflowInCents: number;
  outflowInCents: number;
  balanceInCents: number;
}

export interface FinanceForecastMonth {
  /** Mês (AAAA-MM). */
  month: string;
  /** Parcelas a receber e contas a pagar já lançadas e em aberto, pelo vencimento. */
  confirmed: FinanceForecastFlow;
  /**
   * Ainda não lançado: parcelas das renovações automáticas futuras e
   * competências futuras das despesas fixas.
   */
  projected: FinanceForecastFlow;
  /** Saldo confirmado + projetado do mês. */
  balanceInCents: number;
}

export interface FinanceForecast {
  generatedAt: string;
  /** Primeiro mês (o atual, no fuso da clínica) e último mês do horizonte. */
  startMonth: string;
  endMonth: string;
  months: FinanceForecastMonth[];
  /**
   * Em atraso: parcelas e contas em aberto com vencimento antes do primeiro
   * mês. Ficam fora dos meses e dos totais.
   */
  overdue: FinanceForecastFlow;
  /** Soma dos meses do horizonte. */
  totals: {
    confirmed: FinanceForecastFlow;
    projected: FinanceForecastFlow;
    balanceInCents: number;
  };
}

/**
 * Query de `GET /reports/retention`. Parâmetros vazios contam como ausentes:
 * `to` ausente = hoje (fuso da clínica); `from` ausente = 1º dia do mês cinco
 * meses antes do mês de `to` (seis meses no total).
 */
export const retentionReportFilterSchema = z
  .object({
    from: z.preprocess(
      emptyQueryToUndefined,
      z.iso.date("Informe uma data válida.").optional(),
    ),
    to: z.preprocess(
      emptyQueryToUndefined,
      z.iso.date("Informe uma data válida.").optional(),
    ),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "A data inicial deve ser anterior à data final.",
    path: ["from"],
  });
export type RetentionReportFilter = z.infer<typeof retentionReportFilterSchema>;

/** Retenção de clientes num mês. Atendimentos de lead ficam de fora. */
export interface RetentionMonth {
  /** Mês (AAAA-MM). */
  month: string;
  /** Clientes com atendimento concluído no mês ou plano vigente em algum dia do mês. */
  activeClients: number;
  /** Clientes cuja primeira atividade (atendimento concluído ou plano) caiu no mês. */
  newClients: number;
  /** Ativos no mês anterior que não estão ativos no mês. */
  lostClients: number;
  /**
   * (ativos do mês anterior − perdidos) ÷ ativos do mês anterior, entre 0 e 1;
   * `null` quando o mês anterior não teve ativos.
   */
  retentionRate: number | null;
  /** Planos cancelados no mês (pela data do cancelamento). */
  cancelledPlans: number;
  /** Soma do valor em aberto cancelado junto com esses planos. */
  cancelledValueInCents: number;
}

export interface RetentionReport {
  generatedAt: string;
  /** Período pedido (aaaa-mm-dd), já com os padrões aplicados. */
  from: string;
  to: string;
  /** Mês de `from` e mês de `to` limitado ao mês atual da clínica. */
  startMonth: string;
  endMonth: string;
  months: RetentionMonth[];
  totals: {
    newClients: number;
    lostClients: number;
    cancelledPlans: number;
    cancelledValueInCents: number;
  };
}

/**
 * Query de `GET /reports/clients`, com os mesmos padrões da retenção: `to`
 * ausente = hoje (fuso da clínica); `from` ausente = 1º dia do mês cinco meses
 * antes do mês de `to`. Parâmetros vazios contam como ausentes.
 */
export const clientReportFilterSchema = retentionReportFilterSchema;
export type ClientReportFilter = RetentionReportFilter;

/** Faixas etárias do relatório de clientes (`unknown` = sem data de nascimento). */
export const clientAgeBandSchema = z.enum([
  "0-17",
  "18-29",
  "30-44",
  "45-59",
  "60+",
  "unknown",
]);
export type ClientAgeBand = z.infer<typeof clientAgeBandSchema>;
export const clientAgeBandLabels: Record<ClientAgeBand, string> = {
  "0-17": "0 a 17 anos",
  "18-29": "18 a 29 anos",
  "30-44": "30 a 44 anos",
  "45-59": "45 a 59 anos",
  "60+": "60 anos ou mais",
  unknown: "Sem data de nascimento",
};

export interface ClientSessionsRankingEntry {
  patientId: string;
  patientName: string;
  /** Atendimentos concluídos no período (data no fuso da clínica). */
  completedSessions: number;
}

export interface ClientRevenueRankingEntry {
  patientId: string;
  patientName: string;
  /** Pagamentos menos estornos no período (data do evento no fuso da clínica). */
  receivedInCents: number;
}

export interface ClientAgeBandCount {
  band: ClientAgeBand;
  label: string;
  clients: number;
}

export interface ClientReport {
  generatedAt: string;
  /** Período pedido (aaaa-mm-dd), já com os padrões aplicados. */
  from: string;
  to: string;
  /** Até 20 clientes com mais sessões concluídas no período. */
  topBySessions: ClientSessionsRankingEntry[];
  /** Até 20 clientes com mais recebimentos líquidos (positivos) no período. */
  topByRevenue: ClientRevenueRankingEntry[];
  /**
   * Clientes ativos no período (atendimento concluído ou plano vigente em
   * algum dia do período) por faixa etária, com a idade na data `to`.
   */
  activeClients: number;
  ageDistribution: ClientAgeBandCount[];
}

export interface PaymentReceipt {
  receiptNumber: string;
  patientName: string;
  description: string;
  amountInCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
}

export interface Lead extends LeadInput {
  id: string;
  clinicId: string;
  stage: LeadStage;
  lostReason?: string;
  convertedPatientId?: string;
  createdAt: string;
  updatedAt: string;
  responsibleName?: string;
  openTasks: number;
  overdueTasks: number;
  lastContactAt?: string;
}

export interface LeadConversion {
  lead: Lead;
  patient: Patient;
  reusedExisting: boolean;
}

export interface LeadContact extends LeadContactInput {
  id: string;
  clinicId: string;
  leadId: string;
  actorName: string;
  occurredAt: string;
  createdAt: string;
}

export interface LeadTask extends LeadTaskInput {
  id: string;
  clinicId: string;
  leadId: string;
  status: LeadTaskStatus;
  assignedUserName?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  contacts: LeadContact[];
  tasks: LeadTask[];
}

export interface CommunicationPreference extends CommunicationPreferenceInput {
  id: string;
  clinicId: string;
  updatedAt: string;
}

export interface OutboundMessage {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  channel: CommunicationChannel;
  kind: CommunicationKind;
  recipient: string;
  body: string;
  status: "queued" | "sent" | "failed" | "cancelled";
  scheduledFor: string;
  sentAt?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

export interface CommunicationCenter {
  deliveryMode: "outbox_only";
  preferences: CommunicationPreference[];
  messages: OutboundMessage[];
}

export interface ReminderGenerationResult {
  queued: number;
  skippedByPreference: number;
  alreadyQueued: number;
}

export interface BroadcastSkippedPatient {
  patientId: string;
  patientName: string;
  reason: BroadcastSkipReason;
}

/** Mensagem pronta para a fila (já com `{{nome}}` preenchido). */
export interface BroadcastMessageDraft {
  patientId: string;
  channel: CommunicationChannel;
  recipient: string;
  body: string;
}

export interface BroadcastResult {
  /** `true` na prévia: nada foi gravado. */
  preview: boolean;
  channel: CommunicationChannel;
  /** Clientes que caem no segmento. */
  matched: number;
  /** Enfileiradas (envio) ou que seriam enfileiradas (prévia). */
  queued: number;
  skipped: BroadcastSkippedPatient[];
  /** Texto do primeiro destinatário, para conferência. */
  sampleBody?: string;
}

export interface DocumentTemplate extends DocumentTemplateInput {
  id: string;
  clinicId: string;
  version: number;
  active: boolean;
  previousVersionId?: string;
  createdAt: string;
}

export interface IssuedDocument extends IssuedDocumentInput {
  id: string;
  clinicId: string;
  templateName: string;
  templateVersion: number;
  patientName: string;
  planName?: string;
  snapshotBody: string;
  status: DocumentStatus;
  issuedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentReportBreakdown {
  id: string;
  name: string;
  appointments: number;
  completed: number;
  noShows: number;
  attendanceRate: number;
}

export interface CommercialSourceBreakdown {
  source: string;
  leads: number;
  won: number;
  lost: number;
  conversionRate: number;
}

export interface ManagementReport {
  from: string;
  to: string;
  generatedAt: string;
  appointments: {
    total: number;
    completed: number;
    noShows: number;
    cancelled: number;
    attendanceRate: number;
    // Atendimentos do período (inclusive cancelados) por tipo.
    byVisitType: Record<AppointmentVisitType, number>;
  };
  // Experimentais e avaliações (visitType trial/evaluation) com início no período.
  trials: {
    // Não canceladas (agendadas, confirmadas, concluídas ou faltas).
    scheduled: number;
    // Com status concluído.
    completed: number;
    // Concluídas cujo cliente teve plano criado entre o início do atendimento
    // e 30 dias depois (contagem por atendimento).
    converted: number;
    // converted / completed em % inteiro; 0 sem concluídas.
    conversionRate: number;
  };
  plans: {
    active: number;
    availableSessions: number;
    consumedInPeriod: number;
  };
  finance: {
    openInCents: number;
    overdueInCents: number;
    paidInPeriodInCents: number;
  };
  commercial: {
    leadsCreated: number;
    won: number;
    lost: number;
    conversionRate: number;
    averageFirstResponseMinutes: number;
  };
  byProfessional: AppointmentReportBreakdown[];
  byService: AppointmentReportBreakdown[];
  bySource: CommercialSourceBreakdown[];
  profitability: {
    dre: {
      serviceRevenueInCents: number;
      productRevenueInCents: number;
      grossRevenueInCents: number;
      productCostInCents: number;
      grossProfitInCents: number;
      operatingExpensesInCents: number;
      commissionsInCents: number;
      netResultInCents: number;
      netMargin: number;
    };
    byService: Array<{
      id: string;
      name: string;
      completedAppointments: number;
      revenueInCents: number;
      commissionsInCents: number;
      contributionInCents: number;
      contributionMargin: number;
    }>;
    byProduct: Array<{
      id: string;
      name: string;
      unitsSold: number;
      revenueInCents: number;
      costInCents: number;
      grossProfitInCents: number;
      grossMargin: number;
    }>;
    operational: {
      groupOccupancyRate: number;
      activeGroupSeats: number;
      totalGroupCapacity: number;
      waitlistCount: number;
      lowStockCount: number;
      productUnitsSold: number;
      averageReceiptInCents: number;
    };
  };
}

// Central de relacionamento

export const contactReasonSchema = z.enum([
  "birthday",
  "single_no_return",
  "plan_expiring",
  "low_balance",
  "expired_with_balance",
  "treatment_paused",
  "repeated_no_show",
  "former_client",
  "overdue_payment",
  "nps_detractor",
]);
export type ContactReason = z.infer<typeof contactReasonSchema>;

export const contactOutcomeSchema = z.enum([
  "contacted",
  "no_answer",
  "scheduled",
  "not_interested",
  "snoozed",
  "dismissed",
]);
export type ContactOutcome = z.infer<typeof contactOutcomeSchema>;

const relationshipDaysSchema = z.number().int().min(1).max(3650);
const messageTemplateSchema = z
  .string()
  .trim()
  .min(1, "Informe a mensagem.")
  .max(1000);

export const relationshipSettingsSchema = z
  .object({
    birthdayDaysAhead: z.number().int().min(0).max(60),
    singleNoReturnDays: relationshipDaysSchema,
    planExpiringDays: relationshipDaysSchema,
    lowBalanceSessions: z.number().int().min(0).max(100),
    expiredWithBalanceDays: relationshipDaysSchema,
    treatmentPausedDays: relationshipDaysSchema,
    repeatedNoShowCount: z.number().int().min(1).max(50),
    repeatedNoShowWindowDays: relationshipDaysSchema,
    formerClientMinDays: z.number().int().min(0).max(3650),
    formerClientMaxDays: relationshipDaysSchema,
    messages: z.object({
      birthday: messageTemplateSchema,
      single_no_return: messageTemplateSchema,
      plan_expiring: messageTemplateSchema,
      low_balance: messageTemplateSchema,
      expired_with_balance: messageTemplateSchema,
      treatment_paused: messageTemplateSchema,
      repeated_no_show: messageTemplateSchema,
      former_client: messageTemplateSchema,
      overdue_payment: messageTemplateSchema,
      nps_detractor: messageTemplateSchema,
    }),
  })
  .refine((value) => value.formerClientMinDays <= value.formerClientMaxDays, {
    message: "O prazo mínimo deve ser menor ou igual ao máximo.",
    path: ["formerClientMaxDays"],
  });
export type RelationshipSettings = z.infer<typeof relationshipSettingsSchema>;

export const defaultRelationshipSettings: RelationshipSettings = {
  birthdayDaysAhead: 7,
  singleNoReturnDays: 60,
  planExpiringDays: 7,
  lowBalanceSessions: 2,
  expiredWithBalanceDays: 60,
  treatmentPausedDays: 30,
  repeatedNoShowCount: 2,
  repeatedNoShowWindowDays: 30,
  formerClientMinDays: 30,
  formerClientMaxDays: 90,
  messages: {
    birthday:
      "Olá, {{nome}}! Toda a equipe deseja um feliz aniversário, com muita saúde e movimento. Um abraço!",
    single_no_return:
      "Olá, {{nome}}! Tudo bem? Sentimos sua falta por aqui. Quer agendar um novo horário?",
    plan_expiring:
      "Olá, {{nome}}! Seu plano está chegando ao fim. Vamos conversar sobre a renovação para você seguir com os atendimentos?",
    low_balance:
      "Olá, {{nome}}! Restam poucas sessões no seu plano. Quer que a gente já prepare a renovação?",
    expired_with_balance:
      "Olá, {{nome}}! Seu plano venceu com sessões ainda disponíveis. Vamos conversar sobre como aproveitá-las?",
    treatment_paused:
      "Olá, {{nome}}! Faz um tempo desde o seu último atendimento. Como você está? Quer agendar um horário?",
    repeated_no_show:
      "Olá, {{nome}}! Notamos que você não conseguiu vir nos últimos atendimentos. Está tudo bem? Podemos ajustar seus horários.",
    former_client:
      "Olá, {{nome}}! Sentimos sua falta. Temos horários disponíveis e adoraríamos ter você de volta.",
    overdue_payment:
      "Olá, {{nome}}! Identificamos uma parcela em aberto. Podemos ajudar com a forma de pagamento?",
    nps_detractor:
      "Olá, {{nome}}! Obrigado pela sua avaliação. Queremos entender o que podemos melhorar. Podemos conversar?",
  },
};

/** Data de hoje (aaaa-mm-dd) no fuso da clínica (America/Sao_Paulo). */
export function saoPauloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const holidayInputSchema = z.object({
  date: z.iso.date("Informe uma data válida."),
  name: z.string().trim().min(2, "Informe o nome do feriado.").max(120),
});
export type HolidayInput = z.infer<typeof holidayInputSchema>;

/** Dia sem atendimento; `date` (aaaa-mm-dd) é a data no fuso da clínica. */
export interface Holiday extends HolidayInput {
  id: string;
  clinicId: string;
  createdAt: string;
}

// snoozeUntil é comparado com saoPauloToday() no momento da validação:
// precisa ser posterior a hoje no fuso da clínica.
export const contactActivityInputSchema = z
  .object({
    patientId: z.uuid(),
    reason: contactReasonSchema,
    referenceKey: z.string().trim().min(1).max(200),
    outcome: contactOutcomeSchema,
    notes: z.string().trim().max(2000).optional(),
    snoozeUntil: z.iso.date().optional(),
  })
  .refine(
    (value) =>
      value.outcome !== "snoozed" ||
      (value.snoozeUntil !== undefined && value.snoozeUntil > saoPauloToday()),
    {
      message: "Informe uma data futura para adiar o contato.",
      path: ["snoozeUntil"],
    },
  );
export type ContactActivityInput = z.infer<typeof contactActivityInputSchema>;

export interface ContactSuggestion {
  patientId: string;
  patientName: string;
  phone: string;
  whatsapp?: string | undefined;
  reason: ContactReason;
  referenceKey: string;
  /** Texto legível que explica a situação (ex.: "Plano termina em 3 dias"). */
  detail: string;
  dueDate?: string | undefined;
  /** Menor número = mais urgente. */
  priority: number;
}

export interface ContactActivity {
  id: string;
  clinicId: string;
  patientId: string;
  reason: ContactReason;
  referenceKey: string;
  outcome: ContactOutcome;
  notes?: string | undefined;
  snoozeUntil?: string | undefined;
  actorUserId: string;
  createdAt: string;
}

/** Aniversariante do mês (`GET /relationship/birthdays?month=aaaa-mm`). */
export interface BirthdayEntry {
  patientId: string;
  patientName: string;
  phone: string;
  whatsapp?: string | undefined;
  birthDate: string;
  /** Data do aniversário no ano do mês consultado (29/02 vira 28/02 em ano não bissexto). */
  date: string;
  day: number;
  /** Idade que o cliente completa nesse aniversário. */
  ageTurning: number;
  /** Chave de supressão da sugestão `birthday`: `<patientId>:<ano>`. */
  referenceKey: string;
  /** Já existe atividade `birthday`/`contacted` com a chave do ano. */
  congratulated: boolean;
}

export const birthdayMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês no formato AAAA-MM.");

/** Pesquisa de satisfação (NPS): nota 0–10, opcionalmente ligada a um atendimento concluído. */
export const satisfactionSurveyInputSchema = z.object({
  patientId: z.uuid(),
  appointmentId: z.uuid().optional(),
  score: z.number().int().min(0).max(10),
  comment: z.string().trim().max(1000).optional(),
});
export type SatisfactionSurveyInput = z.infer<
  typeof satisfactionSurveyInputSchema
>;

/** `GET /satisfaction?from&to` (aaaa-mm-dd, data da clínica). Padrão: do dia 1º do mês de `to` até `to`; `to` padrão = hoje. */
export const satisfactionFilterSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type SatisfactionFilter = z.infer<typeof satisfactionFilterSchema>;

export interface SatisfactionSurvey {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string | undefined;
  score: number;
  comment?: string | undefined;
  /** Usuário que registrou a resposta. */
  actorUserId: string;
  createdAt: string;
}

export interface SatisfactionSummary {
  total: number;
  /** Notas 9–10. */
  promoters: number;
  /** Notas 7–8. */
  passives: number;
  /** Notas 0–6. */
  detractors: number;
  /** %promotores − %detratores, arredondado (Math.round); `null` sem respostas. */
  nps: number | null;
}

export interface SatisfactionReport {
  from: string;
  to: string;
  /** Mais recentes primeiro. */
  surveys: SatisfactionSurvey[];
  summary: SatisfactionSummary;
}

// Linha do tempo do cliente

export type PatientTimelineKind =
  | "appointment"
  | "plan_created"
  | "plan_renewed"
  | "plan_cancelled"
  | "payment"
  | "payment_reversal"
  | "contact"
  | "message"
  | "satisfaction";

/**
 * Evento do histórico do cliente (`GET /patients/:id/timeline`, mais recentes
 * primeiro). Nunca traz conteúdo clínico (evoluções, avaliações).
 */
export interface PatientTimelineEntry {
  /** `<kind>:<id da origem>` — único na linha do tempo. */
  id: string;
  kind: PatientTimelineKind;
  /** ISO 8601. */
  occurredAt: string;
  /** Texto curto em pt-BR. */
  title: string;
  detail?: string;
  /** Valor com sinal (estornos negativos). */
  amountInCents?: number;
  /**
   * Código bruto da origem: status do atendimento (`AppointmentStatus`),
   * resultado do contato (`ContactOutcome`) ou status da mensagem.
   */
  status?: string;
  /** Nota 0–10, só em `satisfaction`. */
  score?: number;
}

export type SatisfactionCategory = "promoter" | "passive" | "detractor";

export function satisfactionCategory(score: number): SatisfactionCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export function summarizeSatisfaction(
  surveys: ReadonlyArray<{ score: number }>,
): SatisfactionSummary {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const survey of surveys) {
    const category = satisfactionCategory(survey.score);
    if (category === "promoter") promoters += 1;
    else if (category === "passive") passives += 1;
    else detractors += 1;
  }
  const total = surveys.length;
  const nps =
    total === 0
      ? null
      : Math.round(((promoters - detractors) / total) * 100) || 0;
  return { total, promoters, passives, detractors, nps };
}

/** Link wa.me com o DDI 55; não duplica o 55 se o número já vier com ele. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const international =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits
      : `55${digits}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

/** Substitui `{{variavel}}` pelos valores informados; variáveis desconhecidas ficam como estão. */
export function fillMessageTemplate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? match) : match,
  );
}

export type PatientImportRowStatus = "valid" | "error" | "duplicate";

/** Com quem a linha importada colide: um cliente já cadastrado ou uma linha anterior do arquivo. */
export type PatientImportDuplicate =
  | { kind: "existing"; field: "cpf" | "phone"; patientId: string; fullName: string }
  | { kind: "row"; field: "cpf" | "phone"; line: number };

export interface PatientImportRow {
  /** Número da linha na planilha (o cabeçalho é a linha 1 quando está no topo). */
  line: number;
  status: PatientImportRowStatus;
  /** Nome e telefone como vieram no arquivo, para exibir na prévia. */
  fullName: string;
  phone: string;
  /** Presente em linhas `valid` e `duplicate`. */
  input?: PatientInput;
  /** Mensagens em pt-BR, presentes em linhas `error`. */
  errors?: string[];
  /** Presente em linhas `duplicate`. */
  duplicateOf?: PatientImportDuplicate;
}

export interface PatientImportAnalysis {
  rows: PatientImportRow[];
  /** Problemas gerais do arquivo (ex.: coluna obrigatória ausente); quando há algum, `rows` fica vazio. */
  errors: string[];
  totals: { valid: number; error: number; duplicate: number };
}

/** Arquivo de clientes enviado para prévia/importação: CSV ou XLSX em base64 (até 2 MB decodificado). */
export const patientImportFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
});
export type PatientImportFileInput = z.infer<typeof patientImportFileSchema>;

/** Resultado da importação: linhas criadas, ignoradas por duplicidade e linhas com erro. */
export interface PatientImportResult {
  created: number;
  skipped: number;
  errors: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
