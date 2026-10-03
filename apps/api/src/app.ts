import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import {
  adminUserInputSchema,
  adminUserUpdateSchema,
  appointmentInputSchema,
  appointmentRescheduleInputSchema,
  appointmentStatusInputSchema,
  assessmentTemplateInputSchema,
  clinicalAddendumInputSchema,
  clinicalAssessmentInputSchema,
  clinicalAttachmentInputSchema,
  clinicSettingsInputSchema,
  clientReportFilterSchema,
  dailyCashFilterSchema,
  financeForecastFilterSchema,
  relationshipSettingsSchema,
  holidayInputSchema,
  contactActivityInputSchema,
  satisfactionFilterSchema,
  satisfactionSurveyInputSchema,
  summarizeSatisfaction,
  birthdayMonthSchema,
  saoPauloToday,
  commissionGenerationInputSchema,
  commissionRuleInputSchema,
  clinicalMeasurementInputSchema,
  clinicalRecordInputSchema,
  costCenterInputSchema,
  communicationPreferenceInputSchema,
  broadcastInputSchema,
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentTransitionSchema,
  financialCategoryInputSchema,
  groupAttendanceInputSchema,
  groupClassInputSchema,
  groupClassUpdateSchema,
  groupEnrollmentInputSchema,
  leadInputSchema,
  leadAppointmentInputSchema,
  leadContactInputSchema,
  leadMoveSchema,
  leadTaskInputSchema,
  leadTaskStatusSchema,
  issuedDocumentInputSchema,
  managementReportFilterSchema,
  salesReportFilterSchema,
  payableInputSchema,
  recurringPayableInputSchema,
  paymentInputSchema,
  passwordResetSchema,
  loginSchema,
  manualMessageInputSchema,
  patientPlanInputSchema,
  patientTabCloseInputSchema,
  patientTabInputSchema,
  patientTabItemInputSchema,
  planAutoRenewInputSchema,
  planRenewalInputSchema,
  planTransitionSchema,
  patientExportFilterSchema,
  patientInputSchema,
  patientImportFileSchema,
  professionalInputSchema,
  productInputSchema,
  recurringAppointmentInputSchema,
  reminderGenerationInputSchema,
  receivableAdjustmentInputSchema,
  receivableRenegotiationInputSchema,
  roomInputSchema,
  replacementBookingInputSchema,
  retentionReportFilterSchema,
  scheduleBlockInputSchema,
  serviceInputSchema,
  stockMovementInputSchema,
  therapeuticGoalInputSchema,
  therapeuticGoalStatusSchema,
  treatmentClosureInputSchema,
  type ApiError,
  type BroadcastResult,
  type ManagementReport,
  type PatientImportAnalysis,
  type PatientImportResult,
  type SatisfactionReport,
  type UserSummary,
  type PermissionMatrixItem,
  appModuleLabels,
  type AppModule,
  roleDefaultEditModules,
  roleDefaultModules,
  userRoleSchema,
} from "@crm/contracts";
import {
  buildClientReport,
  resolveClientReportPeriod,
} from "./client-report.js";
import { buildBroadcast } from "./broadcast.js";
import { config } from "./config.js";
import { clinicDateOf, DEFAULT_CLINIC_TIMEZONE } from "./daily-cash.js";
import { buildFinanceForecast } from "./finance-forecast.js";
import { DomainError, type ClinicRepository } from "./repository.js";
import {
  moduleDeniedCodes,
  ROUTE_ACCESS,
  type ModuleRequirement,
} from "./route-access.js";
import {
  buildRetentionReport,
  resolveRetentionPeriod,
} from "./retention-report.js";
import { salesReportToXlsx } from "./sales-workbook.js";
import {
  filterPatientsForExport,
  patientsToCsv,
  patientsToXlsx,
} from "./patient-export.js";

// A interface manda `patientId=` vazio para listar tudo; o PostgreSQL não aceita "" como uuid.
const optionalPatientFilterSchema = z.object({
  patientId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
});
import {
  decodeCsvText,
  parseCsv,
  readXlsxRows,
  validatePatientImport,
} from "./patient-import.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; clinicId: string; role: UserSummary["role"] };
    user: { sub: string; clinicId: string; role: UserSummary["role"] };
  }
}

interface BuildAppOptions {
  repository: ClinicRepository;
  logger?: boolean;
}

function reportToCsv(report: ManagementReport) {
  const rows: Array<Array<string | number>> = [
    [
      "seção",
      "item",
      "total",
      "concluídos",
      "faltas",
      "taxa (%)",
      "valor (centavos)",
    ],
    [
      "agenda",
      "atendimentos",
      report.appointments.total,
      report.appointments.completed,
      report.appointments.noShows,
      report.appointments.attendanceRate,
      "",
    ],
    ["agenda", "cancelados", report.appointments.cancelled, "", "", "", ""],
    ["planos", "ativos", report.plans.active, "", "", "", ""],
    [
      "planos",
      "sessões disponíveis",
      report.plans.availableSessions,
      "",
      "",
      "",
      "",
    ],
    [
      "planos",
      "sessões consumidas no período",
      report.plans.consumedInPeriod,
      "",
      "",
      "",
      "",
    ],
    ["financeiro", "em aberto", "", "", "", "", report.finance.openInCents],
    ["financeiro", "em atraso", "", "", "", "", report.finance.overdueInCents],
    [
      "financeiro",
      "recebido no período",
      "",
      "",
      "",
      "",
      report.finance.paidInPeriodInCents,
    ],
    [
      "comercial",
      "leads criados",
      report.commercial.leadsCreated,
      report.commercial.won,
      report.commercial.lost,
      report.commercial.conversionRate,
      "",
    ],
    [
      "dre",
      "receita de serviços",
      "",
      "",
      "",
      "",
      report.profitability.dre.serviceRevenueInCents,
    ],
    [
      "dre",
      "receita de produtos",
      "",
      "",
      "",
      "",
      report.profitability.dre.productRevenueInCents,
    ],
    [
      "dre",
      "custo dos produtos vendidos",
      "",
      "",
      "",
      "",
      -report.profitability.dre.productCostInCents,
    ],
    [
      "dre",
      "despesas operacionais",
      "",
      "",
      "",
      "",
      -report.profitability.dre.operatingExpensesInCents,
    ],
    [
      "dre",
      "comissões",
      "",
      "",
      "",
      "",
      -report.profitability.dre.commissionsInCents,
    ],
    [
      "dre",
      "resultado líquido",
      "",
      "",
      "",
      report.profitability.dre.netMargin,
      report.profitability.dre.netResultInCents,
    ],
    [
      "comercial",
      "tempo médio da primeira resposta (min)",
      report.commercial.averageFirstResponseMinutes,
      "",
      "",
      "",
      "",
    ],
    ...report.byProfessional.map((item) => [
      "profissional",
      item.name,
      item.appointments,
      item.completed,
      item.noShows,
      item.attendanceRate,
      "",
    ]),
    ...report.byService.map((item) => [
      "serviço",
      item.name,
      item.appointments,
      item.completed,
      item.noShows,
      item.attendanceRate,
      "",
    ]),
    ...report.bySource.map((item) => [
      "origem",
      item.source,
      item.leads,
      item.won,
      item.lost,
      item.conversionRate,
      "",
    ]),
    ...report.profitability.byService.map((item) => [
      "rentabilidade por serviço",
      item.name,
      item.completedAppointments,
      "",
      "",
      item.contributionMargin,
      item.contributionInCents,
    ]),
    ...report.profitability.byProduct.map((item) => [
      "rentabilidade por produto",
      item.name,
      item.unitsSold,
      "",
      "",
      item.grossMargin,
      item.grossProfitInCents,
    ]),
  ];
  const escape = (value: string | number) => {
    const text = String(value);
    return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\r\n")}`;
}

export async function buildApp({ repository, logger = true }: BuildAppOptions) {
  const app = Fastify({ logger, bodyLimit: 8 * 1024 * 1024 });
  const loginAttempts = new Map<
    string,
    { failures: number; blockedUntil?: number }
  >();

  const webOrigins = new Set([config.WEB_ORIGIN]);
  if (config.NODE_ENV !== "production") {
    const localOrigin = new URL(config.WEB_ORIGIN);
    if (localOrigin.hostname === "localhost" || localOrigin.hostname === "127.0.0.1") {
      localOrigin.hostname = localOrigin.hostname === "localhost" ? "127.0.0.1" : "localhost";
      webOrigins.add(localOrigin.origin);
    }
  }
  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || webOrigins.has(origin)),
    // O @fastify/cors 11 libera só GET, HEAD e POST por padrão; sem isto o navegador
    // bloqueia PUT/PATCH/DELETE com "Failed to fetch".
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });
  await app.register(jwt, { secret: config.JWT_SECRET });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply
        .status(error.statusCode)
        .send({ code: error.code, message: error.message } satisfies ApiError);
    }
    if (typeof error === "object" && error !== null && "issues" in error) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Revise os dados informados.",
      } satisfies ApiError);
    }
    app.log.error(error);
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Não foi possível concluir a operação.",
    } satisfies ApiError);
  });

  /** Dados públicos do usuário logado, com os módulos e a edição efetivos. */
  function toUserSummary(user: UserSummary): UserSummary {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
      modules: user.modules,
      editModules: user.editModules,
    };
  }

  /** Módulos e edição efetivos do usuário da requisição (lidos do repositório no `authenticate`). */
  const requestAccess = new WeakMap<
    FastifyRequest,
    { modules: readonly AppModule[]; editModules: readonly AppModule[] }
  >();

  /**
   * Valida o token e relê o usuário no repositório a cada requisição: usuário inexistente ou
   * desativado recebe 401, e perfil/módulos alterados valem sem novo login.
   */
  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Sua sessão expirou. Entre novamente.",
      } satisfies ApiError);
    }
    const user = await repository.findUserById(
      request.user.clinicId,
      request.user.sub,
    );
    if (!user)
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Sua sessão não é mais válida. Entre novamente.",
      } satisfies ApiError);
    request.user.role = user.role;
    requestAccess.set(request, {
      modules: user.modules,
      editModules: user.editModules,
    });
  }

  /** Guarda por módulo e nível: exige todos os requisitos (ver `ROUTE_ACCESS`). */
  function requireModules(requirements: readonly ModuleRequirement[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const access = requestAccess.get(request);
      const missing = requirements.find(
        ({ module, level }) =>
          !(level === "edit" ? access?.editModules : access?.modules)?.includes(
            module,
          ),
      );
      if (missing)
        return reply.status(403).send({
          code: moduleDeniedCodes[missing.module],
          message: `Seu usuário não possui permissão para ${
            missing.level === "edit" ? "editar" : "ver"
          } ${appModuleLabels[missing.module]}.`,
        } satisfies ApiError);
    };
  }

  async function requireOwnerAccess(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (request.user.role !== "owner")
      return reply.status(403).send({
        code: "OWNER_ACCESS_REQUIRED",
        message: "Esta operação é restrita à gestão proprietária.",
      } satisfies ApiError);
  }

  // Aplica o mapa único `ROUTE_ACCESS` a cada rota registrada; rota fora do mapa não sobe.
  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    // Preflight CORS do @fastify/cors (`OPTIONS *`): sem dados, só cabeçalhos.
    if (methods.every((method) => method === "OPTIONS") && routeOptions.url === "*")
      return;
    // O Fastify cria a HEAD de cada GET copiando as opções originais (sem a guarda): a HEAD
    // recebe exatamente o acesso do GET correspondente.
    const method = methods[0] === "HEAD" ? "GET" : methods[0];
    const key = `${method} ${routeOptions.url}`;
    const access = ROUTE_ACCESS[key];
    if (!access)
      throw new Error(`Rota sem acesso definido em ROUTE_ACCESS: ${key}`);
    if (access === "public") return;
    routeOptions.preHandler = [
      authenticate,
      ...(access === "owner"
        ? [requireOwnerAccess]
        : access === "login"
          ? []
          : [requireModules(access)]),
    ];
  });

  /** Recusa (409 `HOLIDAY`) horários cuja data, no fuso da clínica, é feriado. */
  async function assertNoHoliday(clinicId: string, startsAtList: string[]) {
    const dates = startsAtList.map((value) => saoPauloToday(new Date(value)));
    const sorted = [...dates].sort();
    const holidays = await repository.listHolidays(
      clinicId,
      sorted[0],
      sorted[sorted.length - 1],
    );
    const holiday = holidays.find((item) => dates.includes(item.date));
    if (!holiday) return;
    const [year, month, day] = holiday.date.split("-");
    throw new DomainError(
      "HOLIDAY",
      `Não é possível agendar em ${day}/${month}/${year}: é feriado (${holiday.name}).`,
      409,
    );
  }

  app.get("/health", async () => ({
    status: "ok",
    storage: config.STORAGE_MODE,
  }));

  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const attemptKey = `${request.ip}:${input.email}`;
    const attempt = loginAttempts.get(attemptKey);
    if (attempt?.blockedUntil && attempt.blockedUntil > Date.now())
      return reply.status(429).send({
        code: "LOGIN_TEMPORARILY_BLOCKED",
        message: "Muitas tentativas inválidas. Tente novamente em 15 minutos.",
      } satisfies ApiError);
    const user = await repository.findUserByEmail(input.email);
    if (!user || !(await compare(input.password, user.passwordHash))) {
      const failures = (attempt?.failures ?? 0) + 1;
      loginAttempts.set(attemptKey, {
        failures,
        ...(failures >= 5 ? { blockedUntil: Date.now() + 15 * 60 * 1000 } : {}),
      });
      if (failures >= 5)
        return reply.status(429).send({
          code: "LOGIN_TEMPORARILY_BLOCKED",
          message:
            "Muitas tentativas inválidas. Tente novamente em 15 minutos.",
        } satisfies ApiError);
      return reply.status(401).send({
        code: "INVALID_CREDENTIALS",
        message: "E-mail ou senha inválidos.",
      } satisfies ApiError);
    }
    loginAttempts.delete(attemptKey);
    const token = app.jwt.sign(
      { sub: user.id, clinicId: user.clinicId, role: user.role },
      { expiresIn: "8h" },
    );
    return { token, user: toUserSummary(user) };
  });

  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const user = await repository.findUserById(
      request.user.clinicId,
      request.user.sub,
    );
    if (!user)
      return reply
        .status(404)
        .send({ code: "USER_NOT_FOUND", message: "Usuário não encontrado." });
    return toUserSummary(user);
  });

  app.get(
    "/admin/users",
    { preHandler: authenticate },
    async (request) => repository.listAdminUsers(request.user.clinicId),
  );
  app.post(
    "/admin/users",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = adminUserInputSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          await repository.createAdminUser(
            request.user.clinicId,
            request.user.sub,
            input,
            await hash(input.password, 12),
          ),
        );
    },
  );
  app.patch(
    "/admin/users/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await repository.updateAdminUser(
        request.user.clinicId,
        request.user.sub,
        id,
        adminUserUpdateSchema.parse(request.body),
      );
      if (!user)
        return reply.status(404).send({
          code: "USER_NOT_FOUND",
          message: "Usuário não encontrado.",
        });
      return user;
    },
  );
  app.post(
    "/admin/users/:id/reset-password",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { password } = passwordResetSchema.parse(request.body);
      const updated = await repository.resetAdminUserPassword(
        request.user.clinicId,
        request.user.sub,
        id,
        await hash(password, 12),
      );
      if (!updated)
        return reply.status(404).send({
          code: "USER_NOT_FOUND",
          message: "Usuário não encontrado.",
        });
      return { updated: true };
    },
  );
  app.get(
    "/admin/clinic-settings",
    { preHandler: authenticate },
    async (request, reply) => {
      const settings = await repository.getClinicSettings(
        request.user.clinicId,
      );
      if (!settings)
        return reply.status(404).send({
          code: "CLINIC_NOT_FOUND",
          message: "Clínica não encontrada.",
        });
      return settings;
    },
  );
  app.put(
    "/admin/clinic-settings",
    { preHandler: authenticate },
    async (request) =>
      repository.updateClinicSettings(
        request.user.clinicId,
        request.user.sub,
        clinicSettingsInputSchema.parse(request.body),
      ),
  );
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
  app.get("/holidays", { preHandler: authenticate }, async (request) => {
    const query = z
      .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
      .parse(request.query);
    return repository.listHolidays(request.user.clinicId, query.from, query.to);
  });
  app.post(
    "/holidays",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createHoliday(
            request.user.clinicId,
            holidayInputSchema.parse(request.body),
          ),
        ),
  );
  app.delete(
    "/holidays/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted =
        z.uuid().safeParse(id).success &&
        (await repository.deleteHoliday(request.user.clinicId, id));
      if (!deleted)
        return reply.status(404).send({
          code: "HOLIDAY_NOT_FOUND",
          message: "Feriado não encontrado.",
        } satisfies ApiError);
      return reply.status(204).send();
    },
  );
  app.get(
    "/relationship/suggestions",
    { preHandler: authenticate },
    async (request) =>
      repository.listContactSuggestions(
        request.user.clinicId,
        request.user.role,
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
  app.get(
    "/admin/audit-events",
    { preHandler: authenticate },
    async (request) => repository.listAdminAuditEvents(request.user.clinicId),
  );
  app.get(
    "/admin/permission-matrix",
    { preHandler: authenticate },
    async () =>
      userRoleSchema.options.map((role): PermissionMatrixItem => {
        if (role === "owner") {
          const everything = ["Todos os módulos", "Administração"];
          return { role, modules: everything, editModules: [...everything] };
        }
        return {
          role,
          modules: roleDefaultModules[role].map((module) => appModuleLabels[module]),
          editModules: roleDefaultEditModules[role].map(
            (module) => appModuleLabels[module],
          ),
        };
      }),
  );

  app.get("/dashboard", { preHandler: authenticate }, async (request) => {
    const query = request.query as { date?: string };
    const date =
      query.date ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
    await repository.renewDuePatientPlans(request.user.clinicId, request.user.sub);
    return repository.getDashboard(request.user.clinicId, date);
  });

  app.get("/patients", { preHandler: authenticate }, async (request) => {
    const query = request.query as { search?: string };
    return repository.listPatients(request.user.clinicId, query.search);
  });
  app.get(
    "/patients/export",
    { preHandler: authenticate },
    async (request, reply) => {
      const { format, columns, ...filters } = patientExportFilterSchema.parse(
        request.query,
      );
      const clinicId = request.user.clinicId;
      const today = saoPauloToday();
      const [patients, plans] = await Promise.all([
        repository.listPatients(clinicId, filters.search),
        filters.activePlan === undefined
          ? Promise.resolve([])
          : repository.listPatientPlans(clinicId),
      ]);
      const rows = filterPatientsForExport(
        patients,
        plans,
        { format, columns, ...filters },
        today,
      );
      await repository.recordAdminAuditEvent(
        clinicId,
        request.user.sub,
        "patients.exported",
        "patient",
        { format, columns, filters, count: rows.length },
      );
      const fileName = `clientes-${today}.${format}`;
      reply.header(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
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
      const patient = await repository.createPatient(
        request.user.clinicId,
        patientInputSchema.parse(request.body),
      );
      return reply.status(201).send(patient);
    },
  );
  const patientImportMaxBytes = 2 * 1024 * 1024;
  async function analyzePatientImport(
    clinicId: string,
    body: unknown,
  ): Promise<PatientImportAnalysis> {
    const file = patientImportFileSchema.parse(body);
    const extension = /\.([^.]+)$/.exec(file.fileName)?.[1]?.toLowerCase();
    if (extension !== "csv" && extension !== "xlsx")
      throw new DomainError(
        "PATIENT_IMPORT_UNSUPPORTED_FILE",
        "Formato não suportado. Envie uma planilha .csv ou .xlsx.",
        400,
      );
    const buffer = Buffer.from(file.contentBase64, "base64");
    if (buffer.length > patientImportMaxBytes)
      throw new DomainError(
        "PATIENT_IMPORT_TOO_LARGE",
        "O arquivo passa de 2 MB. Divida a planilha em partes menores.",
        413,
      );
    let rows: string[][];
    try {
      rows =
        extension === "csv"
          ? parseCsv(decodeCsvText(buffer))
          : await readXlsxRows(buffer);
    } catch {
      throw new DomainError(
        "PATIENT_IMPORT_INVALID_FILE",
        "Não foi possível ler a planilha. Verifique se o arquivo não está corrompido.",
        400,
      );
    }
    return validatePatientImport(rows, await repository.listPatients(clinicId));
  }
  app.post(
    "/patients/import/preview",
    { preHandler: authenticate },
    async (request) => analyzePatientImport(request.user.clinicId, request.body),
  );
  app.post(
    "/patients/import",
    { preHandler: authenticate },
    async (request): Promise<PatientImportResult> => {
      const analysis = await analyzePatientImport(request.user.clinicId, request.body);
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
        patientInputSchema.parse(request.body),
      );
      if (!patient)
        return reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        });
      return patient;
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
      return timeline;
    },
  );

  app.get("/professionals", { preHandler: authenticate }, async (request) =>
    repository.listProfessionals(request.user.clinicId),
  );
  app.post(
    "/professionals",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createProfessional(
            request.user.clinicId,
            professionalInputSchema.parse(request.body),
          ),
        ),
  );
  app.get("/rooms", { preHandler: authenticate }, async (request) =>
    repository.listRooms(request.user.clinicId),
  );
  app.post("/rooms", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createRoom(
          request.user.clinicId,
          roomInputSchema.parse(request.body),
        ),
      ),
  );
  app.get("/services", { preHandler: authenticate }, async (request) =>
    repository.listServices(request.user.clinicId),
  );
  app.post("/services", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createService(
          request.user.clinicId,
          serviceInputSchema.parse(request.body),
        ),
      ),
  );

  app.get("/appointments", { preHandler: authenticate }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to)
      throw new DomainError(
        "DATE_RANGE_REQUIRED",
        "Informe o período da agenda.",
      );
    return repository.listAppointments(
      request.user.clinicId,
      query.from,
      query.to,
    );
  });
  app.post(
    "/appointments",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = appointmentInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      return reply
        .status(201)
        .send(await repository.createAppointment(request.user.clinicId, input));
    },
  );
  app.post(
    "/appointments/recurring",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = recurringAppointmentInputSchema.parse(request.body);
      // Mesmas datas que os repositórios geram para cada ocorrência.
      const occurrences = Array.from({ length: input.occurrences }, (_, index) => {
        const startsAt = new Date(input.startsAt);
        startsAt.setUTCDate(
          startsAt.getUTCDate() + index * input.intervalWeeks * 7,
        );
        return startsAt.toISOString();
      });
      await assertNoHoliday(request.user.clinicId, occurrences);
      return reply
        .status(201)
        .send(
          await repository.createRecurringAppointments(
            request.user.clinicId,
            input,
          ),
        );
    },
  );
  app.put(
    "/appointments/:id/schedule",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = appointmentRescheduleInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      const appointment = await repository.rescheduleAppointment(
        request.user.clinicId,
        request.user.sub,
        id,
        input,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        });
      return appointment;
    },
  );
  app.get(
    "/appointments/:id/reschedules",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const events = await repository.listAppointmentReschedules(
        request.user.clinicId,
        id,
      );
      if (!events)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        });
      return events;
    },
  );
  app.patch(
    "/appointments/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { status } = appointmentStatusInputSchema.parse(request.body);
      const appointment = await repository.updateAppointmentStatus(
        request.user.clinicId,
        id,
        status,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        });
      return appointment;
    },
  );
  app.get("/schedule-blocks", { preHandler: authenticate }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to)
      throw new DomainError(
        "DATE_RANGE_REQUIRED",
        "Informe o período da agenda.",
      );
    return repository.listScheduleBlocks(
      request.user.clinicId,
      query.from,
      query.to,
    );
  });
  app.post(
    "/schedule-blocks",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createScheduleBlock(
            request.user.clinicId,
            scheduleBlockInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/schedule-blocks/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const block = await repository.cancelScheduleBlock(
        request.user.clinicId,
        id,
      );
      if (!block)
        return reply.status(404).send({
          code: "SCHEDULE_BLOCK_NOT_FOUND",
          message: "Bloqueio não encontrado.",
        });
      return block;
    },
  );

  app.get(
    "/groups/workspace",
    { preHandler: authenticate },
    async (request) => {
      const query = request.query as { from?: string; to?: string };
      if (!query.from || !query.to)
        throw new DomainError(
          "DATE_RANGE_REQUIRED",
          "Informe o período das turmas.",
        );
      return repository.getGroupWorkspace(
        request.user.clinicId,
        query.from,
        query.to,
      );
    },
  );
  app.post(
    "/groups",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createGroupClass(
            request.user.clinicId,
            groupClassInputSchema.parse(request.body),
          ),
        ),
  );
  app.put(
    "/groups/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const group = await repository.updateGroupClass(
        request.user.clinicId,
        id,
        groupClassUpdateSchema.parse(request.body),
      );
      if (!group) return reply.status(404).send({ code: "GROUP_NOT_FOUND", message: "Turma não encontrada." });
      return group;
    },
  );
  app.post(
    "/group-enrollments",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createGroupEnrollment(
            request.user.clinicId,
            groupEnrollmentInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/group-enrollments/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const enrollment = await repository.cancelGroupEnrollment(
        request.user.clinicId,
        id,
      );
      if (!enrollment)
        return reply.status(404).send({
          code: "GROUP_ENROLLMENT_NOT_FOUND",
          message: "Matrícula não encontrada.",
        });
      return enrollment;
    },
  );
  // Encontros das turmas exibidos na agenda; a reserva é feita ao salvar a turma.
  app.get("/group-sessions", { preHandler: authenticate }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to)
      throw new DomainError(
        "DATE_RANGE_REQUIRED",
        "Informe o período da agenda.",
      );
    return repository.listGroupSessions(
      request.user.clinicId,
      query.from,
      query.to,
    );
  });
  app.put(
    "/group-sessions/:sessionId/attendance/:patientId",
    { preHandler: authenticate },
    async (request) => {
      const { sessionId, patientId } = request.params as {
        sessionId: string;
        patientId: string;
      };
      return repository.recordGroupAttendance(
        request.user.clinicId,
        request.user.sub,
        sessionId,
        patientId,
        groupAttendanceInputSchema.parse(request.body),
      );
    },
  );
  app.post(
    "/group-sessions/:id/complete",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = await repository.completeGroupSession(
        request.user.clinicId,
        id,
      );
      if (!session)
        return reply.status(404).send({
          code: "GROUP_SESSION_NOT_FOUND",
          message: "Sessão não encontrada.",
        });
      return session;
    },
  );
  app.post(
    "/group-replacements/book",
    { preHandler: authenticate },
    async (request) =>
      repository.bookReplacement(
        request.user.clinicId,
        request.user.sub,
        replacementBookingInputSchema.parse(request.body),
      ),
  );

  app.get(
    "/inventory/workspace",
    { preHandler: authenticate },
    async (request) => repository.getInventoryWorkspace(request.user.clinicId),
  );
  app.post(
    "/inventory/products",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createProduct(
            request.user.clinicId,
            request.user.sub,
            productInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/inventory/movements",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createStockMovement(
            request.user.clinicId,
            request.user.sub,
            stockMovementInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/patient-tabs",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.openPatientTab(
            request.user.clinicId,
            request.user.sub,
            patientTabInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/patient-tabs/:id/items",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tab = await repository.addPatientTabItem(
        request.user.clinicId,
        request.user.sub,
        id,
        patientTabItemInputSchema.parse(request.body),
      );
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      return tab;
    },
  );
  app.post(
    "/patient-tabs/:id/close",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tab = await repository.closePatientTab(
        request.user.clinicId,
        request.user.sub,
        id,
        patientTabCloseInputSchema.parse(request.body),
      );
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      return tab;
    },
  );
  app.post(
    "/patient-tabs/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tab = await repository.cancelPatientTab(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!tab)
        return reply.status(404).send({
          code: "PATIENT_TAB_NOT_FOUND",
          message: "Comanda não encontrada.",
        });
      return tab;
    },
  );

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

  app.get("/plans", { preHandler: authenticate }, async (request) => {
    const query = optionalPatientFilterSchema.parse(request.query);
    await repository.renewDuePatientPlans(request.user.clinicId, request.user.sub);
    return repository.listPatientPlans(request.user.clinicId, query.patientId);
  });
  app.post(
    "/plans",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createPatientPlan(
            request.user.clinicId,
            request.user.sub,
            patientPlanInputSchema.parse(request.body),
          ),
        ),
  );
  app.patch(
    "/plans/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const status = planTransitionSchema.parse(
        (request.body as { status?: unknown }).status,
      );
      const plan = await repository.updatePatientPlanStatus(
        request.user.clinicId,
        request.user.sub,
        id,
        status,
      );
      if (!plan)
        return reply.status(404).send({
          code: "PLAN_NOT_FOUND",
          message: "Plano não encontrado.",
        });
      return plan;
    },
  );
  app.post(
    "/plans/:id/renew",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const plan = await repository.renewPatientPlan(
        request.user.clinicId,
        request.user.sub,
        id,
        planRenewalInputSchema.parse(request.body),
      );
      if (!plan)
        return reply.status(404).send({
          code: "PLAN_NOT_FOUND",
          message: "Plano não encontrado.",
        });
      return reply.status(201).send(plan);
    },
  );
  app.patch(
    "/plans/:id/auto-renew",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const plan = await repository.updatePatientPlanAutoRenew(
        request.user.clinicId,
        request.user.sub,
        id,
        planAutoRenewInputSchema.parse(request.body).autoRenew,
      );
      if (!plan)
        return reply.status(404).send({
          code: "PLAN_NOT_FOUND",
          message: "Plano não encontrado.",
        });
      return plan;
    },
  );
  app.get(
    "/plans/:id/movements",
    { preHandler: authenticate },
    async (request) => {
      const { id } = request.params as { id: string };
      return repository.listSessionMovements(request.user.clinicId, id);
    },
  );

  app.get(
    "/finance/summary",
    { preHandler: authenticate },
    async (request) => {
      await repository.renewDuePatientPlans(
        request.user.clinicId,
        request.user.sub,
      );
      return repository.getFinancialSummary(request.user.clinicId);
    },
  );
  app.post(
    "/finance/receivables/:id/pay",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const receivable = await repository.settleReceivable(
        request.user.clinicId,
        request.user.sub,
        id,
        paymentInputSchema.parse(request.body ?? {}).paymentMethod,
      );
      if (!receivable)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receivable;
    },
  );
  app.patch(
    "/finance/receivables/:id/adjust",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = receivableAdjustmentInputSchema.parse(request.body);
      const receivable = await repository.adjustReceivable(
        request.user.clinicId,
        request.user.sub,
        id,
        input.amountInCents,
        input.reason,
      );
      if (!receivable)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receivable;
    },
  );
  app.get(
    "/finance/receivables/:id/receipt",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const receipt = await repository.getPaymentReceipt(
        request.user.clinicId,
        id,
      );
      if (!receipt)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receipt;
    },
  );
  app.get(
    "/finance/workspace",
    { preHandler: authenticate },
    async (request) => {
      // Abrir o financeiro gera as competências pendentes das despesas fixas.
      await repository.generateDueRecurringPayables(
        request.user.clinicId,
        request.user.sub,
      );
      return repository.getFinancialWorkspace(request.user.clinicId);
    },
  );
  app.get(
    "/finance/daily-cash",
    { preHandler: authenticate },
    async (request) => {
      const { date } = dailyCashFilterSchema.parse(request.query);
      return repository.getDailyCash(
        request.user.clinicId,
        date ?? saoPauloToday(),
      );
    },
  );
  app.get(
    "/finance/forecast",
    { preHandler: authenticate },
    async (request) => {
      const { months } = financeForecastFilterSchema.parse(request.query);
      const { clinicId, sub } = request.user;
      // Lança o que já é devido para que só o futuro fique como projetado.
      await repository.renewDuePatientPlans(clinicId, sub);
      await repository.generateDueRecurringPayables(clinicId, sub);
      const [workspace, plans, recurringPayables] = await Promise.all([
        repository.getFinancialWorkspace(clinicId),
        repository.listPatientPlans(clinicId),
        repository.listRecurringPayables(clinicId),
      ]);
      return buildFinanceForecast(saoPauloToday().slice(0, 7), months, {
        receivables: workspace.summary.receivables,
        payables: workspace.payables,
        plans,
        recurringPayables,
      });
    },
  );
  app.get(
    "/finance/recurring-payables",
    { preHandler: authenticate },
    async (request) => {
      await repository.generateDueRecurringPayables(
        request.user.clinicId,
        request.user.sub,
      );
      return repository.listRecurringPayables(request.user.clinicId);
    },
  );
  app.post(
    "/finance/recurring-payables",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createRecurringPayable(
            request.user.clinicId,
            request.user.sub,
            recurringPayableInputSchema.parse(request.body),
          ),
        ),
  );
  app.put(
    "/finance/recurring-payables/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const recurring = await repository.updateRecurringPayable(
        request.user.clinicId,
        request.user.sub,
        id,
        recurringPayableInputSchema.parse(request.body),
      );
      if (!recurring)
        return reply.status(404).send({
          code: "RECURRING_PAYABLE_NOT_FOUND",
          message: "Despesa fixa não encontrada.",
        });
      return recurring;
    },
  );
  app.delete(
    "/finance/recurring-payables/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await repository.deleteRecurringPayable(
        request.user.clinicId,
        id,
      );
      if (!deleted)
        return reply.status(404).send({
          code: "RECURRING_PAYABLE_NOT_FOUND",
          message: "Despesa fixa não encontrada.",
        });
      return reply.status(204).send();
    },
  );
  app.post(
    "/finance/renegotiations",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.renegotiateReceivables(
            request.user.clinicId,
            request.user.sub,
            receivableRenegotiationInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/finance/commission-rules",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createCommissionRule(
            request.user.clinicId,
            commissionRuleInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/finance/commissions/generate",
    { preHandler: authenticate },
    async (request) =>
      repository.generateCommissions(
        request.user.clinicId,
        commissionGenerationInputSchema.parse(request.body).competence,
      ),
  );
  app.post(
    "/finance/commissions/:id/pay",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const commission = await repository.settleCommission(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!commission)
        return reply.status(404).send({
          code: "COMMISSION_NOT_FOUND",
          message: "Comissão não encontrada ou já paga.",
        });
      return commission;
    },
  );
  app.post(
    "/finance/commissions/:id/reverse",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const commission = await repository.reverseCommission(
        request.user.clinicId,
        id,
      );
      if (!commission)
        return reply.status(404).send({
          code: "COMMISSION_NOT_FOUND",
          message: "Comissão não encontrada ou ainda aberta.",
        });
      return commission;
    },
  );
  app.post(
    "/finance/categories",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createFinancialCategory(
            request.user.clinicId,
            financialCategoryInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/finance/cost-centers",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createCostCenter(
            request.user.clinicId,
            costCenterInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/finance/payables",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createPayable(
            request.user.clinicId,
            request.user.sub,
            payableInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/finance/payables/:id/pay",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = paymentInputSchema.parse(request.body ?? {});
      const payable = await repository.settlePayable(
        request.user.clinicId,
        request.user.sub,
        id,
        input.paymentMethod,
      );
      if (!payable)
        return reply.status(404).send({
          code: "PAYABLE_NOT_FOUND",
          message: "Conta a pagar não encontrada.",
        });
      return payable;
    },
  );
  app.post(
    "/finance/payables/:id/reverse",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payable = await repository.reversePayablePayment(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!payable)
        return reply.status(404).send({
          code: "PAYABLE_NOT_FOUND",
          message: "Conta a pagar não encontrada.",
        });
      return payable;
    },
  );
  app.post(
    "/finance/receivables/:id/reverse",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const receivable = await repository.reverseReceivablePayment(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      if (!receivable)
        return reply.status(404).send({
          code: "RECEIVABLE_NOT_FOUND",
          message: "Conta a receber não encontrada.",
        });
      return receivable;
    },
  );

  app.get(
    "/leads",
    { preHandler: authenticate },
    async (request) => repository.listLeads(request.user.clinicId),
  );
  app.post(
    "/leads",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createLead(
            request.user.clinicId,
            leadInputSchema.parse(request.body),
          ),
        ),
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
  app.post(
    "/leads/:id/appointments",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = leadAppointmentInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      const appointment = await repository.createLeadAppointment(
        request.user.clinicId,
        id,
        input,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return reply.status(201).send(appointment);
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

  app.get(
    "/communications",
    { preHandler: authenticate },
    async (request) => repository.getCommunicationCenter(request.user.clinicId),
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
  // Comunicado segmentado: a prévia não grava nada; o envio só enfileira
  // mensagens `manual` na outbox (nenhum disparo real).
  async function planBroadcast(clinicId: string, body: unknown) {
    const input = broadcastInputSchema.parse(body);
    const [patients, plans, center] = await Promise.all([
      repository.listPatients(clinicId),
      input.segment.activePlan === undefined
        ? Promise.resolve([])
        : repository.listPatientPlans(clinicId),
      repository.getCommunicationCenter(clinicId),
    ]);
    const plan = buildBroadcast(
      patients,
      plans,
      center.preferences,
      input,
      saoPauloToday(),
    );
    return { input, plan };
  }
  const broadcastResult = (
    preview: boolean,
    input: { channel: "whatsapp" | "email" },
    plan: ReturnType<typeof buildBroadcast>,
    queued: number,
  ) => ({
    preview,
    channel: input.channel,
    matched: plan.matched,
    queued,
    skipped: plan.skipped,
    ...(plan.drafts[0] ? { sampleBody: plan.drafts[0].body } : {}),
  });
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
      const result: BroadcastResult = broadcastResult(false, input, plan, queued);
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

  app.get(
    "/document-templates",
    { preHandler: authenticate },
    async (request) => repository.listDocumentTemplates(request.user.clinicId),
  );
  app.post(
    "/document-templates",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createDocumentTemplate(
            request.user.clinicId,
            documentTemplateInputSchema.parse(request.body),
          ),
        ),
  );
  app.post(
    "/document-templates/:id/versions",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = documentTemplateVersionInputSchema.parse(request.body);
      const template = await repository.createDocumentTemplateVersion(
        request.user.clinicId,
        id,
        input.body,
      );
      if (!template)
        return reply.status(404).send({
          code: "DOCUMENT_TEMPLATE_NOT_FOUND",
          message: "Modelo não encontrado.",
        });
      return reply.status(201).send(template);
    },
  );
  app.get(
    "/documents",
    { preHandler: authenticate },
    async (request) => repository.listIssuedDocuments(request.user.clinicId),
  );
  app.post(
    "/documents",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createIssuedDocument(
            request.user.clinicId,
            request.user.sub,
            issuedDocumentInputSchema.parse(request.body),
          ),
        ),
  );
  app.patch(
    "/documents/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const status = documentTransitionSchema.parse(
        (request.body as { status?: unknown }).status,
      );
      const document = await repository.updateIssuedDocumentStatus(
        request.user.clinicId,
        id,
        status,
      );
      if (!document)
        return reply.status(404).send({
          code: "DOCUMENT_NOT_FOUND",
          message: "Documento não encontrado.",
        });
      return document;
    },
  );

  app.get(
    "/reports/management",
    { preHandler: authenticate },
    async (request) => {
      const filter = managementReportFilterSchema.parse(request.query);
      return repository.getManagementReport(
        request.user.clinicId,
        filter.from,
        filter.to,
      );
    },
  );
  app.get(
    "/reports/retention",
    { preHandler: authenticate },
    async (request) => {
      const filter = retentionReportFilterSchema.parse(request.query);
      const today = saoPauloToday();
      const period = resolveRetentionPeriod(filter, today);
      const { clinicId } = request.user;
      // Toda a história: "novo" depende da primeira atividade do cliente; o
      // relatório descarta o que cai fora dos meses pedidos.
      const [appointments, plans] = await Promise.all([
        repository.listAppointments(
          clinicId,
          "1900-01-01T00:00:00.000Z",
          "9999-12-31T00:00:00.000Z",
        ),
        repository.listPatientPlans(clinicId),
      ]);
      return buildRetentionReport(period, { appointments, plans }, today);
    },
  );
  app.get(
    "/reports/clients",
    { preHandler: authenticate },
    async (request) => {
      const filter = clientReportFilterSchema.parse(request.query);
      const { clinicId } = request.user;
      const settings = await repository.getClinicSettings(clinicId);
      const timeZone = settings?.timezone || DEFAULT_CLINIC_TIMEZONE;
      const period = resolveClientReportPeriod(
        filter,
        clinicDateOf(new Date(), timeZone),
      );
      // Janela folgada de um dia em cada ponta; o relatório filtra pela data
      // no fuso da clínica.
      const day = 24 * 60 * 60 * 1000;
      const [patients, appointments, plans, payments] = await Promise.all([
        repository.listPatients(clinicId),
        repository.listAppointments(
          clinicId,
          new Date(Date.parse(`${period.from}T00:00:00.000Z`) - day).toISOString(),
          new Date(Date.parse(`${period.to}T00:00:00.000Z`) + 2 * day).toISOString(),
        ),
        repository.listPatientPlans(clinicId),
        repository.listReceivedPayments(clinicId, period.from, period.to),
      ]);
      return buildClientReport(
        period,
        { patients, appointments, plans, payments },
        timeZone,
      );
    },
  );
  app.get(
    "/reports/sales",
    { preHandler: authenticate },
    async (request) => {
      const { month } = salesReportFilterSchema.parse(request.query);
      return repository.getSalesReport(request.user.clinicId, month);
    },
  );
  app.get(
    "/reports/sales.xlsx",
    { preHandler: authenticate },
    async (request, reply) => {
      const { month } = salesReportFilterSchema.parse(request.query);
      const report = await repository.getSalesReport(request.user.clinicId, month);
      return reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
          "Content-Disposition",
          `attachment; filename="vendas-${month}.xlsx"`,
        )
        .send(await salesReportToXlsx(report));
    },
  );
  app.get(
    "/reports/management.csv",
    { preHandler: authenticate },
    async (request, reply) => {
      const filter = managementReportFilterSchema.parse(request.query);
      const report = await repository.getManagementReport(
        request.user.clinicId,
        filter.from,
        filter.to,
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="relatorio-${filter.from}-${filter.to}.csv"`,
        )
        .send(reportToCsv(report));
    },
  );

  return app;
}
