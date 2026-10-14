import { z } from "zod";
import {
  leadFilterSchema,
  matchesLead,
  buildLeadInsights,
  leadContactInputSchema,
  leadInputSchema,
  leadMoveSchema,
  leadTaskInputSchema,
  leadTaskStatusSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerCommercialRoutes(context: RouteContext) {
  const { app, authenticate, repository } = context;

  app.get("/leads", { preHandler: authenticate }, async (request) => {
    const filter = leadFilterSchema.parse(request.query),
      settings = await repository.getClinicSettings(request.user.clinicId);
    return (await repository.listLeads(request.user.clinicId)).filter((lead) =>
      matchesLead(lead, filter, settings?.timezone),
    );
  });
  app.get("/leads/insights", { preHandler: authenticate }, async (request) => {
    const filter = leadFilterSchema.parse(request.query),
      settings = await repository.getClinicSettings(request.user.clinicId);
    return buildLeadInsights(
      (await repository.listLeads(request.user.clinicId)).filter((lead) =>
        matchesLead(lead, filter, settings?.timezone),
      ),
    );
  });

  app.post("/leads", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createLead(
          request.user.clinicId,
          leadInputSchema.parse(request.body),
        ),
      ),
  );

  app.put(
    "/leads/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const lead = await repository.updateLead(
        request.user.clinicId,
        request.user.sub,
        id,
        leadInputSchema.parse(request.body),
      );
      return (
        lead ??
        reply
          .status(404)
          .send({ code: "LEAD_NOT_FOUND", message: "Lead não encontrado." })
      );
    },
  );
  app.patch(
    "/leads/:id/stage",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = leadMoveSchema.parse(request.body);
      const lead = await repository.moveLead(
        request.user.clinicId,
        request.user.sub,
        id,
        input.stage,
        input.lostReason,
      );
      if (!lead)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return lead;
    },
  );

  app.post(
    "/leads/:id/convert",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversion = await repository.convertLead(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!conversion)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return conversion;
    },
  );

  app.get(
    "/leads/:id/activity",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const activity = await repository.getLeadActivity(
        request.user.clinicId,
        id,
      );
      if (!activity)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return activity;
    },
  );

  app.post(
    "/leads/:id/contacts",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const contact = await repository.createLeadContact(
        request.user.clinicId,
        request.user.sub,
        id,
        leadContactInputSchema.parse(request.body),
      );
      if (!contact)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return reply.status(201).send(contact);
    },
  );

  app.post(
    "/leads/:id/tasks",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const task = await repository.createLeadTask(
        request.user.clinicId,
        request.user.sub,
        id,
        leadTaskInputSchema.parse(request.body),
      );
      if (!task)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return reply.status(201).send(task);
    },
  );

  app.patch(
    "/lead-tasks/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const status = leadTaskStatusSchema.parse(
        (request.body as { status?: unknown }).status,
      );
      const task = await repository.updateLeadTaskStatus(
        request.user.clinicId,
        id,
        status,
      );
      if (!task)
        return reply.status(404).send({
          code: "LEAD_TASK_NOT_FOUND",
          message: "Tarefa não encontrada.",
        });
      return task;
    },
  );
}
