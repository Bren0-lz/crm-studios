import { z } from "zod";
import {
  communicationPreferenceInputSchema,
  manualMessageInputSchema,
  reminderGenerationInputSchema,
  type BroadcastResult,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerCommunicationsRoutes(context: RouteContext) {
  const {
    app,
    authenticate,
    repository,
    planBroadcast,
    broadcastResult,
    assertPermissions,
  } = context;
  app.post(
    "/communications/messages/:id/complete",
    { preHandler: authenticate },
    async (request) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { status } = z
        .object({ status: z.enum(["sent", "cancelled"]) })
        .parse(request.body);
      return repository.completeManualMessage(
        request.user.clinicId,
        request.user.sub,
        id,
        status,
      );
    },
  );

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
      if (input.payments !== false) assertPermissions(request, "finance.view");
      return repository.generateReminders(
        request.user.clinicId,
        input.referenceDate,
        input,
      );
    },
  );
}
