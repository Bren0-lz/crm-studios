import { z } from "zod";
import { phoneSchema } from "../common/model.js";
import {
  patientProfileSchema,
  patientInputSchema,
  patientOptionalContactShape,
  leadStageSchema,
} from "../patients/model.js";

export const leadPatientProfileSchema = patientProfileSchema.extend(
  patientInputSchema
    .pick({
      cpf: true,
      whatsapp: true,
      birthDate: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    })
    .extend({
      ...patientOptionalContactShape,
      cpf: patientInputSchema.shape.cpf.optional().or(z.literal("")),
    }).shape,
);
export function leadPatientProfile(
  input: z.infer<typeof leadPatientProfileSchema>,
) {
  return leadPatientProfileSchema.parse(input);
}
/** Limite das observações do lead e do registro de contato. */
export const LEAD_NOTES_MAX = 2000;

export const leadInputSchema = z.object({
  ...leadPatientProfileSchema.shape,
  contactMethod: z.string().trim().max(80).optional(),
  fullName: z.string().trim().min(3).max(160),
  phone: phoneSchema,
  email: z.email().optional().or(z.literal("")),
  source: z.string().trim().min(2).max(80),
  interest: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(LEAD_NOTES_MAX).optional().or(z.literal("")),
  responsibleUserId: z.uuid().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  /** Evento em que o lead entrou (participante); só vale no cadastro, a edição não troca. */
  eventId: z.uuid().optional(),
});

/**
 * Dados revisados na conversão: o modal repete o cadastro de cliente, já preenchido com o
 * que o lead tem. O CPF é obrigatório; campos vazios não apagam o que o lead já guarda.
 */
export const leadConversionInputSchema = leadPatientProfileSchema
  .omit({ interests: true })
  .partial()
  .extend({
    cpf: patientInputSchema.shape.cpf,
    fullName: leadInputSchema.shape.fullName.optional().or(z.literal("")),
    phone: phoneSchema.optional().or(z.literal("")),
    email: leadInputSchema.shape.email,
    notes: leadInputSchema.shape.notes,
  });

/** O que o lead já guarda e que conta para o pedido de dados antes da conversão. */
export interface LeadRegistrationData {
  fullName: string;
  phone?: string | undefined;
  cpf?: string | undefined;
  whatsapp?: string | undefined;
  email?: string | undefined;
  birthDate?: string | undefined;
  emergencyContactName?: string | undefined;
  emergencyContactPhone?: string | undefined;
  postalCode?: string | undefined;
  address?: string | undefined;
  addressNumber?: string | undefined;
  neighborhood?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
}

const filled = (value: string | undefined) => Boolean(value?.trim());

/**
 * Dados do cadastro de cliente que o lead ainda não tem, na ordem em que são pedidos na
 * mensagem para o lead. Nome só com uma palavra conta como "Nome completo" faltando.
 */
export function leadMissingRegistrationFields(
  lead: LeadRegistrationData,
): string[] {
  const nameWords = lead.fullName.trim().split(/\s+/).filter(Boolean);
  const addressParts: Array<[string, string | undefined]> = [
    ["CEP", lead.postalCode],
    ["rua", lead.address],
    ["número", lead.addressNumber],
    ["bairro", lead.neighborhood],
    ["cidade/UF", filled(lead.city) && filled(lead.state) ? "ok" : ""],
  ];
  const missingAddress = addressParts
    .filter(([, value]) => !filled(value))
    .map(([label]) => label);
  return [
    ...(nameWords.length >= 2 ? [] : ["Nome completo"]),
    ...(filled(lead.cpf) ? [] : ["CPF"]),
    ...(filled(lead.whatsapp) || filled(lead.phone) ? [] : ["WhatsApp"]),
    ...(filled(lead.email) ? [] : ["E-mail"]),
    ...(filled(lead.birthDate) ? [] : ["Data de nascimento"]),
    ...(missingAddress.length === 0
      ? []
      : [`Endereço (${missingAddress.join(", ")})`]),
    ...(filled(lead.emergencyContactName) && filled(lead.emergencyContactPhone)
      ? []
      : ["Contato de emergência (nome e telefone)"]),
  ];
}

/** Mensagem para o lead mandar de uma vez o que falta no cadastro (WhatsApp ou copiar). */
export function leadRegistrationRequestMessage(
  lead: LeadRegistrationData,
): string {
  const firstName = lead.fullName.trim().split(/\s+/)[0] ?? "";
  const items = leadMissingRegistrationFields(lead)
    .map((item) => `• ${item}`)
    .join("\n");
  return [
    `Olá, ${firstName}! Para concluir seu cadastro, preciso destas informações:`,
    "",
    items,
    "",
    "Pode me enviar por aqui mesmo. Obrigado!",
  ].join("\n");
}

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

export const leadContactInputSchema = z.object({
  channel: leadContactChannelSchema,
  contactMethod: z.string().trim().max(80).optional(),
  direction: z.enum(["inbound", "outbound", "internal"]),
  notes: z.string().trim().min(2).max(LEAD_NOTES_MAX),
  occurredAt: z.iso.datetime().optional(),
  /**
   * Contato feito? `false` = tentativa sem resposta (fica no histórico, mas não conta como
   * contatado nos indicadores do evento). Ausente = contato feito.
   */
  reached: z.boolean().optional(),
});

export const leadTaskStatusSchema = z.enum(["open", "completed", "cancelled"]);

export const leadTaskInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  dueAt: z.iso.datetime(),
  assignedUserId: z.uuid().optional().or(z.literal("")),
});

export const leadContactChannelLabels: Record<
  z.infer<typeof leadContactChannelSchema>,
  string
> = {
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  in_person: "Presencial",
  note: "Nota interna",
};

/**
 * Canal técnico deduzido do nome escolhido no campo único "Canal" (U21): o nome fica em
 * `contactMethod` (usado na análise do funil) e o canal acompanha por compatibilidade.
 */
export function inferLeadContactChannel(
  method: string,
): z.infer<typeof leadContactChannelSchema> {
  const key = method.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (key.includes("whats") || key.includes("zap")) return "whatsapp";
  if (key.includes("mail")) return "email";
  if (/presencial|visita|pessoal|balcao|recepcao/.test(key)) return "in_person";
  if (/telefon|ligac|liga|celular/.test(key)) return "phone";
  return "note";
}
