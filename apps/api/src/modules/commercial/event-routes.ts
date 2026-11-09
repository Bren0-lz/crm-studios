import {
  eventInputSchema,
  eventListQuerySchema,
  eventImportFileSchema,
  type EventImportResult,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import {
  readSpreadsheetFile,
  xlsxContentType,
} from "../../infrastructure/spreadsheet.js";
import { DEFAULT_CLINIC_TIMEZONE, clinicDateOf } from "../finance/daily-cash.js";
import { eventParticipantsToXlsx } from "./event-export.js";
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
    repository.listEvents(
      request.user.clinicId,
      eventListQuerySchema.parse(request.query),
    ),
  );
  app.get("/events/:id", { preHandler: authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    const event = await repository.getEvent(request.user.clinicId, id);
    if (!event) throw notFound();
    return event;
  });
  // Participantes visíveis na filial ativa (a leitura do evento já filtra).
  app.get(
    "/events/:id/participants/export.xlsx",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { clinicId } = request.user;
      const [event, stages, settings] = await Promise.all([
        repository.getEvent(clinicId, id),
        repository.listLeadStages(clinicId),
        repository.getClinicSettings(clinicId),
      ]);
      if (!event) throw notFound();
      const timeZone = settings?.timezone || DEFAULT_CLINIC_TIMEZONE;
      const fileName = `participantes-${clinicDateOf(new Date(), timeZone)}.xlsx`;
      return reply
        .header("Content-Type", xlsxContentType)
        .header("Content-Disposition", `attachment; filename="${fileName}"`)
        .send(
          await eventParticipantsToXlsx(event.participants, stages, timeZone),
        );
    },
  );
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
  // Os participantes continuam como leads (sem evento).
  app.delete(
    "/events/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      if (!(await repository.deleteEvent(request.user.clinicId, id)))
        throw notFound();
      return reply.status(204).send();
    },
  );
  // Remover participante = tirá-lo do evento; o lead continua no funil.
  app.delete(
    "/events/:id/participants/:leadId",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id, leadId } = z
        .object({ id: z.uuid(), leadId: z.uuid() })
        .parse(request.params);
      const { clinicId } = request.user;
      if (!(await repository.getEvent(clinicId, id))) throw notFound();
      if (!(await repository.removeEventParticipant(clinicId, id, leadId)))
        throw new DomainError(
          "EVENT_PARTICIPANT_NOT_FOUND",
          "Participante não encontrado no evento.",
          404,
        );
      return reply.status(204).send();
    },
  );
}
