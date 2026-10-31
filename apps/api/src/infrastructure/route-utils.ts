import type { ManagementReport, UserSummary } from "@crm/contracts";
import { z } from "zod";
import type { ClinicRepository } from "../repository.js";

// A interface manda `patientId=` vazio para listar tudo; o PostgreSQL não aceita "" como uuid.
export const optionalPatientFilterSchema = z.object({
  patientId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
});

export interface BuildAppOptions {
  repository: ClinicRepository;
  logger?: boolean;
  /** Saltos de proxy confiáveis para `request.ip` (padrão: `TRUST_PROXY`). */
  trustProxy?: number;
}

export function reportToCsv(report: ManagementReport) {
  const rows: Array<Array<string | number>> = [
    [
      "seção",
      "item",
      "total",
      "concluídos",
      "faltas",
      "taxa (%)",
      "valor (centavos)",
    ],
    [
      "agenda",
      "atendimentos",
      report.appointments.total,
      report.appointments.completed,
      report.appointments.noShows,
      report.appointments.attendanceRate,
      "",
    ],
    ["agenda", "cancelados", report.appointments.cancelled, "", "", "", ""],
    ["planos", "ativos", report.plans.active, "", "", "", ""],
    [
      "planos",
      "sessões disponíveis",
      report.plans.availableSessions,
      "",
      "",
      "",
      "",
    ],
    [
      "planos",
      "sessões consumidas no período",
      report.plans.consumedInPeriod,
      "",
      "",
      "",
      "",
    ],
    ["financeiro", "em aberto", "", "", "", "", report.finance.openInCents],
    ["financeiro", "em atraso", "", "", "", "", report.finance.overdueInCents],
    [
      "comercial",
      "leads criados",
      report.commercial.leadsCreated,
      report.commercial.won,
      report.commercial.lost,
      report.commercial.conversionRate,
      "",
    ],
    [
      "comercial",
      "tempo médio da primeira resposta (min)",
      report.commercial.averageFirstResponseMinutes,
      "",
      "",
      "",
      "",
    ],
    ...report.byProfessional.map((item) => [
      "profissional",
      item.name,
      item.appointments,
      item.completed,
      item.noShows,
      item.attendanceRate,
      "",
    ]),
    ...report.byService.map((item) => [
      "serviço",
      item.name,
      item.appointments,
      item.completed,
      item.noShows,
      item.attendanceRate,
      "",
    ]),
    ...report.bySource.map((item) => [
      "origem",
      item.source,
      item.leads,
      item.won,
      item.lost,
      item.conversionRate,
      "",
    ]),
    ...report.profitability.byService.map((item) => [
      "rentabilidade por serviço",
      item.name,
      item.completedAppointments,
      "",
      "",
      item.contributionMargin,
      item.contributionInCents,
    ]),
  ];
  const escape = (value: string | number) => {
    const text = String(value);
    return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\r\n")}`;
}
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      clinicId: string;
      role: UserSummary["role"];
      sessionVersion?: number;
    };
    user: {
      sub: string;
      clinicId: string;
      role: UserSummary["role"];
      sessionVersion?: number;
    };
  }
}
