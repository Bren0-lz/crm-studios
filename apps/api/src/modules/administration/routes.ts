import { z } from "zod";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../clinical/clinical-integrity.js";
import {
  adminUserCommissionInputSchema,
  adminUserInputSchema,
  adminUserProfessionalInputSchema,
  adminUserUpdateSchema,
  clinicSettingsInputSchema,
  passwordResetSchema,
  type PermissionMatrixItem,
} from "@crm/contracts";
import { hash } from "bcryptjs";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerAdministrationRoutes(context: RouteContext) {
  const { app, authenticate, repository, visibleHistory } = context;

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
    };
  });
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
