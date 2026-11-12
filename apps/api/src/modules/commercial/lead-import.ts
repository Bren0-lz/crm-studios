import {
  leadImportFieldLabels,
  leadImportInputSchema,
  matchingContactFields,
  type ContactDuplicateCandidate,
  type LeadImportAnalysis,
  type LeadImportField,
  type LeadStageConfig,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { contactImportAliases, validateContactImport } from "./event-import.js";

/** LI1: mesma leitura da planilha de participantes, sem evento e com a coluna "Origem". */
export function validateLeadImport(
  rows: string[][],
  mapping?: (LeadImportField | null)[],
): LeadImportAnalysis {
  return validateContactImport(
    rows,
    {
      aliases: { ...contactImportAliases, source: ["origem", "fonte"] },
      labels: leadImportFieldLabels,
      parse: (raw) => leadImportInputSchema.safeParse(raw),
      noun: "leads",
    },
    mapping,
  );
}

const label = (candidate: ContactDuplicateCandidate) =>
  candidate.fullName.trim() || "sem nome";

/**
 * Avisos de contato repetido (mesmo telefone, e-mail ou CPF): já é cliente, já é lead em aberto
 * ou repete uma linha anterior do arquivo. Não bloqueiam: a linha continua válida.
 */
export function annotateLeadImportDuplicates(
  analysis: LeadImportAnalysis,
  candidates: {
    patients: ContactDuplicateCandidate[];
    leads: ContactDuplicateCandidate[];
  },
): LeadImportAnalysis {
  const previous: { line: number; contact: ContactDuplicateCandidate }[] = [];
  for (const row of analysis.rows) {
    if (row.status !== "valid" || !row.input) continue;
    const query = {
      phone: row.input.phone,
      email: row.input.email || undefined,
      cpf: row.input.cpf || undefined,
    };
    const match = (candidate: ContactDuplicateCandidate) =>
      matchingContactFields(query, candidate).length > 0;
    const warnings: string[] = [];
    const patient = candidates.patients.find(match);
    if (patient) warnings.push(`Já é cliente: ${label(patient)}.`);
    const lead = candidates.leads.find(match);
    if (lead) warnings.push(`Já é lead: ${label(lead)}.`);
    const repeated = previous.find(({ contact }) => match(contact));
    if (repeated) warnings.push(`Repete a linha ${repeated.line}.`);
    if (warnings.length) row.warnings = warnings;
    previous.push({
      line: row.line,
      contact: { id: "", fullName: row.fullName, ...query },
    });
  }
  return analysis;
}

/** A etapa escolhida precisa existir no funil e estar aberta (ganhos e perdidos ficam de fora). */
export function assertLeadImportStage(
  stages: readonly LeadStageConfig[],
  stage: string,
) {
  if (!stages.some((item) => item.stage === stage && item.kind === "open"))
    throw new DomainError(
      "LEAD_IMPORT_INVALID_STAGE",
      "Escolha uma etapa aberta do funil.",
      400,
    );
}
