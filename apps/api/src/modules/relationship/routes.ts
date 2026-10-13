import {
  birthdayMonthSchema,
  contactActivityInputSchema,
  managementReportFilterSchema,
  relationshipSettingsSchema,
  saoPauloToday,
  satisfactionFilterSchema,
  satisfactionSurveyInputSchema,
  summarizeSatisfaction,
  type SatisfactionReport,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerRelationshipRoutes(context: RouteContext) {
  const { app, authenticate, repository, requestAccess } = context;

  app.get(
    "/relationship/settings",
    { preHandler: authenticate },
    async (request) =>
      repository.getRelationshipSettings(request.user.clinicId),
  );

  app.put(
    "/relationship/settings",
    { preHandler: authenticate },
    async (request) =>
      repository.updateRelationshipSettings(
        request.user.clinicId,
        relationshipSettingsSchema.parse(request.body),
      ),
  );

  app.get(
    "/relationship/suggestions",
    { preHandler: authenticate },
    async (request) =>
      repository.listContactSuggestions(
        request.user.clinicId,
        requestAccess.get(request)?.modules ?? [],
      ),
  );

  app.get(
    "/relationship/birthdays",
    { preHandler: authenticate },
    async (request) => {
      const query = z
        .object({ month: birthdayMonthSchema.optional() })
        .parse(request.query);
      return repository.listBirthdays(
        request.user.clinicId,
        query.month ?? saoPauloToday().slice(0, 7),
      );
    },
  );

  app.get(
    "/relationship/activities",
    { preHandler: authenticate },
    async (request) => {
      const query = z
        .object({ patientId: z.uuid().optional() })
        .parse(request.query);
      return repository.listContactActivities(
        request.user.clinicId,
        query.patientId,
      );
    },
  );

  app.post(
    "/relationship/activities",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createContactActivity(
            request.user.clinicId,
            request.user.sub,
            contactActivityInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/satisfaction",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createSatisfactionSurvey(
            request.user.clinicId,
            request.user.sub,
            satisfactionSurveyInputSchema.parse(request.body),
          ),
        ),
  );

  app.get(
    "/satisfaction",
    { preHandler: authenticate },
    async (request): Promise<SatisfactionReport> => {
      const query = satisfactionFilterSchema.parse(request.query);
      // Padrão: `to` = hoje (data da clínica); `from` = dia 1º do mês de `to`.
      const to = query.to ?? saoPauloToday();
      const period = managementReportFilterSchema.parse({
        from: query.from ?? `${to.slice(0, 7)}-01`,
        to,
      });
      const surveys = await repository.listSatisfactionSurveys(
        request.user.clinicId,
        period,
      );
      return {
        from: period.from,
        to: period.to,
        surveys,
        summary: summarizeSatisfaction(surveys),
      };
    },
  );
}
