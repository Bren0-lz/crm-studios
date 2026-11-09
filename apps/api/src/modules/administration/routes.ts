import { z } from "zod";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../clinical/clinical-integrity.js";
import {
  adminUserCommissionInputSchema,
  adminUserInputSchema,
  adminUserProfessionalInputSchema,
  adminUserUpdateSchema,
  autoFinalizationSettingsInputSchema,
  commissionRecalculationConfirmationSchema,
  paymentMethodSettingsInputSchema,
  clinicSettingsInputSchema,
  isValidTaxId,
  navTabLabelsInputSchema,
  passwordResetSchema,
  type PermissionMatrixItem,
} from "@crm/contracts";
import { createRateLimiter } from "../../infrastructure/rate-limit.js";
import type { RouteContext } from "../../infrastructure/route-context.js";
import {
  preparePassword,
  revealPassword,
} from "../../security/password-storage.js";

/** Regras de comissão gravadas pelo usuário recalculam as comissões já lançadas. */
function recalculationOf(body: unknown) {
  const { recalculationDigest } =
    commissionRecalculationConfirmationSchema.parse(body);
  return recalculationDigest ? { expectedDigest: recalculationDigest } : {};
}

/** Consultas de senha por admin a cada minuto (cada uma gera um registro de auditoria). */
export const PASSWORD_REVEAL_LIMIT = 20;

export function registerAdministrationRoutes(context: RouteContext) {
  const { app, authenticate, autoFinalizer, repository, visibleHistory } =
    context;
  const passwordReveals = createRateLimiter({
    limit: PASSWORD_REVEAL_LIMIT,
    windowMs: 60_000,
  });

  app.post(
    "/admin/users/:id/revoke-sessions",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      await repository.revokeUserSessions(
        request.user.clinicId,
        request.user.sub,
        id,
      );
      return reply.status(204).send();
    },
  );
  app.get("/admin/users", { preHandler: authenticate }, async (request) =>
    repository.listAdminUsers(request.user.clinicId),
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
            await preparePassword(input.password),
            recalculationOf(request.body),
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
        recalculationOf(request.body),
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
        await preparePassword(password),
      );
      if (!updated)
        return reply.status(404).send({
          code: "USER_NOT_FOUND",
          message: "Usuário não encontrado.",
        });
      return { updated: true };
    },
  );

  /**
   * Mostra a senha atual do usuário ao admin (POST: não fica em cache, pré-carga nem log de URL).
   * A consulta é auditada antes da resposta; se a auditoria falhar, a senha não sai. Erros de
   * decifragem ou de gravação viram uma mensagem genérica, sem o detalhe original.
   */
  app.post(
    "/admin/users/:id/reveal-password",
    { preHandler: authenticate },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const { clinicId, sub } = request.user;
      const limited = passwordReveals.hit(`${clinicId}:${sub}`);
      if (!limited.allowed)
        return reply
          .status(429)
          .header("retry-after", String(limited.retryAfter))
          .send({
            code: "TOO_MANY_REQUESTS",
            message:
              "Muitas consultas de senha em pouco tempo. Aguarde um minuto e tente de novo.",
          });
      const stored = await repository.findUserPasswordEncrypted(clinicId, id);
      if (!stored.found)
        return reply.status(404).send({
          code: "USER_NOT_FOUND",
          message: "Usuário não encontrado.",
        });
      if (!stored.encrypted)
        return reply.status(409).send({
          code: "PASSWORD_NOT_AVAILABLE",
          message:
            "A senha atual não está disponível para visualização. Ela ficará disponível após uma nova troca de senha.",
        });
      let password: string;
      try {
        password = revealPassword(stored.encrypted);
        await repository.recordUserPasswordViewed(clinicId, sub, id);
      } catch {
        // Sem o objeto de erro no log: a mensagem do banco pode carregar dados sensíveis.
        request.log.error("Falha ao visualizar a senha de um usuário.");
        return reply.status(500).send({
          code: "PASSWORD_REVEAL_FAILED",
          message: "Não foi possível visualizar a senha.",
        });
      }
      return { password };
    },
  );

  // Liga/desliga o usuário a um profissional da agenda; ligar outro troca a ligação.
  app.put(
    "/admin/users/:id/professional",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { professionalId } = adminUserProfessionalInputSchema.parse(
        request.body,
      );
      const user = await repository.setAdminUserProfessional(
        request.user.clinicId,
        request.user.sub,
        id,
        professionalId,
      );
      if (!user)
        return reply.status(404).send({
          code: "USER_NOT_FOUND",
          message: "Usuário não encontrado.",
        });
      return user;
    },
  );

  // Nova regra de comissão do próprio usuário (não exige profissional ligado).
  app.put(
    "/admin/users/:id/commission",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await repository.setAdminUserCommission(
        request.user.clinicId,
        request.user.sub,
        id,
        adminUserCommissionInputSchema.parse(request.body),
        recalculationOf(request.body),
      );
      if (!user)
        return reply.status(404).send({
          code: "USER_NOT_FOUND",
          message: "Usuário não encontrado.",
        });
      return user;
    },
  );

  app.get("/clinic/branding", { preHandler: authenticate }, async (request) => {
    const settings = await repository.getClinicSettings(request.user.clinicId);
    return {
      name: settings?.name ?? "Studios Aryana",
      logoDataUrl: settings?.logoDataUrl ?? "",
      timezone: settings?.timezone ?? "America/Sao_Paulo",
      // Dados da empresa para o cabeçalho e a prévia de contratos.
      legalName: settings?.legalName ?? "",
      taxId: settings?.taxId ?? "",
      address: settings?.address ?? "",
      phone: settings?.phone ?? "",
      email: settings?.email ?? "",
      // Chave Pix para a cobrança enviada no cadastro do cliente.
      pixKey: settings?.pixKey ?? "",
      pixMessageTemplate: settings?.pixMessageTemplate ?? "",
    };
  });
  // Nomes das abas do menu (o admin pode renomeá-los; a chave da aba não muda).
  app.get("/clinic/nav-tabs", { preHandler: authenticate }, async (request) =>
    repository.listNavTabLabels(request.user.clinicId),
  );
  app.put("/admin/nav-tabs", { preHandler: authenticate }, async (request) =>
    repository.saveNavTabLabels(
      request.user.clinicId,
      navTabLabelsInputSchema.parse(request.body),
    ),
  );

  // Finalização automática: todos leem (a agenda mostra os concluídos); só o admin altera.
  app.get(
    "/clinic/auto-finalization",
    { preHandler: authenticate },
    async (request) =>
      repository.getAutoFinalizationSettings(request.user.clinicId),
  );
  app.put(
    "/admin/auto-finalization",
    { preHandler: authenticate },
    async (request) => {
      const saved = await repository.updateAutoFinalizationSettings(
        request.user.clinicId,
        request.user.sub,
        autoFinalizationSettingsInputSchema.parse(request.body),
      );
      // Ao ligar ou encurtar a espera, o que já venceu é finalizado na hora.
      await autoFinalizer.run(request.user.clinicId, { force: true });
      return saved;
    },
  );

  // Parcelamento por forma de pagamento: todos leem (as vendas limitam as parcelas); só o admin altera.
  app.get(
    "/clinic/payment-methods",
    { preHandler: authenticate },
    async (request) =>
      repository.getPaymentMethodSettings(request.user.clinicId),
  );
  app.put(
    "/admin/payment-methods",
    { preHandler: authenticate },
    async (request) =>
      repository.updatePaymentMethodSettings(
        request.user.clinicId,
        request.user.sub,
        paymentMethodSettingsInputSchema.parse(request.body),
      ),
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
        validatedClinicSettings(request.body),
      ),
  );

  app.get(
    "/admin/audit-events",
    { preHandler: authenticate },
    async (request) =>
      (await repository.listAdminAuditEvents(request.user.clinicId)).map(
        (event) => visibleHistory(request, event),
      ),
  );

  app.get(
    "/admin/permission-matrix",
    { preHandler: authenticate },
    async (): Promise<PermissionMatrixItem[]> => {
      const everything = ["Todos os módulos", "Administração"];
      // Sem padrões por perfil: o usuário comum novo começa sem nenhum módulo.
      return [
        { role: "admin", modules: everything, editModules: [...everything] },
        { role: "user", modules: [], editModules: [] },
      ];
    },
  );
}

function validatedClinicSettings(body: unknown) {
  const taxId = (body as { taxId?: unknown } | null)?.taxId;
  if (typeof taxId === "string" && taxId.trim() && !isValidTaxId(taxId))
    throw new DomainError(
      "INVALID_TAX_ID",
      "Informe um CPF ou CNPJ válido, com os dígitos verificadores corretos.",
      400,
    );
  const input = clinicSettingsInputSchema.parse(body);
  if (input.logoDataUrl) {
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(
      input.logoDataUrl,
    )!;
    const size = Buffer.from(match[2]!, "base64").length;
    if (size > 2 * 1024 * 1024)
      throw new DomainError(
        "CLINIC_LOGO_TOO_LARGE",
        "O logotipo pode ter até 2 MB.",
        413,
      );
    inspectClinicalAttachment({
      patientId: "00000000-0000-4000-8000-000000000000",
      fileName: "logotipo",
      mimeType: match[1] as "image/png" | "image/jpeg",
      sizeInBytes: size,
      contentBase64: match[2]!,
    });
  }
  return input;
}
