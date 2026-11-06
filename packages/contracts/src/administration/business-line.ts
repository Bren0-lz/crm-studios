import { z } from "zod";

/**
 * Linha no painel de vendas (dashboard-studios): Studio (aulas, turmas) ou Estética. Vale para
 * serviços e produtos e só categoriza o painel; sem linha (`null`) aparece lá como "Outros".
 * Fica fora de `model.ts` para o cadastro de produto (finance) usar sem import circular.
 */
export const serviceBusinessLines = ["studio", "aesthetics"] as const;
export const serviceBusinessLineSchema = z.enum(serviceBusinessLines);
export const serviceBusinessLineLabels: Record<
  (typeof serviceBusinessLines)[number],
  string
> = { studio: "Studio", aesthetics: "Estética" };
