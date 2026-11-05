import { z } from "zod";
import { emptyQueryToUndefined } from "../common/model.js";

export const managementReportFilterSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "A data inicial deve ser anterior à data final.",
    path: ["from"],
  });

export const salesReportFilterSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export const salesPeriodReportFilterSchema = managementReportFilterSchema;

/** Query de `GET /reports/campaigns` e da planilha `/reports/campaigns.xlsx`. */
export const campaignReportFilterSchema = managementReportFilterSchema;

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

/**
 * Query de `GET /reports/clients`, com os mesmos padrões da retenção: `to`
 * ausente = hoje (fuso da clínica); `from` ausente = 1º dia do mês cinco meses
 * antes do mês de `to`. Parâmetros vazios contam como ausentes.
 */
export const clientReportFilterSchema = retentionReportFilterSchema;

/**
 * Variação percentual de vendas entre dois períodos, com uma casa decimal. Só existe quando a
 * base anterior é positiva: com base zero ou negativa (estornos maiores que as vendas) o
 * percentual não tem significado e o resultado é `null` — mostre a diferença em reais.
 */
export function salesChangePercent(
  currentInCents: number,
  previousInCents: number,
): number | null {
  if (previousInCents <= 0) return null;
  return (
    Math.round(((currentInCents - previousInCents) / previousInCents) * 1000) /
    10
  );
}

/** Grupos do sino de notificações, na ordem em que aparecem. */
export const notificationKinds = [
  "birthdays",
  "overdueReceivables",
  "unsignedReceipts",
  "recurringPayables",
  "pendingFinalization",
  "overdueLeadTasks",
  "snoozedContacts",
  "pauseReturns",
  "lowStock",
  "autoCampaigns",
] as const;

export const notificationKindSchema = z.enum(notificationKinds);

/** Intervalos (minutos) entre as conferências automáticas do sino. */
export const notificationRefreshMinutes = [1, 5, 15, 30] as const;

const uniqueKinds = z
  .array(notificationKindSchema)
  .max(notificationKinds.length)
  .transform((kinds) =>
    notificationKinds.filter((kind) => kinds.includes(kind)),
  );

/**
 * Preferências de notificação de cada usuário (`PUT /notifications/preferences`).
 * `hiddenKinds` guarda os grupos desligados: grupo novo aparece ligado por padrão.
 */
export const notificationPreferencesSchema = z.object({
  hiddenKinds: uniqueKinds,
  /** Grupos que entram na faixa de alertas no topo da tela. */
  highlightedKinds: uniqueKinds,
  showBanner: z.boolean(),
  showToasts: z.boolean(),
  playSound: z.boolean(),
  refreshMinutes: z.union(
    notificationRefreshMinutes.map((value) => z.literal(value)),
    { error: "Escolha um intervalo da lista." },
  ),
});

export const defaultNotificationPreferences: z.infer<
  typeof notificationPreferencesSchema
> = {
  hiddenKinds: [],
  highlightedKinds: [
    "overdueReceivables",
    // RC5: o aviso de recibos só aparece no horário configurado e vai também para a faixa.
    "unsignedReceipts",
    "pendingFinalization",
    "overdueLeadTasks",
  ],
  showBanner: true,
  showToasts: true,
  playSound: false,
  refreshMinutes: 5,
};

/** Lê preferências gravadas; o que estiver ausente ou inválido volta ao padrão. */
export function resolveNotificationPreferences(
  stored: unknown,
): z.infer<typeof notificationPreferencesSchema> {
  const record =
    stored && typeof stored === "object"
      ? (stored as Record<string, unknown>)
      : {};
  const result = { ...defaultNotificationPreferences };
  for (const key of Object.keys(result) as Array<keyof typeof result>) {
    const parsed = notificationPreferencesSchema.shape[key].safeParse(
      record[key],
    );
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
  }
  return result;
}
