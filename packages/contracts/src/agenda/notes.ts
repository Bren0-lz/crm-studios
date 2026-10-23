import { z } from "zod";

/** A mesma paleta fixa sugerida para etiquetas. */
export const agendaNotePalette = [
  { name: "Cinza", color: "#64748b" },
  { name: "Verde", color: "#276749" },
  { name: "Turquesa", color: "#0d9488" },
  { name: "Azul", color: "#2563eb" },
  { name: "Roxo", color: "#7c3aed" },
  { name: "Rosa", color: "#db2777" },
  { name: "Vermelho", color: "#dc2626" },
  { name: "Laranja", color: "#ea580c" },
  { name: "Amarelo", color: "#facc15" },
] as const;

const noteFields = z.object({
  professionalId: z.uuid().nullable(),
  description: z.string().trim().min(1, "Informe a descrição.").max(300),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  backgroundColor: z.enum(agendaNotePalette.map((item) => item.color)),
});
const validInterval = (value: { startsAt: string; endsAt: string }) =>
  Date.parse(value.endsAt) > Date.parse(value.startsAt);
const intervalError = {
  message: "O término deve ser posterior ao início.",
  path: ["endsAt"],
};
export const agendaNoteUpdateSchema = noteFields.refine(
  validInterval,
  intervalError,
);
export const agendaNoteInputSchema = noteFields
  .extend({
    repeat: z
      .object({
        until: z.iso.date(),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .max(7)
          .refine(
            (days) => new Set(days).size === days.length,
            "Há dias repetidos.",
          ),
      })
      .optional(),
  })
  .refine(validInterval, intervalError);
export const agendaNoteScopeSchema = z.enum(["this", "following"]);
export type AgendaNoteScope = z.infer<typeof agendaNoteScopeSchema>;
export type AgendaNoteInput = z.infer<typeof agendaNoteInputSchema>;
export type AgendaNoteUpdate = z.infer<typeof agendaNoteUpdateSchema>;
export interface AgendaNote extends AgendaNoteUpdate {
  id: string;
  clinicId: string;
  branchId: string;
  seriesId: string | null;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** Preto ou branco: escolhe a maior razão de contraste WCAG (sempre >= 4,5). */
export function agendaNoteTextColor(background: string): "#000000" | "#ffffff" {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(background.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? "#000000"
    : "#ffffff";
}

/** Datas locais da clínica, inclusive a primeira nota e o limite. Nunca trunca a série. */
export function agendaNoteOccurrenceDates(
  input: AgendaNoteInput,
  timeZone = "America/Sao_Paulo",
): string[] {
  const first = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(input.startsAt));
  const dates = [first];
  if (!input.repeat) return dates;
  if (input.repeat.until < first)
    throw new Error("Repetir até deve ser igual ou posterior à data da nota.");
  const cursor = new Date(`${first}T12:00:00Z`);
  while (true) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const date = cursor.toISOString().slice(0, 10);
    if (date > input.repeat.until) break;
    if (input.repeat.weekdays.includes(cursor.getUTCDay())) dates.push(date);
    if (dates.length > 120)
      throw new Error("A repetição permite no máximo 120 notas.");
  }
  return dates;
}
