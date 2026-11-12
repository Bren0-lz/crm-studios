import {
  leadImportFileSchema,
  leadImportPreviewSchema,
  type LeadImportResult,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { readSpreadsheetFile } from "../../infrastructure/spreadsheet.js";
import { DomainError } from "../../repository.js";
import {
  annotateLeadImportDuplicates,
  validateLeadImport,
} from "./lead-import.js";

/** LI1: importação de leads por planilha na tela do CRM comercial (sem evento). */
export function registerLeadImportRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  async function analyze(clinicId: string, body: unknown) {
    const file = leadImportPreviewSchema.parse(body);
    const analysis = validateLeadImport(
      await readSpreadsheetFile(file, "LEAD_IMPORT"),
      file.mapping,
    );
    if (analysis.errors[0]) return analysis;
    return annotateLeadImportDuplicates(
      analysis,
      await repository.listContactImportCandidates(clinicId),
    );
  }

  app.post(
    "/leads/import/preview",
    { preHandler: authenticate },
    async (request) => analyze(request.user.clinicId, request.body),
  );
  app.post(
    "/leads/import",
    { preHandler: authenticate },
    async (request): Promise<LeadImportResult> => {
      const file = leadImportFileSchema.parse(request.body);
      const analysis = await analyze(request.user.clinicId, request.body);
      if (analysis.errors[0])
        throw new DomainError(
          "LEAD_IMPORT_INVALID_FILE",
          analysis.errors[0],
          400,
        );
      const valid = analysis.rows.filter(
        (row) => row.status === "valid" && row.input,
      );
      const { created } = await repository.importLeads(
        request.user.clinicId,
        file.stage,
        valid.map(({ input }) => ({
          ...input!,
          source: input!.source || file.source,
        })),
      );
      return {
        created,
        warnings: valid.filter((row) => row.warnings?.length).length,
        errors: analysis.totals.error,
      };
    },
  );
}
