import {
  BRANCH_HEADER,
  describeGroupSchedule,
  type ExternalApiIndex,
  type ExternalBranch,
  type ExternalGroupDetails,
  type ExternalGroupMember,
  type ExternalGroupRow,
  type ExternalGroupsOverview,
  type ExternalLoginResult,
  type ExternalOverdueReport,
  type ExternalOverdueRow,
  externalOverdueBand,
  type ExternalPatientDetails,
  type ExternalPatientPayments,
  externalPatientPaymentsQuerySchema,
  type ExternalPatientRecord,
  type ExternalPatientSummary,
  externalGroupsQuerySchema,
  externalPatientsQuerySchema,
  type GroupEnrollment,
  type GroupRevenueRow,
  groupRevenueOverview,
  isOverdueReceivable,
  loginSchema,
  type MemberOverdue,
  type Patient,
  type PatientTab,
  patientProfileLabels,
  type Receivable,
  saoPauloToday,
  type Service,
  type ServiceBusinessLine,
  type ServiceLineRef,
  singlePlanSessionPrices,
} from "@crm/contracts";
import { compare } from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import { automaticPatientTagger } from "../patients/automatic-tags.js";
import { patientPayments } from "./patient-payments.js";
import {
  externalEndpoints,
  type ProxiedEndpoint,
  proxiedEndpoints,
} from "./endpoints.js";

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

/** Parcelas vencidas somadas por cliente (`isOverdueReceivable`, fuso da clínica). */
interface PatientOverdue {
  name: string;
  amount: number;
  installments: number;
  oldest: string;
}

function overdueByPatient(
  receivables: readonly Receivable[],
  today: string,
): Map<string, PatientOverdue> {
  const byPatient = new Map<string, PatientOverdue>();
  for (const receivable of receivables) {
    if (!isOverdueReceivable(receivable, today)) continue;
    const current = byPatient.get(receivable.patientId);
    if (current) {
      current.amount += receivable.amountInCents;
      current.installments += 1;
      if (receivable.dueDate < current.oldest)
        current.oldest = receivable.dueDate;
    } else
      byPatient.set(receivable.patientId, {
        name: receivable.patientName,
        amount: receivable.amountInCents,
        installments: 1,
        oldest: receivable.dueDate,
      });
  }
  return byPatient;
}

/** Serviços e linhas dos produtos de onde vêm as parcelas vencidas de um cliente. */
interface OverdueOrigin {
  services: Map<string, ServiceLineRef>;
  productLines: Set<ServiceBusinessLine | null>;
}

/**
 * Origem das parcelas vencidas por cliente, pela mesma regra de `overdueByPatient`. Serviços:
 * os de `Receivable.services` (do plano ou os atendimentos da comanda), com nome e linha do
 * cadastro (inclusive inativo). Produtos: os itens da comanda cuja cobrança é a parcela
 * (`PatientTab.receivableId`). Parcela avulsa e saldo de baixa parcial de comanda não têm
 * vínculo com a origem e ficam de fora.
 */
function overdueOrigins(
  receivables: readonly Receivable[],
  today: string,
  services: ReadonlyMap<string, Service>,
  tabProductLines: ReadonlyMap<string, (ServiceBusinessLine | null)[]>,
) {
  const byPatient = new Map<string, OverdueOrigin>();
  for (const receivable of receivables) {
    if (!isOverdueReceivable(receivable, today)) continue;
    const origin = byPatient.get(receivable.patientId) ?? {
      services: new Map(),
      productLines: new Set(),
    };
    for (const service of receivable.services ?? [])
      if (!origin.services.has(service.id)) {
        const registered = services.get(service.id);
        origin.services.set(service.id, {
          id: service.id,
          name: registered?.name ?? service.name,
          businessLine: registered?.businessLine ?? null,
        });
      }
    for (const line of tabProductLines.get(receivable.id) ?? [])
      origin.productLines.add(line);
    byPatient.set(receivable.patientId, origin);
  }
  return byPatient;
}

/** Dias corridos entre o vencimento mais antigo e hoje (aaaa-mm-dd). */
function daysSince(oldest: string, today: string) {
  return Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) -
      Date.parse(`${oldest}T00:00:00.000Z`)) /
      86_400_000,
  );
}

/**
 * Linha da turma. `businessLine` vem do serviço da turma (`null` sem classificação); a
 * inadimplência (matriculados ativos com parcela vencida e a soma delas) só entra quando
 * `overdue` é informado (acesso ao Financeiro).
 */
function groupRow(
  {
    group,
    members,
    enrolled,
    freeSeats,
    sessionsPerMonth,
    currentInCents,
    potentialInCents,
  }: GroupRevenueRow,
  businessLines: ReadonlyMap<string, ServiceBusinessLine | null>,
  overdue?: ReadonlyMap<string, PatientOverdue>,
): ExternalGroupRow {
  const late = overdue
    ? members.flatMap(({ enrollment }) => {
        const item = overdue.get(enrollment.patientId);
        return item ? [item] : [];
      })
    : [];
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
    // `members` vem por nome; o painel mostra na ordem de inscrição (sort estável no empate).
    memberNames: [...members]
      .sort((left, right) =>
        left.enrollment.enrolledAt.localeCompare(right.enrollment.enrolledAt),
      )
      .map(({ enrollment }) => enrollment.patientName),
    occupancyPercent: percent(enrolled, group.capacity),
    sessionsPerMonth,
    monthlyRevenueInCents: currentInCents,
    potentialMonthlyRevenueInCents: potentialInCents,
    // Serviço sem classificação ou não encontrado: `null` ("Outros" no painel).
    businessLine: businessLines.get(group.serviceId) ?? null,
    ...(overdue
      ? {
          overdueMembers: late.length,
          overdueInCents: late.reduce((total, item) => total + item.amount, 0),
        }
      : {}),
  };
}

/**
 * Inscrito da turma. O contato só entra com `patient` (quem chama tem acesso a Clientes); o
 * atraso, só para inscrito ativo quando `overdue` é informado (acesso ao Financeiro).
 */
function member(
  enrollment: GroupEnrollment,
  patient: Patient | undefined,
  monthlyInCents: number | null,
  today: string,
  overdue?: ReadonlyMap<string, PatientOverdue>,
): ExternalGroupMember {
  const late =
    enrollment.status === "active"
      ? overdue?.get(enrollment.patientId)
      : undefined;
  const memberOverdue: MemberOverdue | undefined = late && {
    amountInCents: late.amount,
    installments: late.installments,
    oldestDueDate: late.oldest,
    daysOverdue: daysSince(late.oldest, today),
  };
  return {
    enrollmentId: enrollment.id,
    patientId: enrollment.patientId,
    patientName: enrollment.patientName,
    ...(patient?.phone ? { phone: patient.phone } : {}),
    ...(patient?.whatsapp ? { whatsapp: patient.whatsapp } : {}),
    ...(patient?.email ? { email: patient.email } : {}),
    status: enrollment.status,
    ...(enrollment.queuePosition === undefined
      ? {}
      : { queuePosition: enrollment.queuePosition }),
    startsOn: enrollment.startsOn,
    monthlyInCents,
    ...(memberOverdue ? { overdue: memberOverdue } : {}),
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
  loginAttempts,
  dashboardAccessDenied,
  requestAccess,
  accessibleBranches,
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
    const [workspace, plans, templates, registry] = await Promise.all([
      repository.getGroupWorkspace(clinicId, from, to),
      repository.listPatientPlans(clinicId),
      repository.listPlanTemplates(clinicId),
      repository.getAdministrativeRegistry(clinicId),
    ]);
    const groups = workspace.groups
      .filter((group) => includeInactive || group.active)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    return {
      today,
      workspace,
      plans,
      services: new Map(
        registry.services.map((service) => [service.id, service]),
      ),
      businessLines: new Map(
        registry.services.map((service) => [
          service.id,
          service.businessLine,
        ]),
      ),
      rows: groupRevenueOverview(
        groups,
        workspace.enrollments,
        plans,
        singlePlanSessionPrices(templates),
        today,
      ),
    };
  }

  /** Inadimplência por cliente, só para quem tem acesso ao Financeiro (senão `undefined`). */
  async function visibleOverdue(request: FastifyRequest, today: string) {
    if (!requestAccess.get(request)?.permissions.includes("finance.view"))
      return undefined;
    const summary = await repository.getFinancialSummary(
      request.user.clinicId,
    );
    return overdueByPatient(summary.receivables, today);
  }

  /** Validade do token do painel de vendas (o mesmo das sessões do CRM). */
  const DASHBOARD_TOKEN_HOURS = 8;

  /**
   * Login do painel de vendas: a chave identifica o painel e o e-mail/senha, a pessoa. Só entra
   * quem tem o acesso ao painel marcado no cadastro — permissão especial que nem o admin recebe
   * sozinho. O token devolvido vai no cabeçalho `X-CRM-User-Token` das chamadas seguintes.
   */
  app.post("/external/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const clinicId = request.user.clinicId;
    // Todas as pessoas chegam pelo IP do servidor do painel: a trava conta por e-mail.
    const attemptKey = `external:${clinicId}:${input.email}`;
    const attempt = loginAttempts.get(attemptKey);
    const blocked = {
      code: "LOGIN_TEMPORARILY_BLOCKED",
      message: "Muitas tentativas inválidas. Tente novamente em 15 minutos.",
    };
    if (attempt?.blockedUntil && attempt.blockedUntil > Date.now())
      return reply.status(429).send(blocked);
    const user = await repository.findUserByEmail(input.email);
    if (
      !user ||
      user.clinicId !== clinicId ||
      !(await compare(input.password, user.passwordHash))
    ) {
      const failures = (attempt?.failures ?? 0) + 1;
      loginAttempts.set(attemptKey, {
        failures,
        ...(failures >= 5 ? { blockedUntil: Date.now() + 15 * 60 * 1000 } : {}),
      });
      if (failures >= 5) return reply.status(429).send(blocked);
      return reply.status(401).send({
        code: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      });
    }
    loginAttempts.delete(attemptKey);
    if (!user.dashboardAccess)
      return reply.status(403).send(dashboardAccessDenied);
    const token = app.jwt.sign(
      {
        sub: user.id,
        clinicId,
        role: user.role,
        sessionVersion: user.sessionVersion ?? 0,
        kind: "dashboard",
      },
      { expiresIn: `${DASHBOARD_TOKEN_HOURS}h` },
    );
    const result: ExternalLoginResult = {
      token,
      expiresAt: new Date(
        Date.now() + DASHBOARD_TOKEN_HOURS * 3_600_000,
      ).toISOString(),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        modules: user.modules,
        permissions: user.permissions,
      },
    };
    return result;
  });

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

  // Filiais ativas da pessoa logada no painel (admin e "todas as filiais": todas as ativas),
  // a padrão primeiro. É a lista do seletor de filial do painel.
  app.get(
    "/external/v1/branches",
    { preHandler: authenticate },
    async (request): Promise<ExternalBranch[]> => {
      const user = await repository.findUserById(
        request.user.clinicId,
        request.user.sub,
      );
      const branches = user ? await accessibleBranches(user) : [];
      return branches
        .map(({ id, name, active, isDefault }) => ({
          id,
          name,
          active,
          isDefault,
        }))
        .sort(
          (left, right) =>
            Number(right.isDefault) - Number(left.isDefault) ||
            left.name.localeCompare(right.name, "pt-BR"),
        );
    },
  );

  app.get(
    "/external/v1/groups",
    { preHandler: authenticate },
    async (request): Promise<ExternalGroupsOverview> => {
      const { includeInactive } = externalGroupsQuerySchema.parse(
        request.query,
      );
      const { today, rows, businessLines } = await groupsOverview(
        request.user.clinicId,
        request.user.sub,
        includeInactive,
      );
      const overdue = await visibleOverdue(request, today);
      const groups = rows.map((row) => groupRow(row, businessLines, overdue));
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
      const { today, workspace, rows, businessLines } = await groupsOverview(
        clinicId,
        request.user.sub,
        true,
      );
      const row = rows.find((item) => item.group.id === id);
      if (!row)
        throw new DomainError("GROUP_NOT_FOUND", "Turma não encontrada.", 404);
      const overdue = await visibleOverdue(request, today);
      // Contato (telefone, WhatsApp, e-mail) só para quem tem acesso a Clientes.
      const patients = new Map<string, Patient>(
        requestAccess.get(request)?.permissions.includes("patients.view")
          ? (await repository.listPatients(clinicId)).map((patient) => [
              patient.id,
              patient,
            ])
          : [],
      );
      return {
        ...groupRow(row, businessLines, overdue),
        members: row.members.map(({ enrollment, monthlyInCents }) =>
          member(
            enrollment,
            patients.get(enrollment.patientId),
            monthlyInCents,
            today,
            overdue,
          ),
        ),
        waitlist: workspace.enrollments
          .filter((item) => item.groupId === id && item.status === "waitlisted")
          .sort(
            (left, right) =>
              (left.queuePosition ?? 0) - (right.queuePosition ?? 0),
          )
          .map((enrollment) =>
            member(
              enrollment,
              patients.get(enrollment.patientId),
              null,
              today,
              overdue,
            ),
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

  const patientNotFound = () =>
    new DomainError("PATIENT_NOT_FOUND", "Cliente não encontrado.", 404);

  /**
   * Ficha do cliente para o painel: o nome sempre; os dados cadastrais e de contato, as
   * etiquetas, as filiais, os planos ativos e as turmas só com acesso a Clientes.
   */
  app.get(
    "/external/v1/patients/:id",
    { preHandler: authenticate },
    async (request): Promise<ExternalPatientDetails> => {
      const { id } = request.params as { id: string };
      const clinicId = request.user.clinicId;
      const patient = z.uuid().safeParse(id).success
        ? await repository.getPatient(clinicId, id)
        : null;
      if (!patient) throw patientNotFound();
      const access = requestAccess.get(request);
      if (!access?.permissions.includes("patients.view"))
        return { id: patient.id, fullName: patient.fullName };
      const today = saoPauloToday();
      const [plans, workspace, branches, tag] = await Promise.all([
        repository.listPatientPlans(clinicId),
        repository.getGroupWorkspace(
          clinicId,
          `${today}T00:00:00.000Z`,
          `${today}T00:00:00.001Z`,
        ),
        repository.listBranches(clinicId),
        automaticPatientTagger(repository, clinicId, access.modules),
      ]);
      const tagged = tag(patient);
      const groupById = new Map(
        workspace.groups.map((group) => [group.id, group]),
      );
      const activePlans = plans
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
          ...(plan.branchId ? { branchId: plan.branchId } : {}),
          validFrom: plan.validFrom,
          ...(plan.validUntil ? { validUntil: plan.validUntil } : {}),
        }));
      const groups = workspace.enrollments
        .filter(
          (item) => item.patientId === patient.id && item.status !== "cancelled",
        )
        .map((item) => {
          const group = groupById.get(item.groupId);
          return {
            groupId: item.groupId,
            groupName: group?.name ?? "",
            ...(group?.branchId ? { branchId: group.branchId } : {}),
            status: item.status,
          };
        });
      const branchIds = new Set(
        [...activePlans, ...groups].flatMap((item) =>
          item.branchId ? [item.branchId] : [],
        ),
      );
      // Perfil: só os campos preenchidos, como na ficha do CRM.
      const filled = (value: unknown) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(Array.isArray(value) && !value.length);
      const fields = [
        ...Object.keys(patientProfileLabels),
        "cpf",
        "birthDate",
        "email",
        "whatsapp",
        "emergencyContactName",
        "emergencyContactPhone",
        "emergencyContactWhatsapp",
        "discount",
        "inactiveAt",
      ] as (keyof Patient)[];
      const record = {
        recordNumber: patient.recordNumber,
        status: patient.status,
        phone: patient.phone,
        ...Object.fromEntries(
          fields
            .filter((key) => filled(patient[key]))
            .map((key) => [key, patient[key]]),
        ),
        tags: tagged.tags,
        branches: branches
          .filter((branch) => branchIds.has(branch.id))
          .map((branch) => ({ id: branch.id, name: branch.name })),
        activePlans,
        groups,
        createdAt: patient.createdAt,
      } as ExternalPatientRecord;
      return { id: patient.id, fullName: patient.fullName, record };
    },
  );

  /**
   * Histórico de pagamentos do cliente (só com acesso ao Financeiro): todas as cobranças do
   * resumo financeiro, com as baixas e os estornos de cada uma, nas filiais da leitura.
   */
  app.get(
    "/external/v1/patients/:id/payments",
    { preHandler: authenticate },
    async (request): Promise<ExternalPatientPayments> => {
      const { id } = request.params as { id: string };
      const query = externalPatientPaymentsQuerySchema.parse(request.query);
      const clinicId = request.user.clinicId;
      const patient = z.uuid().safeParse(id).success
        ? await repository.getPatient(clinicId, id)
        : null;
      if (!patient) throw patientNotFound();
      const [summary, settings, registry] = await Promise.all([
        repository.getFinancialSummary(clinicId),
        repository.getClinicSettings(clinicId),
        repository.getAdministrativeRegistry(clinicId),
      ]);
      const receivables = summary.receivables.filter(
        (item) => item.patientId === patient.id,
      );
      const ids = new Set(receivables.map((item) => item.id));
      const [events, inventory] = await Promise.all([
        receivables.length
          ? repository.listReceivedPayments(clinicId, "1900-01-01", "9999-12-31")
          : Promise.resolve([]),
        // Produtos e vendas só vêm de comanda: as comandas só são lidas se há cobrança fora de plano.
        receivables.some((item) => !item.planId)
          ? repository.getInventoryWorkspace(clinicId)
          : Promise.resolve(undefined),
      ]);
      const tabs = new Map<string, PatientTab>();
      for (const tab of inventory?.tabs ?? [])
        if (tab.receivableId && ids.has(tab.receivableId))
          tabs.set(tab.receivableId, tab);
      return patientPayments(
        patient,
        {
          receivables,
          events: events.filter((item) => ids.has(item.receivableId)),
          tabs,
          productLines: new Map(
            (inventory?.products ?? []).map((product) => [
              product.id,
              product.businessLine,
            ]),
          ),
          services: new Map(
            registry.services.map((service) => [service.id, service]),
          ),
          today: saoPauloToday(),
          timeZone: settings?.timezone ?? "America/Sao_Paulo",
        },
        query,
      );
    },
  );

  /**
   * Inadimplência por cliente para a tela "Quem preciso cobrar?" do painel: soma as parcelas em
   * aberto com vencimento antes de hoje (fuso da clínica), pela mesma base do resumo financeiro.
   */
  app.get(
    "/external/v1/overdue",
    { preHandler: authenticate },
    async (request): Promise<ExternalOverdueReport> => {
      const clinicId = request.user.clinicId;
      const { today, workspace, rows, services } = await groupsOverview(
        clinicId,
        request.user.sub,
        true,
      );
      const [summary, patients] = await Promise.all([
        repository.getFinancialSummary(clinicId),
        repository.listPatients(clinicId),
      ]);
      const byPatient = overdueByPatient(summary.receivables, today);
      // Produtos só vêm de comanda: as comandas só são lidas se há parcela vencida fora de plano.
      const tabProductLines = new Map<string, (ServiceBusinessLine | null)[]>();
      if (
        summary.receivables.some(
          (item) => !item.planId && isOverdueReceivable(item, today),
        )
      ) {
        const inventory = await repository.getInventoryWorkspace(clinicId);
        const productLine = new Map(
          inventory.products.map((product) => [
            product.id,
            product.businessLine,
          ]),
        );
        for (const tab of inventory.tabs)
          if (tab.receivableId && tab.items.length)
            tabProductLines.set(
              tab.receivableId,
              tab.items.map((item) => productLine.get(item.productId) ?? null),
            );
      }
      const origins = overdueOrigins(
        summary.receivables,
        today,
        services,
        tabProductLines,
      );
      const patientById = new Map(
        patients.map((patient) => [patient.id, patient]),
      );
      const groupById = new Map(rows.map((row) => [row.group.id, row]));
      const result: ExternalOverdueRow[] = [...byPatient].map(
        ([patientId, item]) => {
          const patient = patientById.get(patientId);
          const daysOverdue = daysSince(item.oldest, today);
          return {
            patientId,
            patientName: patient?.fullName ?? item.name,
            ...(patient?.phone ? { phone: patient.phone } : {}),
            groups: workspace.enrollments
              .filter(
                (enrollment) =>
                  enrollment.patientId === patientId &&
                  enrollment.status === "active",
              )
              .flatMap((enrollment) => {
                const row = groupById.get(enrollment.groupId);
                return row
                  ? [
                      {
                        groupId: row.group.id,
                        groupName: row.group.name,
                        full: row.freeSeats <= 0,
                        waitlistCount: row.group.waitlistCount,
                      },
                    ]
                  : [];
              }),
            services: [...(origins.get(patientId)?.services.values() ?? [])],
            productLines: [...(origins.get(patientId)?.productLines ?? [])],
            amountInCents: item.amount,
            installments: item.installments,
            oldestDueDate: item.oldest,
            daysOverdue,
            band: externalOverdueBand(daysOverdue),
          };
        },
      );
      return {
        referenceDate: today,
        rows: result.sort(
          (left, right) =>
            right.daysOverdue - left.daysOverdue ||
            left.patientName.localeCompare(right.patientName, "pt-BR"),
        ),
      };
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
