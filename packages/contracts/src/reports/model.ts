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
