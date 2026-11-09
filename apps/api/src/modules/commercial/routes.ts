import { z } from "zod";
import {
  leadFilterSchema,
  matchesLead,
  leadContactInputSchema,
  leadDuplicateQuerySchema,
  leadInputSchema,
  eventLeadInputSchema,
  leadConversionInputSchema,
  leadMoveSchema,
  leadTaskInputSchema,
  leadTaskStatusSchema,
  leadStagesInputSchema,
  leadStageParamSchema,
  parseLeadPageQuery,
  type LeadBoard,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { stageNotFoundError } from "./stages.js";

export function registerCommercialRoutes(context: RouteContext) {
  const { app, authenticate, repository, events } = context;

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
    return repository.summarizeLeads(
      request.user.clinicId,
      filter,
      settings?.timezone,
    );
  });

  // Funil paginado: cada coluna traz só a primeira página e o total da etapa, para não
  // carregar todos os leads da clínica de uma vez.
  app.get(
    "/leads/board",
    { preHandler: authenticate },
    async (request): Promise<LeadBoard> => {
      const { filter, page } = parseLeadPageQuery(request.query),
        settings = await repository.getClinicSettings(request.user.clinicId),
        stages = await repository.listLeadStages(request.user.clinicId);
      return {
        columns: await Promise.all(
          stages.map(({ stage }) =>
            repository.listLeadStagePage(
              request.user.clinicId,
              stage,
              filter,
              { ...page, offset: 0 },
              settings?.timezone,
            ),
          ),
        ),
      };
    },
  );

  app.get(
    "/leads/board/:stage",
    { preHandler: authenticate },
    async (request) => {
      const { stage } = leadStageParamSchema.parse(request.params),
        { filter, page } = parseLeadPageQuery(request.query),
        settings = await repository.getClinicSettings(request.user.clinicId);
      if (
        !(await repository.listLeadStages(request.user.clinicId)).some(
          (item) => item.stage === stage,
        )
      )
        throw stageNotFoundError();
      return repository.listLeadStagePage(
        request.user.clinicId,
        stage,
        filter,
        page,
        settings?.timezone,
      );
    },
  );

  app.get(
    "/leads/filter-options",
    { preHandler: authenticate },
    async (request) => repository.listLeadFilterOptions(request.user.clinicId),
  );

  // Etapas do funil da clínica: nomes, etapas novas e removidas e a etapa final.
  app.get("/leads/stages", { preHandler: authenticate }, async (request) =>
    repository.listLeadStages(request.user.clinicId),
  );
  app.put("/leads/stages", { preHandler: authenticate }, async (request) =>
    repository.saveLeadStages(
      request.user.clinicId,
      leadStagesInputSchema.parse(request.body),
    ),
  );

  app.get(
    "/leads/duplicates",
    { preHandler: authenticate },
    async (request) => ({
      matches: await repository.findLeadDuplicates(
        request.user.clinicId,
        leadDuplicateQuerySchema.parse(request.query),
      ),
    }),
  );

  app.post("/leads", { preHandler: authenticate }, async (request, reply) => {
    const participant =
      typeof request.body === "object" &&
      request.body !== null &&
      "eventId" in request.body;
    const input = (participant ? eventLeadInputSchema : leadInputSchema).parse(
      request.body,
    );
    return reply
      .status(201)
      .send(await repository.createLead(request.user.clinicId, input));
  });

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
        leadConversionInputSchema.parse(request.body ?? {}),
      );
      if (!conversion)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      // Só cadastro criado é cliente novo; conversão para cliente já existente não avisa.
      if (!conversion.reusedExisting)
        await events.publish({
          type: "patient.created",
          clinicId: request.user.clinicId,
          actorUserId: request.user.sub,
          patientId: conversion.patient.id,
          fullName: conversion.patient.fullName,
          origin: "lead",
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
