import { automaticPatientTagger } from "./automatic-tags.js";
import { clientSegments } from "./client-segments.js";
import {
  matchesPatientProfile,
  matchesPatientSegment,
  guidedPatientInputSchema,
  isAutomaticPatientTag,
  OVERDUE_PAYMENT_TAG,
  patientExportFilterSchema,
  patientInputSchema,
  patientListQuerySchema,
  patientTagInputSchema,
  patientTagUpdateSchema,
  saoPauloToday,
  type AppModule,
  type GuidedPatientResult,
  type PatientImportResult,
  type PatientOption,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import {
  filterPatientsForExport,
  patientsToCsv,
  patientsToXlsx,
} from "./patient-export.js";

export function registerPatientsRoutes(context: RouteContext) {
  const {
    app,
    authenticate,
    repository,
    withConfiguredTags,
    assertPermissions,
    assertNoHoliday,
    assertServiceAvailable,
    patientTagNotFound,
    analyzePatientImport,
    requestAccess,
  } = context;

  const taggerFor = (request: Parameters<typeof requestAccess.get>[0]) =>
    automaticPatientTagger(
      repository,
      request.user.clinicId,
      requestAccess.get(request)?.modules ?? [],
    );

  /** "Pagamento atrasado" é automática (QC7): não pode ser criada nem renomeada à mão. */
  function assertManualTagName(name: string | undefined) {
    if (name !== undefined && isAutomaticPatientTag(name))
      throw new DomainError(
        "PATIENT_TAG_AUTOMATIC",
        `“${OVERDUE_PAYMENT_TAG}” é uma etiqueta automática: aparece sozinha para clientes com parcela vencida.`,
        400,
      );
  }

  app.get("/patients/segments", { preHandler: authenticate }, async (request) =>
    clientSegments(
      repository,
      request.user.clinicId,
      requestAccess.get(request)?.permissions.includes("finance.view"),
    ),
  );
  app.get("/patients", { preHandler: authenticate }, async (request) => {
    const query = patientListQuerySchema.parse(request.query);
    const clinicId = request.user.clinicId;
    if (query.segment === "pending" || query.segment === "overdue")
      assertPermissions(request, "finance.view");
    const summary = query.segment
      ? await clientSegments(
          repository,
          clinicId,
          requestAccess.get(request)?.permissions.includes("finance.view"),
        )
      : [];
    const tag = await taggerFor(request);
    const patients = (await repository.listPatients(clinicId, query.search))
      .map(tag)
      .filter(
      (patient) =>
        matchesPatientProfile(patient, query) &&
        matchesPatientSegment(
          summary.find((item) => item.patientId === patient.id),
          query.segment,
        ),
    );
    if (!query.withoutGroup) return patients;
    const ids = new Set(
      await repository.listSubscriberIdsWithoutGroup(clinicId),
    );
    return patients.filter((patient) => ids.has(patient.id));
  });

  // Lista mínima de apoio (D11): só id, nome e etiquetas, para telas que escolhem o cliente.
  app.get(
    "/patients/options",
    { preHandler: authenticate },
    async (request) => {
      const { search } = patientListQuerySchema
        .pick({ search: true })
        .parse(request.query);
      const [patients, tag] = await Promise.all([
        repository.listPatients(request.user.clinicId, search),
        taggerFor(request),
      ]);
      return patients.map(tag).map(({ id, fullName, tags }): PatientOption => ({
        id,
        fullName,
        tags,
      }));
    },
  );

  app.get(
    "/patients/export",
    { preHandler: authenticate },
    async (request, reply) => {
      const { format, columns, ...filters } = patientExportFilterSchema.parse(
        request.query,
      );
      const clinicId = request.user.clinicId;
      const today = saoPauloToday();
      if (filters.segment === "pending" || filters.segment === "overdue")
        assertPermissions(request, "finance.view");
      const segments = filters.segment
        ? await clientSegments(
            repository,
            clinicId,
            requestAccess.get(request)?.permissions.includes("finance.view"),
          )
        : [];
      const [patients, plans, withoutGroupIds, tag] = await Promise.all([
        repository.listPatients(clinicId, filters.search),
        filters.activePlan === undefined
          ? Promise.resolve([])
          : repository.listPatientPlans(clinicId),
        filters.withoutGroup
          ? repository.listSubscriberIdsWithoutGroup(clinicId)
          : Promise.resolve(null),
        taggerFor(request),
      ]);
      const filtered = filterPatientsForExport(
        patients.map(tag).filter((patient) =>
          matchesPatientSegment(
            segments.find((item) => item.patientId === patient.id),
            filters.segment,
          ),
        ),
        plans,
        { format, columns, ...filters },
        today,
      );
      const withoutGroup = withoutGroupIds && new Set(withoutGroupIds);
      const rows = withoutGroup
        ? filtered.filter((patient) => withoutGroup.has(patient.id))
        : filtered;
      await repository.recordAdminAuditEvent(
        clinicId,
        request.user.sub,
        "patients.exported",
        "patient",
        { format, columns, filters, count: rows.length },
      );
      const fileName = `clientes-${today}.${format}`;
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      if (format === "xlsx")
        return reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .send(await patientsToXlsx(rows, columns));
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .send(patientsToCsv(rows, columns));
    },
  );

  app.post(
    "/patients",
    { preHandler: authenticate },
    async (request, reply) => {
      const clinicId = request.user.clinicId;
      const patient = await repository.createPatient(
        clinicId,
        await withConfiguredTags(
          clinicId,
          patientInputSchema.parse(request.body),
        ),
      );
      return reply.status(201).send(patient);
    },
  );

  /**
   * Cadastro guiado: o `ROUTE_ACCESS` exige editar Clientes; aqui exige também editar o módulo
   * do passo (Agenda, Planos e, com turma, Turmas), com o mesmo 403 das guardas.
   */
  app.post(
    "/patients/guided",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = guidedPatientInputSchema.parse(request.body);
      assertPermissions(
        request,
        "patients.create",
        ...(input.next === "demonstration" ? ["agenda.create" as const] : []),
        ...(input.next === "plan" || input.next === "single"
          ? ["plans.create" as const]
          : []),
        ...(input.next === "plan" && input.groupId
          ? ["groups.enroll" as const]
          : []),
      );
      const clinicId = request.user.clinicId;
      const patient = await withConfiguredTags(clinicId, input.patient);
      if (input.next === "demonstration") {
        await assertNoHoliday(clinicId, [input.appointment.startsAt]);
        await assertServiceAvailable(clinicId, [input.appointment]);
      }
      const result: GuidedPatientResult =
        await repository.createPatientWithNextStep(clinicId, request.user.sub, {
          ...input,
          patient,
        });
      return reply.status(201).send(result);
    },
  );

  app.get("/patient-tags", { preHandler: authenticate }, async (request) =>
    repository.listPatientTags(request.user.clinicId),
  );

  app.post(
    "/patient-tags",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = patientTagInputSchema.parse(request.body);
      assertManualTagName(input.name);
      return reply
        .status(201)
        .send(
          await repository.createPatientTag(
            request.user.clinicId,
            request.user.sub,
            input,
          ),
        );
    },
  );

  app.patch(
    "/patient-tags/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = patientTagUpdateSchema.parse(request.body);
      assertManualTagName(input.name);
      const tag = z.uuid().safeParse(id).success
        ? await repository.updatePatientTag(
            request.user.clinicId,
            request.user.sub,
            id,
            input,
          )
        : null;
      if (!tag) return reply.status(404).send(patientTagNotFound);
      return tag;
    },
  );

  app.delete(
    "/patient-tags/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted =
        z.uuid().safeParse(id).success &&
        (await repository.deletePatientTag(
          request.user.clinicId,
          request.user.sub,
          id,
        ));
      if (!deleted) return reply.status(404).send(patientTagNotFound);
      return reply.status(204).send();
    },
  );

  app.post(
    "/patients/import/preview",
    { preHandler: authenticate },
    async (request) =>
      analyzePatientImport(request.user.clinicId, request.body),
  );

  app.post(
    "/patients/import",
    { preHandler: authenticate },
    async (request): Promise<PatientImportResult> => {
      const analysis = await analyzePatientImport(
        request.user.clinicId,
        request.body,
      );
      const [firstError] = analysis.errors;
      if (firstError)
        throw new DomainError("PATIENT_IMPORT_INVALID_FILE", firstError, 400);
      const inputs = analysis.rows.flatMap((row) =>
        row.status === "valid" && row.input ? [row.input] : [],
      );
      const { created, skipped } = await repository.importPatients(
        request.user.clinicId,
        inputs,
      );
      return {
        created,
        skipped: skipped + analysis.totals.duplicate,
        errors: analysis.totals.error,
      };
    },
  );

  app.put(
    "/patients/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const patient = await repository.updatePatient(
        request.user.clinicId,
        id,
        await withConfiguredTags(
          request.user.clinicId,
          patientInputSchema.parse(request.body),
        ),
      );
      if (!patient)
        return reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        });
      return (await taggerFor(request))(patient);
    },
  );

  app.get(
    "/patients/:id/timeline",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const timeline = z.uuid().safeParse(id).success
        ? await repository.getPatientTimeline(request.user.clinicId, id)
        : null;
      if (!timeline)
        return reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        });
      const sourceModules: Record<string, AppModule> = {
        appointment: "agenda",
        plan_created: "plans",
        plan_renewed: "plans",
        plan_cancelled: "plans",
        payment: "finance",
        payment_reversal: "finance",
        contact: "relationship",
        message: "communications",
        satisfaction: "agenda",
      };
      return timeline.filter((item) =>
        requestAccess.get(request)?.modules.includes(sourceModules[item.kind]!),
      );
    },
  );
}
