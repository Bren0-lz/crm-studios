import { z } from "zod";
import type { ReceiptSignatureSummary } from "./receipt-signatures.js";

/**
 * Configuração legada de periodicidade (RC5), mantida para compatibilidade.
 * Desde RC6, GET /notifications conta todos os recibos pendentes imediatamente.
 */
export const receiptReminderFrequencies = ["daily", "weekly", "off"] as const;

export type ReceiptReminderFrequency =
  (typeof receiptReminderFrequencies)[number];

export const receiptReminderFrequencyLabels: Record<
  ReceiptReminderFrequency,
  string
> = {
  daily: "Todos os dias",
  weekly: "Uma vez por semana",
  off: "Desligado",
};

/** Dias da semana do aviso semanal (0 = domingo, como `Date.getDay()`). */
export const receiptReminderWeekdayLabels = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const receiptReminderSettingsSchema = z.object({
  frequency: z.enum(receiptReminderFrequencies, {
    error: "Escolha uma frequência da lista.",
  }),
  /** Dia do aviso semanal (0 = domingo); ignorado nas outras frequências. */
  weekday: z.number().int().min(0).max(6),
  /** Horário do aviso (HH:MM, fuso da clínica). */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
  /** Recibo enviado há mais de N horas e ainda sem assinatura entra no aviso. */
  afterHours: z
    .number()
    .int()
    .min(1, "Use pelo menos 1 hora.")
    .max(720, "Use no máximo 720 horas (30 dias)."),
});

export type ReceiptReminderSettings = z.infer<
  typeof receiptReminderSettingsSchema
>;

/**
 * Configuração legada de periodicidade, preservada para compatibilidade.
 * O sino e a faixa mostram pendências imediatamente, independentemente destes valores.
 */
export const defaultReceiptReminderSettings: ReceiptReminderSettings = {
  frequency: "daily",
  weekday: 1,
  time: "18:00",
  afterHours: 24,
};

/** Configuração gravada (ou ausente/inválida) com o padrão nos campos que faltam. */
export function resolveReceiptReminderSettings(
  stored: unknown,
): ReceiptReminderSettings {
  const record =
    stored && typeof stored === "object"
      ? (stored as Record<string, unknown>)
      : {};
  const result = { ...defaultReceiptReminderSettings };
  for (const key of Object.keys(result) as Array<keyof typeof result>) {
    const parsed = receiptReminderSettingsSchema.shape[key].safeParse(
      record[key],
    );
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
  }
  return result;
}

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * O aviso está valendo agora? Do horário configurado até o fim do dia (fuso da clínica),
 * todos os dias ou só no dia da semana escolhido; desligado nunca.
 */
export function isReceiptReminderDue(
  settings: ReceiptReminderSettings,
  now: Date,
  timeZone: string,
): boolean {
  if (settings.frequency === "off") return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  if (
    settings.frequency === "weekly" &&
    weekdayIndex[parts.weekday ?? ""] !== settings.weekday
  )
    return false;
  return `${parts.hour}:${parts.minute}` >= settings.time;
}

/** Clientes distintos com recibo pendente, desde a geração, sem prazo mínimo. */
export function unsignedReceiptPatientCount(
  receivables: readonly {
    patientId: string;
    receiptSignature?: ReceiptSignatureSummary | undefined;
  }[],
): number {
  const patients = new Set<string>();
  for (const { patientId, receiptSignature } of receivables) {
    if (
      receiptSignature?.status === "generated" ||
      receiptSignature?.status === "sent" ||
      receiptSignature?.status === "viewed"
    )
      patients.add(patientId);
  }
  return patients.size;
}
