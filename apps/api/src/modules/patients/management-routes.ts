import {
  patientInactivationPreviewSchema,
  patientInactivationSchema,
  patientMergePreviewSchema,
  patientMergeSchema,
  patientStatusUpdateSchema,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { automaticPatientTagger } from "./automatic-tags.js";

export function registerPatientManagementRoutes({
  app,
  authenticate,
  repository,
  requestAccess,
}: RouteContext) {
  app.get(
    "/patients/:id/emergency-contact",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const patient = await repository.getPatient(request.user.clinicId, id);
      return patient
        ? {
            name: patient.emergencyContactName ?? "",
            phone: patient.emergencyContactPhone ?? "",
            whatsapp: patient.emergencyContactWhatsapp ?? "",
          }
        : reply.status(404).send({
            code: "PATIENT_NOT_FOUND",
            message: "Cliente não encontrado.",
          });
    },
  );
  app.get(
    "/patients/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const patient = await repository.getPatient(request.user.clinicId, id);
      const tag = await automaticPatientTagger(
        repository,
        request.user.clinicId,
        requestAccess.get(request)?.modules ?? [],
      );
      return (
        (patient && tag(patient)) ??
        reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        })
      );
    },
  );
  app.patch(
    "/patients/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { status } = patientStatusUpdateSchema.parse(request.body);
      return (
        (await repository.setPatientStatus(
          request.user.clinicId,
          request.user.sub,
          id,
          status,
        )) ??
        reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        })
      );
    },
  );
  app.post(
    "/patients/inactivation/preview",
    { preHandler: authenticate },
    async (request) =>
      repository.previewInactivePatients(
        request.user.clinicId,
        patientInactivationPreviewSchema.parse(request.body).months,
      ),
  );
  app.post(
    "/patients/inactivation",
    { preHandler: authenticate },
    async (request) => {
      const { months, patientIds } = patientInactivationSchema.parse(
        request.body,
      );
      return repository.inactivatePatients(
        request.user.clinicId,
        request.user.sub,
        months,
        patientIds,
      );
    },
  );
  app.post(
    "/patients/merge/preview",
    { preHandler: authenticate },
    async (request) => {
      const { sourceId, targetId } = patientMergePreviewSchema.parse(
        request.body,
      );
      return repository.previewPatientMerge(
        request.user.clinicId,
        sourceId,
        targetId,
      );
    },
  );
  app.post("/patients/merge", { preHandler: authenticate }, async (request) =>
    repository.mergePatients(
      request.user.clinicId,
      request.user.sub,
      patientMergeSchema.parse(request.body),
    ),
  );
}
