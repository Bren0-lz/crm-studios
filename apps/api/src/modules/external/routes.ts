import {
  BRANCH_HEADER,
  describeGroupSchedule,
  type ExternalApiIndex,
  type ExternalGroupDetails,
  type ExternalGroupMember,
  type ExternalGroupRow,
  type ExternalGroupsOverview,
  type ExternalPatientSummary,
  externalGroupsQuerySchema,
  externalPatientsQuerySchema,
  type GroupEnrollment,
  type GroupRevenueRow,
  groupRevenueOverview,
  type Patient,
  saoPauloToday,
} from "@crm/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import {
  externalEndpoints,
  type ProxiedEndpoint,
  proxiedEndpoints,
} from "./endpoints.js";

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

function groupRow({
  group,
  enrolled,
  freeSeats,
  sessionsPerMonth,
  currentInCents,
  potentialInCents,
}: GroupRevenueRow): ExternalGroupRow {
  return {
    id: group.id,
    ...(group.branchId ? { branchId: group.branchId } : {}),
    name: group.name,
    active: group.active,
    serviceId: group.serviceId,
    serviceName: group.serviceName,
    professionalId: group.professionalId,
    professionalName: group.professionalName,
    roomId: group.roomId,
    roomName: group.roomName,
    schedule: describeGroupSchedule(group.weeklySlots ?? []),
    weeklySlots: group.weeklySlots ?? [],
    capacity: group.capacity,
    enrolled,
    freeSeats,
    waitlistCount: group.waitlistCount,
    occupancyPercent: percent(enrolled, group.capacity),
    sessionsPerMonth,
    monthlyRevenueInCents: currentInCents,
    potentialMonthlyRevenueInCents: potentialInCents,
  };
}

function member(
  enrollment: GroupEnrollment,
  patient: Patient | undefined,
  monthlyInCents: number | null,
): ExternalGroupMember {
  return {
    enrollmentId: enrollment.id,
    patientId: enrollment.patientId,
    patientName: enrollment.patientName,
    ...(patient?.phone ? { phone: patient.phone } : {}),
    ...(patient?.email ? { email: patient.email } : {}),
    status: enrollment.status,
    ...(enrollment.queuePosition === undefined
      ? {}
      : { queuePosition: enrollment.queuePosition }),
    startsOn: enrollment.startsOn,
    monthlyInCents,
  };
}

/**
 * API externa de vendas (`/external/v1`), autenticada por chave de integração (ver
 * `authenticateApiKey`). Leituras próprias montam formatos estáveis; as demais rotas repassam
 * a chamada à rota interna, como o admin que criou a chave.
 */
export function registerExternalRoutes({
  app,
  authenticate,
  repository,
  integrationKeys,
}: RouteContext) {
  /** Turmas com ocupação e faturamento, pelo mesmo cálculo da aba "Visão geral" de Turmas. */
  async function groupsOverview(
    clinicId: string,
    actorUserId: string,
    includeInactive: boolean,
  ) {
    const today = saoPauloToday();
    const from = `${today}T00:00:00.000Z`;
    const to = new Date(Date.parse(from) + 86_400_000).toISOString();
    await repository.renewDuePatientPlans(clinicId, actorUserId);
    const [workspace, plans, services] = await Promise.all([
      repository.getGroupWorkspace(clinicId, from, to),
      repository.listPatientPlans(clinicId),
      repository.listServices(clinicId),
    ]);
    const groups = workspace.groups
      .filter((group) => includeInactive || group.active)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    return {
      today,
      workspace,
      plans,
      rows: groupRevenueOverview(
        groups,
        workspace.enrollments,
        plans,
        services,
        today,
      ),
    };
  }

  app.get(
    "/external/v1",
    { preHandler: authenticate },
    async (request): Promise<ExternalApiIndex> => {
      const key = integrationKeys.get(request)!;
      const settings = await repository.getClinicSettings(
        request.user.clinicId,
      );
      return {
        version: "v1",
        clinic: {
          id: request.user.clinicId,
          name: settings?.name ?? "Studios Aryana",
        },
        key: { id: key.id, name: key.name, scopes: key.scopes },
        endpoints: externalEndpoints,
      };
    },
  );

  app.get(
    "/external/v1/groups",
    { preHandler: authenticate },
    async (request): Promise<ExternalGroupsOverview> => {
      const { includeInactive } = externalGroupsQuerySchema.parse(
        request.query,
      );
      const { today, rows } = await groupsOverview(
        request.user.clinicId,
        request.user.sub,
        includeInactive,
      );
      const groups = rows.map(groupRow);
      const sum = (pick: (row: ExternalGroupRow) => number) =>
        groups.reduce((total, row) => total + pick(row), 0);
      const capacity = sum((row) => row.capacity);
      const enrolled = sum((row) => row.enrolled);
      return {
        referenceDate: today,
        totals: {
          groups: groups.length,
          capacity,
          enrolled,
          freeSeats: sum((row) => row.freeSeats),
          waitlistCount: sum((row) => row.waitlistCount),
          occupancyPercent: percent(enrolled, capacity),
          monthlyRevenueInCents: sum((row) => row.monthlyRevenueInCents),
          potentialMonthlyRevenueInCents: sum(
            (row) => row.potentialMonthlyRevenueInCents,
          ),
        },
        groups,
      };
    },
  );

  app.get(
    "/external/v1/groups/:id",
    { preHandler: authenticate },
    async (request): Promise<ExternalGroupDetails> => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const clinicId = request.user.clinicId;
      const { workspace, rows } = await groupsOverview(
        clinicId,
        request.user.sub,
        true,
      );
      const row = rows.find((item) => item.group.id === id);
      if (!row)
        throw new DomainError("GROUP_NOT_FOUND", "Turma não encontrada.", 404);
      const patients = new Map(
        (await repository.listPatients(clinicId)).map((patient) => [
          patient.id,
          patient,
        ]),
      );
      return {
        ...groupRow(row),
        members: row.members.map(({ enrollment, monthlyInCents }) =>
          member(enrollment, patients.get(enrollment.patientId), monthlyInCents),
        ),
        waitlist: workspace.enrollments
          .filter((item) => item.groupId === id && item.status === "waitlisted")
          .sort(
            (left, right) =>
              (left.queuePosition ?? 0) - (right.queuePosition ?? 0),
          )
          .map((enrollment) =>
            member(enrollment, patients.get(enrollment.patientId), null),
          ),
      };
    },
  );

  app.get(
    "/external/v1/patients",
    { preHandler: authenticate },
    async (request): Promise<ExternalPatientSummary[]> => {
      const { search, limit } = externalPatientsQuerySchema.parse(
        request.query,
      );
      const clinicId = request.user.clinicId;
      const today = saoPauloToday();
      const patients = (await repository.listPatients(clinicId, search))
        .filter((patient) => !patient.mergedIntoPatientId)
        .slice(0, limit);
      if (!patients.length) return [];
      const [plans, workspace] = await Promise.all([
        repository.listPatientPlans(clinicId),
        repository.getGroupWorkspace(
          clinicId,
          `${today}T00:00:00.000Z`,
          `${today}T00:00:00.001Z`,
        ),
      ]);
      const groupNames = new Map(
        workspace.groups.map((group) => [group.id, group.name]),
      );
      return patients.map((patient) => ({
        id: patient.id,
        fullName: patient.fullName,
        phone: patient.phone,
        ...(patient.whatsapp ? { whatsapp: patient.whatsapp } : {}),
        ...(patient.email ? { email: patient.email } : {}),
        tags: patient.tags,
        activePlans: plans
          .filter(
            (plan) =>
              plan.patientId === patient.id &&
              plan.status === "active" &&
              plan.validFrom <= today &&
              (!plan.validUntil || plan.validUntil >= today),
          )
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            ...(plan.validUntil ? { validUntil: plan.validUntil } : {}),
          })),
        activeGroups: workspace.enrollments
          .filter(
            (item) =>
              item.patientId === patient.id && item.status !== "cancelled",
          )
          .map((item) => ({
            groupId: item.groupId,
            groupName: groupNames.get(item.groupId) ?? "",
            status: item.status,
          })),
      }));
    },
  );

  /**
   * Repassa a chamada à rota interna como o admin dono da chave (token interno de 1 minuto,
   * que nunca sai do processo): a rota interna valida, aplica a regra, confere as permissões
   * dele e grava o histórico. Filial (`X-Branch-Id`), query e corpo seguem iguais.
   */
  function forward(endpoint: ProxiedEndpoint) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, string>;
      let url = endpoint.target.replace(/:(\w+)/g, (_match, name: string) =>
        encodeURIComponent(params[name] ?? ""),
      );
      const query = request.url.split("?")[1];
      if (query) url += `${url.includes("?") ? "&" : "?"}${query}`;
      const token = app.jwt.sign(
        {
          sub: request.user.sub,
          clinicId: request.user.clinicId,
          role: request.user.role,
          sessionVersion: request.user.sessionVersion ?? 0,
        },
        { expiresIn: "1m" },
      );
      const branch = request.headers[BRANCH_HEADER];
      const hasBody = request.body !== undefined && request.body !== null;
      const response = await app.inject({
        method: endpoint.method,
        url,
        headers: {
          authorization: `Bearer ${token}`,
          ...(typeof branch === "string" ? { [BRANCH_HEADER]: branch } : {}),
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        ...(hasBody ? { payload: JSON.stringify(request.body) } : {}),
      });
      reply.status(response.statusCode);
      if (response.statusCode === 204) return reply.send();
      const type = response.headers["content-type"];
      if (type) reply.header("content-type", type);
      return reply.send(response.rawPayload);
    };
  }

  for (const endpoint of proxiedEndpoints)
    app.route({
      method: endpoint.method,
      url: endpoint.path,
      preHandler: authenticate,
      handler: forward(endpoint),
    });
}
