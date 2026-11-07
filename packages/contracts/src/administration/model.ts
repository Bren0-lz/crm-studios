import { userBranchAccessSchema } from "../branches/model.js";
import { z } from "zod";
import {
  formatTaxId,
  isValidTaxId,
  optionalPhoneSchema,
} from "../common/model.js";
import { adminUserCommissionInputSchema } from "../finance/model.js";
import { serviceBusinessLineSchema } from "./business-line.js";
import { receiptReminderSettingsSchema } from "../finance/receipt-reminders.js";
import {
  userPermissionsSchema,
  validatePermissionInput,
} from "../permissions.js";
import type { AppModule, UserRole } from "./types.js";

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().nonempty(),
});

/**
 * Tipo de usuário: `admin` tem acesso total (todos os módulos e a Administração); `user`
 * (usuário comum) vê e edita só os módulos marcados pelo admin — sem nenhum marcado, só a
 * Visão geral. Os antigos perfis (gestora, recepção, fisioterapeuta, financeiro) foram
 * convertidos pela migração 0042 sem mudar o acesso de ninguém.
 */
export const userRoleSchema = z.enum(["admin", "user"]);

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
  "events",
  "relationship",
  "waitlist",
  "communications",
  "contracts",
  "clinical",
  "finance",
  "reports",
  "settings",
  "history",
]);

export const appModuleLabels: Record<AppModule, string> = {
  agenda: "Agenda",
  groups: "Turmas",
  patients: "Clientes",
  plans: "Planos e sessões",
  crm: "CRM comercial",
  events: "Eventos",
  relationship: "Contatos sugeridos",
  waitlist: "Lista de espera",
  communications: "Comunicações",
  contracts: "Contratos",
  clinical: "Prontuários",
  finance: "Financeiro",
  reports: "Relatórios",
  settings: "Configurações",
  history: "Histórico",
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
  return effectiveModules(role, modules).filter((module) =>
    chosen.includes(module),
  );
}

export const jobTitleSchema = z.string().trim().max(80);

export const userModulesSchema = z
  .array(appModuleSchema)
  .max(appModuleSchema.options.length * 2)
  .nullable();

/** Senha livre: só não pode ficar vazia nem passar de 128 caracteres. */
export const passwordSchema = z
  .string()
  .min(1, "Informe a senha.")
  .max(128, "Use no máximo 128 caracteres.");

export const professionalInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  crefito: z.string().trim().min(4).max(40),
  specialty: z.string().trim().min(2).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

/** Operação da agenda executada junto com o cadastro do usuário. */
export const adminUserAgendaInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), data: professionalInputSchema }),
  z.object({
    mode: z.literal("save"),
    id: z.uuid(),
    data: professionalInputSchema,
  }),
  z.object({ mode: z.literal("deactivate") }),
]);

/**
 * Salário fixo mensal do usuário (centavos, maior que zero); `null` = não recebe salário.
 * Só quem recebe salário entra na folha de pagamento: a folha não cadastra ninguém.
 */
export const userSalarySchema = z
  .number("Informe o salário.")
  .int("Informe o salário.")
  .positive("Informe o salário (maior que zero).")
  .max(2147483647, "Salário acima do limite permitido.")
  .nullable();

export const adminUserInputSchema = z
  .object({
    fullName: z.string().trim().min(3).max(160),
    email: z.email().transform((value) => value.toLowerCase()),
    role: userRoleSchema,
    password: passwordSchema,
    /** Cargo informativo; vazio = sem cargo. */
    jobTitle: jobTitleSchema.optional(),
    /** WhatsApp com DDD (só dígitos); vazio = sem WhatsApp. Usado no "Compartilhar agenda". */
    whatsapp: optionalPhoneSchema,
    /** Módulos que o usuário comum vê; ausente ou `null` = nenhum (admin ignora: vê tudo). */
    modules: userModulesSchema.optional(),
    /** Módulos com edição; ausente ou `null` = nenhum (editar sem ver é descartado). */
    editModules: userModulesSchema.optional(),
    permissions: userPermissionsSchema.optional(),
    /** Comissão do usuário já na criação; ausente = sem comissão. */
    commission: adminUserCommissionInputSchema.optional(),
    professional: adminUserAgendaInputSchema.optional(),
    /** Filiais que o usuário acessa; ausente = todas. */
    branchAccess: userBranchAccessSchema.optional(),
    /** Salário mensal; ausente ou `null` = não recebe (fica fora da folha). */
    salaryInCents: userSalarySchema.optional(),
    /** Acesso ao painel de vendas (vale também para admin); ausente = sem acesso. */
    dashboardAccess: z.boolean().optional(),
  })
  .superRefine(validatePermissionInput);

export const adminUserUpdateSchema = z
  .object({
    fullName: z.string().trim().min(3).max(160),
    role: userRoleSchema,
    active: z.boolean(),
    /** Ausente = mantém o cargo atual; vazio = remove o cargo. */
    jobTitle: jobTitleSchema.optional(),
    /** Ausente = mantém o WhatsApp atual; vazio = remove. */
    whatsapp: optionalPhoneSchema,
    /** Ausente = mantém os módulos atuais; `null` = nenhum. */
    modules: userModulesSchema.optional(),
    /** Ausente = mantém os módulos com edição atuais; `null` = nenhum. */
    editModules: userModulesSchema.optional(),
    permissions: userPermissionsSchema.optional(),
    /** Ausente = mantém as filiais atuais. */
    branchAccess: userBranchAccessSchema.optional(),
    professional: adminUserAgendaInputSchema.optional(),
    commission: adminUserCommissionInputSchema.optional(),
    /** Ausente = mantém; `null` = deixa de receber salário (sai da folha). */
    salaryInCents: userSalarySchema.optional(),
    /** Acesso ao painel de vendas (vale também para admin); ausente = mantém. */
    dashboardAccess: z.boolean().optional(),
  })
  .superRefine(validatePermissionInput);

export const passwordResetSchema = z.object({ password: passwordSchema });

/** Foto do usuário (perfil próprio): PNG ou JPEG em data URL; vazio = sem foto. */
export const avatarDataUrlSchema = z
  .string()
  .max(2800000)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
  .or(z.literal(""));

/** Edição do próprio perfil (`PUT /me/profile`); a agenda só vale com profissional ligado. */
export const ownProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  /** Ausente = mantém a foto atual; vazio = remove. */
  avatarDataUrl: avatarDataUrlSchema.optional(),
  /** Nome exibido na agenda (nome do profissional ligado). */
  agendaName: z.string().trim().min(3).max(160).optional(),
  /** Cor do profissional ligado na agenda. */
  agendaColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/** Troca da própria senha: exige a senha atual. */
export const ownPasswordChangeSchema = z.object({
  currentPassword: z.string().nonempty(),
  newPassword: passwordSchema,
});

export const clinicSettingsInputSchema = z.object({
  logoDataUrl: z
    .string()
    .max(2800000)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .optional()
    .or(z.literal("")),
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  taxId: z
    .string()
    .trim()
    .max(20)
    .refine(
      (value) => value === "" || isValidTaxId(value),
      "Informe um CPF ou CNPJ válido.",
    )
    .transform((value) => (value === "" ? "" : formatTaxId(value)))
    .optional(),
  phone: optionalPhoneSchema,
  email: z.email().optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  /** Chave Pix enviada nas cobranças do cadastro de clientes. */
  pixKey: z.string().trim().max(140).optional().or(z.literal("")),
  /** Modelo da mensagem de cobrança Pix (`pixMessageVariables`); vazio = texto padrão. */
  pixMessageTemplate: z.string().trim().max(1000).optional().or(z.literal("")),
  /** Modelo da mensagem "recebemos seu pagamento" (`paymentReceiptMessageVariables`); vazio = texto padrão. */
  paymentReceiptMessageTemplate: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("")),
  /**
   * Periodicidade legada, preservada para compatibilidade; ausente mantém o gravado.
   * Não controla o sino e a faixa: recibos pendentes aparecem imediatamente (RC6).
   */
  receiptReminder: receiptReminderSettingsSchema.optional(),
  timezone: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "Informe um fuso horário válido."),
});

export const roomInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  capacity: z.number().int().min(1).max(100),
});

/** Linha no painel de vendas (serviço e produto): ver `business-line.ts`. */
export {
  serviceBusinessLineLabels,
  serviceBusinessLineSchema,
  serviceBusinessLines,
} from "./business-line.js";

/**
 * Serviço é só cadastro (nome, duração, linha, profissionais e salas): o valor fica nos planos
 * (atendimento único = plano avulso de 1 sessão). `priceInCents` antigo é ignorado.
 */
export const serviceInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(15).max(480),
  /** Profissionais e salas que atendem o serviço; vazio ou ausente = todos. */
  professionalIds: z.array(z.uuid()).max(200).optional(),
  roomIds: z.array(z.uuid()).max(200).optional(),
  /**
   * Linha no painel de vendas; `null` = sem classificação. Ausente = `null` ao criar e mantém a
   * atual ao editar; `null` explícito ao editar limpa.
   */
  businessLine: serviceBusinessLineSchema.nullable().optional(),
});

/** O serviço pode ser agendado com este profissional e esta sala? (vazio = todos). */
export function serviceAvailableFor(
  service: {
    professionalIds?: string[] | undefined;
    roomIds?: string[] | undefined;
  },
  professionalId: string,
  roomId: string,
) {
  const professionals = service.professionalIds ?? [];
  const rooms = service.roomIds ?? [];
  return (
    (!professionalId ||
      professionals.length === 0 ||
      professionals.includes(professionalId)) &&
    (!roomId || rooms.length === 0 || rooms.includes(roomId))
  );
}

/** Liga o usuário a um profissional da agenda; `null` desliga. Ligar outro troca a ligação. */
export const adminUserProfessionalInputSchema = z.object({
  professionalId: z.uuid().nullable(),
});

export const auditHistoryQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    search: z.string().trim().max(160).optional(),
    module: appModuleSchema.optional(),
    action: z.string().trim().min(1).max(120).optional(),
    actorUserId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "A data final deve ser igual ou posterior à data inicial.",
  });
