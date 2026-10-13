import {
  assessmentTemplateInputSchema,
  clinicalAddendumInputSchema,
  clinicalAssessmentInputSchema,
  clinicalAttachmentInputSchema,
  clinicalMeasurementInputSchema,
  clinicalRecordInputSchema,
  therapeuticGoalInputSchema,
  therapeuticGoalStatusSchema,
  treatmentClosureInputSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { optionalPatientFilterSchema } from "../../infrastructure/route-utils.js";

export function registerClinicalRoutes(context: RouteContext) {
  const { app, authenticate, repository } = context;

  app.get(
    "/clinical-records",
    { preHandler: authenticate },
    async (request) => {
      const query = optionalPatientFilterSchema.parse(request.query);
      return repository.listClinicalRecords(
        request.user.clinicId,
        query.patientId,
      );
    },
  );

  app.post(
    "/clinical-records",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.saveClinicalRecord(
            request.user.clinicId,
            request.user.sub,
            clinicalRecordInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/clinical-records/:id/finalize",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const record = await repository.finalizeClinicalRecord(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!record)
        return reply.status(404).send({
          code: "CLINICAL_RECORD_NOT_FOUND",
          message: "Prontuário não encontrado.",
        });
      return record;
    },
  );

  app.get(
    "/clinical-records/:id/revisions",
    { preHandler: authenticate },
    async (request) => {
      const { id } = request.params as { id: string };
      return repository.listClinicalRecordRevisions(request.user.clinicId, id);
    },
  );

  app.get(
    "/clinical-workspace/:patientId",
    { preHandler: authenticate },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      const workspace = await repository.getClinicalWorkspace(
        request.user.clinicId,
        patientId,
        request.user.sub,
      );
      if (!workspace)
        return reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        });
      return workspace;
    },
  );

  app.get(
    "/clinical-workspace/:patientId/export",
    { preHandler: authenticate },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      const workspace = await repository.getClinicalWorkspace(
        request.user.clinicId,
        patientId,
        request.user.sub,
        "export",
      );
      if (!workspace)
        return reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        });
      reply.header(
        "Content-Disposition",
        `attachment; filename="prontuario-${patientId}.json"`,
      );
      return workspace;
    },
  );

  app.get(
    "/clinical-workspace/:patientId/access-events",
    { preHandler: authenticate },
    async (request) => {
      const { patientId } = request.params as { patientId: string };
      return repository.listClinicalAccessEvents(
        request.user.clinicId,
        patientId,
      );
    },
  );

  app.post(
    "/clinical-attachments",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createClinicalAttachment(
            request.user.clinicId,
            request.user.sub,
            clinicalAttachmentInputSchema.parse(request.body),
          ),
        ),
  );

  app.get(
    "/clinical-attachments/:id/content",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const attachment = await repository.getClinicalAttachmentContent(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!attachment)
        return reply.status(404).send({
          code: "CLINICAL_ATTACHMENT_NOT_FOUND",
          message: "Anexo clínico não encontrado.",
        });
      return attachment;
    },
  );

  app.post(
    "/clinical-addenda",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createClinicalAddendum(
            request.user.clinicId,
            request.user.sub,
            clinicalAddendumInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/assessment-templates",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createAssessmentTemplate(
            request.user.clinicId,
            assessmentTemplateInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/clinical-assessments",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createClinicalAssessment(
            request.user.clinicId,
            request.user.sub,
            clinicalAssessmentInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/therapeutic-goals",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createTherapeuticGoal(
            request.user.clinicId,
            request.user.sub,
            therapeuticGoalInputSchema.parse(request.body),
          ),
        ),
  );

  app.patch(
    "/therapeutic-goals/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const goal = await repository.updateTherapeuticGoalStatus(
        request.user.clinicId,
        id,
        therapeuticGoalStatusSchema.parse(
          (request.body as { status?: unknown })?.status,
        ),
      );
      if (!goal)
        return reply.status(404).send({
          code: "THERAPEUTIC_GOAL_NOT_FOUND",
          message: "Objetivo terapêutico não encontrado.",
        });
      return goal;
    },
  );

  app.post(
    "/clinical-measurements",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createClinicalMeasurement(
            request.user.clinicId,
            request.user.sub,
            clinicalMeasurementInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/treatment-closures",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createTreatmentClosure(
            request.user.clinicId,
            request.user.sub,
            treatmentClosureInputSchema.parse(request.body),
          ),
        ),
  );
}
