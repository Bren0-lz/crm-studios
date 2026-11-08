import {
  eventInputSchema,
  eventImportFileSchema,
  type EventImportResult,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import { readSpreadsheetFile } from "../../infrastructure/spreadsheet.js";
import { validateEventImport } from "./event-import.js";

/** Eventos do comercial: o participante é um lead do CRM ligado ao evento. */
export function registerEventRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  const idParams = z.object({ id: z.uuid() });
  const notFound = () =>
    new DomainError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);

  async function analyzeImport(clinicId: string, id: string, body: unknown) {
    if (!(await repository.getEvent(clinicId, id))) throw notFound();
    const file = eventImportFileSchema.parse(body);
    return validateEventImport(
      await readSpreadsheetFile(file, "EVENT_IMPORT"),
      id,
      file.mapping,
    );
  }

  app.post(
    "/events/:id/import/preview",
    { preHandler: authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return analyzeImport(request.user.clinicId, id, request.body);
    },
  );
  app.post(
    "/events/:id/import",
    { preHandler: authenticate },
    async (request): Promise<EventImportResult> => {
      const { id } = idParams.parse(request.params);
      const analysis = await analyzeImport(
        request.user.clinicId,
        id,
        request.body,
      );
      if (analysis.errors[0])
        throw new DomainError(
          "EVENT_IMPORT_INVALID_FILE",
          analysis.errors[0],
          400,
        );
      const inputs = analysis.rows.flatMap((row) =>
        row.status === "valid" && row.input ? [row.input] : [],
      );
      const counts = await repository.importEventParticipants(
        request.user.clinicId,
        id,
        inputs,
      );
      return { ...counts, errors: analysis.totals.error };
    },
  );

  app.get("/events", { preHandler: authenticate }, async (request) =>
    repository.listEvents(request.user.clinicId),
  );
  app.get("/events/:id", { preHandler: authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    const event = await repository.getEvent(request.user.clinicId, id);
    if (!event) throw notFound();
    return event;
  });
  app.post("/events", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createEvent(
          request.user.clinicId,
          request.user.sub,
          eventInputSchema.parse(request.body),
        ),
      ),
  );
  app.put("/events/:id", { preHandler: authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    const event = await repository.updateEvent(
      request.user.clinicId,
      request.user.sub,
      id,
      eventInputSchema.parse(request.body),
    );
    if (!event) throw notFound();
    return event;
  });
}
