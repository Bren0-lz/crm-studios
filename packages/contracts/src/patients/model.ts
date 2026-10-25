import { patientProfileFilterSchema } from "./segments.js";
import { z } from "zod";
import { leadAppointmentInputSchema } from "../agenda/model.js";
import {
  cpfDigits,
  emptyQueryToUndefined,
  isValidCpf,
  optionalPhoneSchema,
  phoneSchema,
  queryBoolean,
  queryList,
} from "../common/model.js";
import {
  autoRenewIssue,
  guidedPlanTermsSchema,
  isRecurringChargeValid,
  recurringSingleChargeIssue,
  planPeriodIssue,
  renewablePlanPeriod,
  validPlanPeriod,
} from "../plans/model.js";
import type {
  ClientAgeBand,
  PatientExportColumn,
  PatientTag,
} from "./types.js";

export const patientStatusSchema = z.enum(["active", "inactive"]);

export const patientProfileSchema = z.object({
  nickname: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  neighborhood: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
  postalCode: z.string().trim().max(10).optional(),
  gender: z.enum(["female", "male", "other", "undisclosed", ""]).optional(),
  guardianName: z.string().trim().max(160).optional(),
  guardianPhone: optionalPhoneSchema,
  occupation: z.string().trim().max(120).optional(),
  source: z.string().trim().max(120).optional(),
  level: z.string().trim().max(80).optional(),
  clientSince: z.iso.date().optional().or(z.literal("")),
  imageConsent: z.boolean().optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});

export const patientProfileLabels = {
  nickname: "Apelido",
  address: "Endereço",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "UF",
  postalCode: "CEP",
  gender: "Gênero",
  guardianName: "Nome do responsável",
  guardianPhone: "Telefone do responsável",
  occupation: "Profissão",
  source: "Origem",
  level: "Nível",
  clientSince: "Cliente desde",
  imageConsent: "Autoriza uso de imagem",
  interests: "Interesses",
} as const;

export function patientProfile(input: z.infer<typeof patientProfileSchema>) {
  return patientProfileSchema.parse(input);
}

export const patientInputSchema = z.object({
  ...patientProfileSchema.shape,
  fullName: z.string().trim().min(3).max(160),
  cpf: z
    .string({ error: "Informe um CPF válido." })
    .trim()
    .transform(cpfDigits)
    .refine((value) => isValidCpf(value), "Informe um CPF válido."),
  email: z.email().optional().or(z.literal("")),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  birthDate: z.iso.date().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactPhone: optionalPhoneSchema,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

/** Cor das etiquetas criadas sem cor e das importadas na migração 0044. */
export const DEFAULT_PATIENT_TAG_COLOR = "#64748b";

export const patientTagNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da etiqueta.")
  .max(40, "O nome da etiqueta pode ter até 40 caracteres.");

export const patientTagColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.")
  .transform((value) => value.toLowerCase());

/** `POST /patient-tags`: cor opcional (padrão `DEFAULT_PATIENT_TAG_COLOR`). */
export const patientTagCategorySchema = z.enum([
  "financial",
  "service",
  "status",
]);

export const patientTagCategoryLabels: Record<
  z.infer<typeof patientTagCategorySchema>,
  string
> = {
  financial: "Financeiro",
  service: "Serviço",
  status: "Status",
};

/** Cor padrão de cada categoria (V3): vale quando a etiqueta não tem cor própria. */
export const patientTagCategoryColors: Record<
  z.infer<typeof patientTagCategorySchema>,
  string
> = {
  financial: "#c2410c",
  service: "#0f766e",
  status: "#6d28d9",
};

/** Cor exibida: a escolhida na etiqueta; sem cor própria, a da categoria. */
export function patientTagDisplayColor(
  tag: Pick<PatientTag, "color" | "category">,
): string {
  const color = tag.color?.toLowerCase();
  if (color && color !== DEFAULT_PATIENT_TAG_COLOR.toLowerCase()) return color;
  return tag.category
    ? patientTagCategoryColors[tag.category]
    : DEFAULT_PATIENT_TAG_COLOR;
}

export const patientTagInputSchema = z.object({
  name: patientTagNameSchema,
  color: patientTagColorSchema.default(DEFAULT_PATIENT_TAG_COLOR),
  category: patientTagCategorySchema.optional(),
});

/** `PATCH /patient-tags/:id`: renomear e/ou trocar a cor (ao menos um dos dois). */
export const patientTagUpdateSchema = z
  .object({
    name: patientTagNameSchema.optional(),
    color: patientTagColorSchema.optional(),
    /** null tira a categoria. */
    category: patientTagCategorySchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.category !== undefined,
    { message: "Informe o novo nome, a nova cor ou a categoria." },
  );

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
  const byKey = new Map(
    configured.map((tag) => [patientTagKey(tag.name), tag.name]),
  );
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
    ...patientProfileSchema.keyof().options,
  ],
  "Coluna de exportação desconhecida.",
);

export const patientExportColumns = patientExportColumnSchema.options;
export const patientDefaultExportColumns = patientExportColumns.filter(
  (column) => !(column in patientProfileLabels),
);

/** Cabeçalho pt-BR de cada coluna (coerente com o modelo de importação). */
export const patientExportColumnLabels: Record<PatientExportColumn, string> = {
  ...patientProfileLabels,
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
  ...patientProfileFilterSchema.shape,
  format: z.preprocess(
    emptyQueryToUndefined,
    z
      .enum(["csv", "xlsx"], "Formato inválido. Use csv ou xlsx.")
      .default("csv"),
  ),
  status: z.preprocess(emptyQueryToUndefined, patientStatusSchema.optional()),
  tags: z.preprocess(queryList, z.array(z.string().max(40)).max(50).optional()),
  birthdayMonth: queryBoolean,
  activePlan: queryBoolean,
  withoutGroup: queryBoolean,
  search: z.preprocess(
    emptyQueryToUndefined,
    z.string().trim().max(160).optional(),
  ),
  columns: z.preprocess(
    queryList,
    z
      .array(patientExportColumnSchema)
      .optional()
      .transform((value) =>
        value
          ? patientExportColumns.filter((column) => value.includes(column))
          : [...patientDefaultExportColumns],
      ),
  ),
});

/**
 * `POST /patients/guided`: cria o cliente já com o próximo passo, tudo ou nada.
 * - `none`: só o cadastro (igual a `POST /patients`);
 * - `demonstration`: atendimento experimental (`visitType: "trial"`) com serviço, profissional,
 *   sala e data/hora (mesmas regras de feriado e conflito da agenda);
 * - `plan`: plano `recurring` ou `fixed_package` e, opcionalmente, matrícula na turma `groupId`
 *   (precisa ser de um serviço incluído no plano; turma cheia = lista de espera);
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
      .refine(isRecurringChargeValid, {
        message: recurringSingleChargeIssue,
        path: ["installments"],
      })
      .refine(renewablePlanPeriod, autoRenewIssue)
      .refine(
        (value) =>
          value.services.reduce(
            (sum, item) => sum + item.totalValueInCents,
            0,
          ) === value.totalValueInCents,
        {
          message: "A soma dos serviços deve corresponder ao valor total.",
          path: ["totalValueInCents"],
        },
      ),
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
      .refine(renewablePlanPeriod, autoRenewIssue)
      .refine(
        (value) =>
          value.services.reduce(
            (sum, item) => sum + item.totalValueInCents,
            0,
          ) === value.totalValueInCents,
        {
          message: "A soma dos serviços deve corresponder ao valor total.",
          path: ["totalValueInCents"],
        },
      ),
  }),
]);

/**
 * Query de `GET /patients`: `search` e `withoutGroup=true` (assinantes sem turma vinculada:
 * plano ativo que não é avulso e sem matrícula ativa em turma do serviço desse plano).
 */
export const patientListQuerySchema = z.object({
  ...patientProfileFilterSchema.shape,
  search: z.preprocess(
    emptyQueryToUndefined,
    z.string().trim().max(160).optional(),
  ),
  withoutGroup: queryBoolean,
});

/** Etapas padrão do funil, na ordem. A clínica pode renomear, incluir e remover etapas;
 * `won` (ganhos, só por conversão) e `lost` (perdidos, com motivo) são etapas de sistema. */
export const defaultLeadStageKeys = [
  "new_contact",
  "contacted",
  "evaluation",
  "proposal",
  "won",
  "lost",
] as const;
/** Chave da etapa: as padrão acima ou `stage_<código>` para as criadas pela clínica. */
export const leadStageSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, "Etapa do funil inválida.");

/** Faixas etárias do relatório de clientes (`unknown` = sem data de nascimento). */
export const clientAgeBandSchema = z.enum([
  "0-17",
  "18-29",
  "30-44",
  "45-59",
  "60+",
  "unknown",
]);

export const clientAgeBandLabels: Record<ClientAgeBand, string> = {
  "0-17": "0 a 17 anos",
  "18-29": "18 a 29 anos",
  "30-44": "30 a 44 anos",
  "45-59": "45 a 59 anos",
  "60+": "60 anos ou mais",
  unknown: "Sem data de nascimento",
};

/** Arquivo de clientes enviado para prévia/importação: CSV ou XLSX em base64 (até 2 MB decodificado). */
export const patientImportFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
});

export const patientProfileValueLabels = {
  female: "Feminino",
  male: "Masculino",
  other: "Outro",
  undisclosed: "Prefere não informar",
} as const;
