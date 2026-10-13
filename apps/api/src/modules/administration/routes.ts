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
