import { z } from "zod";
import { phoneSchema } from "../common/model.js";
import {
  patientProfileSchema,
  patientInputSchema,
  leadStageSchema,
} from "../patients/model.js";

export const leadPatientProfileSchema = patientProfileSchema.extend(
  patientInputSchema.pick({
    cpf: true,
    whatsapp: true,
    birthDate: true,
    emergencyContactName: true,
    emergencyContactPhone: true,
  }).shape,
);
export function leadPatientProfile(
  input: z.infer<typeof leadPatientProfileSchema>,
) {
  return leadPatientProfileSchema.parse(input);
}
export const leadInputSchema = z.object({
  ...leadPatientProfileSchema.shape,
  contactMethod: z.string().trim().max(80).optional(),
  fullName: z.string().trim().min(3).max(160),
  phone: phoneSchema,
  email: z.email().optional().or(z.literal("")),
  source: z.string().trim().min(2).max(80),
  interest: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  responsibleUserId: z.uuid().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

/** Dados pedidos só na conversão (U19): o lead não guarda CPF, emergência nem endereço. */
export const leadConversionInputSchema = leadPatientProfileSchema
  .pick({
    cpf: true,
    emergencyContactName: true,
    emergencyContactPhone: true,
    postalCode: true,
    address: true,
    neighborhood: true,
    city: true,
    state: true,
  })
  .partial();

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
  notes: z.string().trim().min(2).max(2000),
  occurredAt: z.iso.datetime().optional(),
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
