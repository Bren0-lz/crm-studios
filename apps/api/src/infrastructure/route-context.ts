import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../modules/finance/daily-cash.js";
import {
  type AdminAuditEvent,
  type ApiError,
  BRANCH_HEADER,
  EXTERNAL_USER_TOKEN_HEADER,
  type BranchScope,
  type AppModule,
  appModuleLabels,
  type AuditChange,
  type AuditFieldLabel,
  broadcastInputSchema,
  changeReasonSchema,
  diffAuditFields,
  historyAction,
  installmentsIssue,
  installmentsLimit,
  INTEGRATION_TOKEN_PREFIX,
  type IntegrationKey,
  type IntegrationScope,
  type PaymentMethod,
  type PatientImportAnalysis,
  patientImportFileSchema,
  type PatientInput,
  permissionCatalog,
  type PermissionKey,
  resolvePatientTags,
  withoutAutomaticPatientTags,
  saoPauloToday,
  withPlanFirstCharge,
  planAllowsProratedCharge,
  serviceAvailableFor,
  type UserSummary,
  ptBrValidationError,
  validationErrorMessage,
} from "@crm/contracts";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { createAutoFinalizer } from "../modules/agenda/auto-finalization.js";
import { hashIntegrationToken } from "../modules/integrations/tokens.js";
import { buildBroadcast } from "../modules/communications/broadcast.js";
import {
  decodeCsvText,
  parseCsv,
  readXlsxRows,
  validatePatientImport,
} from "../modules/patients/patient-import.js";
import { type AuthenticatedUser, DomainError } from "../repository.js";
import {
  moduleDeniedCodes,
  type ModuleRequirement,
  ROUTE_ACCESS,
} from "./route-access.js";

/** Requisições por minuto de cada chave de integração (API externa). */
export const INTEGRATION_RATE_LIMIT = 120;
import { type BuildAppOptions } from "./route-utils.js";

// Regras padrão do zod em pt-BR: a resposta 400 diz ao usuário o que corrigir.
z.config({ customError: ptBrValidationError });

export async function createRouteContext({
  repository,
  logger = true,
  trustProxy = config.TRUST_PROXY,
}: BuildAppOptions) {
  const app = Fastify({
    logger,
    bodyLimit: 8 * 1024 * 1024,
    // Só os N últimos saltos, nunca `true`: confiar em qualquer X-Forwarded-For deixa o
    // cliente escolher o IP gravado na assinatura e burlar o bloqueio de tentativas de login.
    ...(trustProxy > 0
      ? { trustProxy: (_address: string, hop: number) => hop < trustProxy }
      : {}),
  });

  const loginAttempts = new Map<
    string,
    { failures: number; blockedUntil?: number }
  >();

  const autoFinalizer = createAutoFinalizer(repository);

  const webOrigins = new Set([config.WEB_ORIGIN]);

  if (config.NODE_ENV !== "production") {
    const localOrigin = new URL(config.WEB_ORIGIN);
    if (
      localOrigin.hostname === "localhost" ||
      localOrigin.hostname === "127.0.0.1"
    ) {
      localOrigin.hostname =
        localOrigin.hostname === "localhost" ? "127.0.0.1" : "localhost";
      webOrigins.add(localOrigin.origin);
    }
  }

  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || webOrigins.has(origin)),
    // O @fastify/cors 11 libera só GET, HEAD e POST por padrão; sem isto o navegador
    // bloqueia PUT/PATCH/DELETE com "Failed to fetch".
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });

  await app.register(jwt, { secret: config.JWT_SECRET });

  // Cada requisição ganha o próprio contexto de filial (gravado no `authenticate`).
  app.addHook("onRequest", (_request, _reply, done) =>
    repository.branchScope.open(done),
  );

  /**
   * O que mudou em cada edição (PUT/PATCH): o motivo opcional (`changeReason` no corpo) e os
   * campos alterados informados pela rota (`recordChanges`). Vão para o evento da operação.
   */
  const editRecords = new WeakMap<
    FastifyRequest,
    { reason?: string; changes?: AuditChange[] }
  >();

  // Tira o `changeReason` do corpo antes das rotas validarem: os schemas não mudam.
  app.addHook("preValidation", async (request) => {
    if (request.method !== "PUT" && request.method !== "PATCH") return;
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    if (!("changeReason" in body)) return;
    const { changeReason, ...rest } = body as Record<string, unknown>;
    const reason = changeReasonSchema.parse(changeReason ?? undefined);
    request.body = rest;
    if (reason) editRecords.set(request, { reason });
  });

  /** Guarda os campos alterados pela edição; o histórico os mostra como "antes → depois". */
  function recordChanges(
    request: FastifyRequest,
    before: object | null | undefined,
    after: object | null | undefined,
    labels: Record<string, AuditFieldLabel>,
  ) {
    const changes = diffAuditFields(before, after, labels);
    editRecords.set(request, { ...editRecords.get(request), changes });
    return changes;
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      } satisfies ApiError);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "issues" in error &&
      Array.isArray(error.issues)
    ) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: validationErrorMessage(error.issues),
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
      permissions: user.permissions,
    };
  }

  /** Módulos e edição efetivos do usuário da requisição (lidos do repositório no `authenticate`). */
  const requestAccess = new WeakMap<
    FastifyRequest,
    { modules: readonly AppModule[]; permissions: readonly PermissionKey[] }
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
    // O token do painel de vendas só vale na API externa, junto da chave de integração.
    if (request.user.kind === "dashboard")
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Sua sessão expirou. Entre novamente.",
      } satisfies ApiError);
    const user = await repository.findUserById(
      request.user.clinicId,
      request.user.sub,
    );
    if (
      !user ||
      (request.user.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)
    )
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Sua sessão não é mais válida. Entre novamente.",
      } satisfies ApiError);
    request.user.role = user.role;
    requestAccess.set(request, {
      modules: user.modules,
      permissions: user.permissions,
    });
    const scope = await resolveBranchScope(request, user);
    if ("code" in scope) return reply.status(403).send(scope);
    repository.branchScope.set(scope);
    // Falha da finalização automática não pode derrubar a requisição do usuário.
    try {
      await autoFinalizer.run(request.user.clinicId);
    } catch (error) {
      request.log.error(error);
    }
  }

  const dashboardAccessDenied = {
    code: "DASHBOARD_ACCESS_DENIED",
    message:
      "Seu usuário não tem acesso ao painel de vendas. Peça a um administrador para liberar em Administração › Usuários.",
  } satisfies ApiError;

  /** Chave de integração da requisição da API externa (gravada no `authenticateApiKey`). */
  const integrationKeys = new WeakMap<FastifyRequest, IntegrationKey>();
  /** Janela de 1 minuto de requisições e último registro de uso de cada chave. */
  const integrationUsage = new Map<
    string,
    { windowStartedAt: number; count: number; touchedAt: number }
  >();

  /**
   * API externa (`/external/v1`): valida a chave de integração (`Authorization: Bearer crm_…`)
   * pelo hash, o escopo e o limite por minuto. A requisição segue como o admin que criou a
   * chave: permissões, filiais e histórico dele; criador desativado invalida a chave.
   */
  function authenticateApiKey(scope: IntegrationScope) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const header = request.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      const found = token.startsWith(INTEGRATION_TOKEN_PREFIX)
        ? await repository.findIntegrationKeyByTokenHash(
            hashIntegrationToken(token),
          )
        : null;
      const invalid = {
        code: "INTEGRATION_KEY_INVALID",
        message: "Chave de integração inválida ou revogada.",
      } satisfies ApiError;
      if (!found) return reply.status(401).send(invalid);
      const { clinicId, key } = found;
      const nowMs = Date.now();
      const usage = integrationUsage.get(key.id) ?? {
        windowStartedAt: nowMs,
        count: 0,
        touchedAt: 0,
      };
      if (nowMs - usage.windowStartedAt >= 60_000) {
        usage.windowStartedAt = nowMs;
        usage.count = 0;
      }
      usage.count += 1;
      integrationUsage.set(key.id, usage);
      if (usage.count > INTEGRATION_RATE_LIMIT) {
        const retryAfter = Math.ceil(
          (usage.windowStartedAt + 60_000 - nowMs) / 1000,
        );
        return reply
          .status(429)
          .header("retry-after", String(retryAfter))
          .send({
            code: "RATE_LIMITED",
            message: `Limite de ${INTEGRATION_RATE_LIMIT} requisições por minuto atingido. Tente novamente em ${retryAfter}s.`,
          } satisfies ApiError);
      }
      if (!key.scopes.includes(scope))
        return reply.status(403).send({
          code: "INTEGRATION_SCOPE_DENIED",
          message: `Esta chave não tem o escopo ${scope}.`,
          details: { scope },
        } satisfies ApiError);
      const userToken = request.headers[EXTERNAL_USER_TOKEN_HEADER];
      const actor =
        typeof userToken === "string" && userToken
          ? await dashboardUser(clinicId, userToken)
          : await repository.findUserById(clinicId, key.createdByUserId);
      if (actor && "code" in actor)
        return reply
          .status(actor.code === "DASHBOARD_ACCESS_DENIED" ? 403 : 401)
          .send(actor);
      const user = actor;
      if (!user) return reply.status(401).send(invalid);
      request.user = {
        sub: user.id,
        clinicId,
        role: user.role,
        sessionVersion: user.sessionVersion ?? 0,
      };
      integrationKeys.set(request, key);
      requestAccess.set(request, {
        modules: user.modules,
        permissions: user.permissions,
      });
      const branchScope = await resolveBranchScope(request, user);
      if ("code" in branchScope) return reply.status(403).send(branchScope);
      repository.branchScope.set(branchScope);
      // Último uso: no máximo uma gravação por minuto; falha não derruba a chamada.
      if (nowMs - usage.touchedAt >= 60_000) {
        usage.touchedAt = nowMs;
        try {
          await repository.touchIntegrationKey(clinicId, key.id);
        } catch (error) {
          request.log.error(error);
        }
      }
    };
  }

  /**
   * Usuário do token do painel de vendas (`X-CRM-User-Token`, emitido no login externo): da
   * mesma clínica da chave, ativo, sem sessões revogadas e ainda com acesso ao painel — tirar
   * a permissão derruba o acesso na próxima chamada.
   */
  async function dashboardUser(
    clinicId: string,
    token: string,
  ): Promise<AuthenticatedUser | ApiError> {
    const expired = {
      code: "USER_TOKEN_INVALID",
      message: "Sua sessão no painel de vendas expirou. Entre novamente.",
    } satisfies ApiError;
    let payload: FastifyRequest["user"];
    try {
      payload = app.jwt.verify<FastifyRequest["user"]>(token);
    } catch {
      return expired;
    }
    if (payload.kind !== "dashboard" || payload.clinicId !== clinicId)
      return expired;
    const user = await repository.findUserById(clinicId, payload.sub);
    if (!user || (payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0))
      return expired;
    if (!user.dashboardAccess) return dashboardAccessDenied;
    return user;
  }

  /** Filiais ativas que o usuário acessa (admin e "todas as filiais": todas as ativas). */
  async function accessibleBranches(user: AuthenticatedUser) {
    const branches = (await repository.listBranches(user.clinicId)).filter(
      (branch) => branch.active,
    );
    return user.role === "admin" || (user.allBranches ?? true)
      ? branches
      : branches.filter((branch) => user.branchIds?.includes(branch.id));
  }

  /**
   * Escopo de filial da requisição: com `X-Branch-Id`, só essa filial (403 se o usuário não a
   * acessa); sem o cabeçalho, todas as filiais do usuário (`null` = toda a rede). Gravação sem
   * cabeçalho vai para a filial padrão, ou para a primeira do usuário se ele não a acessa.
   */
  async function resolveBranchScope(
    request: FastifyRequest,
    user: AuthenticatedUser,
  ): Promise<BranchScope | ApiError> {
    const header = request.headers[BRANCH_HEADER];
    // "all" = consolidado explícito (ficha do cliente: histórico de todas as filiais).
    const requested =
      typeof header === "string" && header.trim() !== "all"
        ? header.trim()
        : "";
    const branches = await accessibleBranches(user);
    if (requested) {
      if (!branches.some((branch) => branch.id === requested))
        return {
          code: "BRANCH_ACCESS_DENIED",
          message: "Seu usuário não tem acesso a esta filial.",
        };
      return { branchIds: [requested], writeBranchId: requested };
    }
    if (branches.length === 0)
      return {
        code: "BRANCH_ACCESS_DENIED",
        message: "Seu usuário não tem acesso a nenhuma filial ativa.",
      };
    const everything = user.role === "admin" || (user.allBranches ?? true);
    const write = branches.find((branch) => branch.isDefault) ?? branches[0]!;
    return {
      branchIds: everything ? null : branches.map((branch) => branch.id),
      writeBranchId: write.id,
    };
  }

  /** Primeiro requisito que o usuário da requisição não cumpre (403 com `moduleDenied`). */
  function missingModule(
    request: FastifyRequest,
    requirements: readonly ModuleRequirement[],
  ) {
    const access = requestAccess.get(request);
    return requirements.find(
      ({ permission }) => !access?.permissions.includes(permission),
    );
  }

  function moduleDenied(missing: ModuleRequirement): ApiError {
    return {
      code: moduleDeniedCodes[missing.module],
      details: { permission: missing.permission ?? `${missing.module}.view` },
      message: `Seu usuário não possui permissão para ${
        missing.level === "edit" ? "editar" : "ver"
      } ${appModuleLabels[missing.module]}.`,
    };
  }

  /** Guarda por módulo e nível: exige todos os requisitos (ver `ROUTE_ACCESS`). */
  function requireModules(requirements: readonly ModuleRequirement[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const missing = missingModule(request, requirements);
      if (missing) return reply.status(403).send(moduleDenied(missing));
    };
  }

  /** Guarda "qualquer um de": basta um dos requisitos (ver `ROUTE_ACCESS`, `{ anyOf }`). */
  function requireAnyModule(requirements: readonly ModuleRequirement[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const access = requestAccess.get(request);
      const allowed = requirements.some(({ permission }) =>
        access?.permissions.includes(permission),
      );
      if (!allowed)
        return reply.status(403).send({
          code: moduleDeniedCodes[requirements[0]!.module],
          details: { permissions: requirements.map((item) => item.permission) },
          message: `Seu usuário não possui permissão para ${
            requirements[0]!.level === "edit" ? "editar" : "ver"
          } ${requirements.map(({ module }) => appModuleLabels[module]).join(" ou ")}.`,
        } satisfies ApiError);
    };
  }

  /** Administração: só usuário do tipo admin (tipo relido do repositório no `authenticate`). */
  function assertPermissions(
    request: FastifyRequest,
    ...keys: PermissionKey[]
  ) {
    for (const key of keys) {
      if (!requestAccess.get(request)?.permissions.includes(key)) {
        const item = permissionCatalog.find((item) => item.key === key)!;
        throw new DomainError(
          moduleDeniedCodes[item.module],
          `Acesso negado: ${item.name}.`,
          403,
          { permission: key },
        );
      }
    }
  }

  async function requireAdminAccess(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (request.user.role !== "admin")
      return reply.status(403).send({
        code: "ADMIN_ACCESS_REQUIRED",
        message: "Esta operação é restrita a usuários admin.",
      } satisfies ApiError);
  }

  // Aplica o mapa único `ROUTE_ACCESS` a cada rota registrada; rota fora do mapa não sobe.
  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    // Preflight CORS do @fastify/cors (`OPTIONS *`): sem dados, só cabeçalhos.
    if (
      methods.every((method) => method === "OPTIONS") &&
      routeOptions.url === "*"
    )
      return;
    // O Fastify cria a HEAD de cada GET copiando as opções originais (sem a guarda): a HEAD
    // recebe exatamente o acesso do GET correspondente.
    const method = methods[0] === "HEAD" ? "GET" : methods[0];
    const key = `${method} ${routeOptions.url}`;
    const access = ROUTE_ACCESS[key];
    if (!access)
      throw new Error(`Rota sem acesso definido em ROUTE_ACCESS: ${key}`);
    if (access === "public") return;
    if (typeof access === "object" && "apiKey" in access) {
      routeOptions.preHandler = [
        authenticateApiKey(access.apiKey),
        requireModules(access.requires),
      ];
      return;
    }
    routeOptions.preHandler = [
      authenticate,
      ...(access === "admin"
        ? [requireAdminAccess]
        : access === "login"
          ? []
          : Array.isArray(access)
            ? [requireModules(access)]
            : [requireAnyModule(access.anyOf)]),
    ];
  });

  // Record successful business commands, never request bodies, credentials or clinical text.
  // Domain journals remain transactional; this entry records the authenticated API action.
  app.addHook("onSend", async (request, reply, payload) => {
    const route = request.routeOptions.url;
    if (
      !route ||
      !requestAccess.has(request) ||
      !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
      reply.statusCode < 200 ||
      reply.statusCode >= 300 ||
      // API externa: a gravação repassada à rota interna já entra no histórico por lá.
      route.startsWith("/external/") ||
      route.startsWith("/agenda-notes") ||
      route.startsWith("/admin/users") ||
      route.startsWith("/admin/branches") ||
      route === "/admin/clinic-settings" ||
      route.startsWith("/patient-tags") ||
      route.startsWith("/plan-templates") ||
      route.endsWith("/preview")
    )
      return payload;
    const access = ROUTE_ACCESS[`${request.method} ${route}`];
    const requirements = Array.isArray(access)
      ? access
      : typeof access === "object" && "anyOf" in access
        ? access.anyOf
        : [];
    const requirement = requirements.find((item) =>
      requestAccess.get(request)?.permissions.includes(item.permission),
    );
    const module = requirement?.module ?? "settings";
    const action = requirement
      ? `operation.${requirement.permission}`
      : `operation.${request.method.toLowerCase()}.${route}`;
    const metadata: Record<string, unknown> = {
      _module: module,
      _description: historyAction(action)?.label ?? "Configuração alterada",
      method: request.method,
      route,
      params: request.params,
      statusCode: reply.statusCode,
    };
    const edit = editRecords.get(request);
    if (edit?.changes) metadata.changes = edit.changes;
    if (edit?.reason) metadata.reason = edit.reason;
    const params = request.params as Record<string, unknown>;
    let entityId = z.uuid().safeParse(params.id).data;
    if (typeof payload === "string" && payload.startsWith("{")) {
      try {
        const result = JSON.parse(payload);
        entityId = z.uuid().safeParse(result.id).data ?? entityId;
        if (module !== "clinical") {
          const name = result.fullName ?? result.name ?? result.title;
          if (typeof name === "string") metadata.subjectName = name;
        }
      } catch {
        /* Non-JSON responses have no result ID. */
      }
    }
    try {
      await repository.recordAdminAuditEvent(
        request.user.clinicId,
        request.user.sub,
        action,
        module,
        metadata,
        entityId,
      );
    } catch (error) {
      // The business operation has committed: do not turn it into a retryable 500.
      request.log.error(
        { err: error, action, clinicId: request.user.clinicId },
        "Failed to record system history",
      );
    }
    return payload;
  });

  function visibleHistory(
    request: FastifyRequest,
    event: AdminAuditEvent,
  ): AdminAuditEvent {
    if (event.module !== "clinical") return event;
    const permissions = requestAccess.get(request)?.permissions ?? [];
    const allowed =
      permissions.includes("clinical.view") &&
      (!event.action.startsWith("clinical.access.") ||
        permissions.includes("clinical.access_events"));
    if (allowed) return event;
    const summary = { ...event };
    delete summary.entityId;
    return {
      ...summary,
      entityType: "clinical",
      metadata: event.metadata.actorUnavailable
        ? { actorUnavailable: true }
        : {},
      detailsRestricted: true,
    };
  }

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

  /**
   * Recusa (409 `SERVICE_NOT_AVAILABLE`) atendimento com serviço que não é feito por aquele
   * profissional ou naquela sala (vínculos do serviço; vazio = todos). Serviço inexistente
   * segue para o repositório, que já responde com o erro próprio.
   */
  async function assertServiceAvailable(
    clinicId: string,
    items: { serviceId: string; professionalId: string; roomId: string }[],
  ) {
    if (!items.length) return;
    const services = await repository.listServices(clinicId);
    for (const item of items) {
      const service = services.find(
        (candidate) => candidate.id === item.serviceId,
      );
      if (
        service &&
        !serviceAvailableFor(service, item.professionalId, item.roomId)
      )
        throw new DomainError(
          "SERVICE_NOT_AVAILABLE",
          `O serviço ${service.name} não é atendido por este profissional ou nesta sala.`,
          409,
        );
    }
  }

  /**
   * Cobrança proporcional do plano recorrente, calculada aqui a partir dos horários da turma
   * (`groupId`). O valor enviado pela tela é descartado: sem turma, ou fora da regra, não há
   * cobrança proporcional. Com o cálculo desligado (`manualFirstCharge`, só no recorrente),
   * vale o valor do 1º pagamento informado (cobrado no início do plano).
   */
  async function withServerFirstCharge<
    T extends Parameters<typeof withPlanFirstCharge>[0],
  >(clinicId: string, plan: T, groupId?: string): Promise<T> {
    if (
      plan.manualFirstCharge &&
      planAllowsProratedCharge(plan) &&
      plan.proratedChargeInCents === undefined
    )
      throw new DomainError(
        "FIRST_CHARGE_REQUIRED",
        "Informe o valor do 1º pagamento.",
        400,
      );
    const today = saoPauloToday();
    const slots = groupId
      ? (
          await repository.getGroupWorkspace(clinicId, today, today)
        ).groups.find((group) => group.id === groupId)?.weeklySlots
      : undefined;
    return withPlanFirstCharge(plan, slots) as T;
  }

  /**
   * Recusa (400 `INSTALLMENTS_NOT_ALLOWED`) parcelas acima do aceito pela forma de pagamento
   * (Configurações › Formas de pagamento) e pelo plano do catálogo (`maxInstallments`).
   * Sem forma escolhida ("a combinar"), vale só o limite do plano.
   */
  async function assertInstallmentsAllowed(
    clinicId: string,
    input: {
      installments: number | undefined;
      paymentMethod?: PaymentMethod | undefined;
      planTemplateId?: string | undefined;
      /** Plano picado: cada forma com as cobranças dela. */
      paymentParts?:
        | readonly { paymentMethod: PaymentMethod; installments: number }[]
        | undefined;
      /** Pagamento picado: cada forma com o parcelamento nela. */
      payments?:
        | readonly {
            paymentMethod: PaymentMethod;
            paymentInstallments?: number | undefined;
          }[]
        | undefined;
    },
  ): Promise<void> {
    const parts =
      input.paymentParts?.map((part) => ({
        installments: part.installments,
        paymentMethod: part.paymentMethod,
      })) ??
      input.payments?.map((part) => ({
        installments: part.paymentInstallments,
        paymentMethod: part.paymentMethod,
      }));
    if (parts?.length) {
      for (const part of parts)
        await assertInstallmentsAllowed(clinicId, {
          ...part,
          planTemplateId: input.planTemplateId,
        });
      return;
    }
    if (!input.installments || input.installments <= 1) return;
    const [settings, templates] = await Promise.all([
      repository.getPaymentMethodSettings(clinicId),
      input.planTemplateId
        ? repository.listPlanTemplates(clinicId)
        : Promise.resolve([]),
    ]);
    const limit = installmentsLimit({
      settings,
      paymentMethod: input.paymentMethod,
      template: templates.find((item) => item.id === input.planTemplateId),
    });
    const issue = installmentsIssue(
      input.installments,
      limit,
      input.paymentMethod,
    );
    if (issue) throw new DomainError("INSTALLMENTS_NOT_ALLOWED", issue, 400);
  }

  /**
   * O cliente só recebe etiquetas configuradas: troca cada uma pela grafia oficial (sem
   * diferenciar maiúsculas/acentos) ou recusa com 400 listando as desconhecidas. Etiquetas
   * automáticas ("Pagamento atrasado") são calculadas na leitura: informadas à mão, são ignoradas.
   */
  async function withConfiguredTags(
    clinicId: string,
    input: PatientInput,
  ): Promise<PatientInput> {
    const manualTags = withoutAutomaticPatientTags(input.tags);
    if (manualTags.length === 0) return { ...input, tags: manualTags };
    const { tags, unknown } = resolvePatientTags(
      manualTags,
      await repository.listPatientTags(clinicId),
    );
    if (unknown.length > 0)
      throw new DomainError(
        "PATIENT_TAG_UNKNOWN",
        `${unknown.length === 1 ? "Etiqueta não configurada" : "Etiquetas não configuradas"}: ${unknown.join(", ")}. Cadastre em Configurações › Etiquetas.`,
        400,
        { unknownTags: unknown },
      );
    return { ...input, tags };
  }

  const patientTagNotFound = {
    code: "PATIENT_TAG_NOT_FOUND",
    message: "Etiqueta não encontrada.",
  } satisfies ApiError;

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
    const [patients, tags] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listPatientTags(clinicId),
    ]);
    return validatePatientImport(rows, patients, tags, file.mapping);
  }

  // Comunicado segmentado: a prévia não grava nada; o envio só enfileira
  // mensagens `manual` na outbox (nenhum disparo real).
  async function planBroadcast(clinicId: string, body: unknown) {
    const input = broadcastInputSchema.parse(body);
    const [patients, plans, center, settings] = await Promise.all([
      repository.listPatients(clinicId),
      input.segment.activePlan === undefined
        ? Promise.resolve([])
        : repository.listPatientPlans(clinicId),
      repository.getCommunicationCenter(clinicId),
      repository.getClinicSettings(clinicId),
    ]);
    const plan = buildBroadcast(
      patients,
      plans,
      center.preferences,
      input,
      clinicDateOf(new Date(), settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE),
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
  return {
    app,
    loginAttempts,
    repository,
    toUserSummary,
    authenticate,
    autoFinalizer,
    requestAccess,
    integrationKeys,
    dashboardAccessDenied,
    accessibleBranches,
    visibleHistory,
    recordChanges,
    withConfiguredTags,
    assertPermissions,
    assertNoHoliday,
    assertServiceAvailable,
    assertInstallmentsAllowed,
    withServerFirstCharge,
    patientTagNotFound,
    analyzePatientImport,
    planBroadcast,
    broadcastResult,
  };
}
export type RouteContext = Awaited<ReturnType<typeof createRouteContext>>;
