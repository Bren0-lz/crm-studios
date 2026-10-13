import {
  communicationPreferenceInputSchema,
  manualMessageInputSchema,
  reminderGenerationInputSchema,
  type BroadcastResult,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerCommunicationsRoutes(context: RouteContext) {
  const { app, authenticate, repository, planBroadcast, broadcastResult } =
    context;

  app.get("/communications", { preHandler: authenticate }, async (request) =>
    repository.getCommunicationCenter(request.user.clinicId),
  );

  app.put(
    "/communications/preferences",
    { preHandler: authenticate },
    async (request) =>
      repository.setCommunicationPreference(
        request.user.clinicId,
        communicationPreferenceInputSchema.parse(request.body),
      ),
  );

  app.post(
    "/communications/messages",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.queueManualMessage(
            request.user.clinicId,
            manualMessageInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/communications/broadcast/preview",
    { preHandler: authenticate },
    async (request): Promise<BroadcastResult> => {
      const { input, plan } = await planBroadcast(
        request.user.clinicId,
        request.body,
      );
      return broadcastResult(true, input, plan, plan.drafts.length);
    },
  );

  app.post(
    "/communications/broadcast",
    { preHandler: authenticate },
    async (request, reply) => {
      const { input, plan } = await planBroadcast(
        request.user.clinicId,
        request.body,
      );
      const queued = await repository.queueBroadcastMessages(
        request.user.clinicId,
        plan.drafts,
      );
      const result: BroadcastResult = broadcastResult(
        false,
        input,
        plan,
        queued,
      );
      return reply.status(201).send(result);
    },
  );

  app.post(
    "/communications/reminders/generate",
    { preHandler: authenticate },
    async (request) => {
      const input = reminderGenerationInputSchema.parse(request.body);
      return repository.generateReminders(
        request.user.clinicId,
        input.referenceDate,
      );
    },
  );
}
