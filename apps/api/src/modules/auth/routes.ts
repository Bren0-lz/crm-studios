import {
  loginSchema,
  ownPasswordChangeSchema,
  ownProfileUpdateSchema,
  type ApiError,
  type UserSummary,
} from "@crm/contracts";
import { compare } from "bcryptjs";
import { config } from "../../config.js";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import { preparePassword } from "../../security/password-storage.js";
import { inspectClinicalAttachment } from "../clinical/clinical-integrity.js";

export function registerAuthRoutes(context: RouteContext) {
  const { app, loginAttempts, repository, toUserSummary, authenticate } =
    context;

  /** Resumo do usuário com a foto do perfil (só no login e em `/me`). */
  async function withAvatar(user: UserSummary & { clinicId: string }) {
    const profile = await repository.getOwnProfile(user.clinicId, user.id);
    const summary = toUserSummary(user);
    return profile?.avatarDataUrl
      ? { ...summary, avatarDataUrl: profile.avatarDataUrl }
      : summary;
  }

  function signSession(user: {
    id: string;
    clinicId: string;
    role: UserSummary["role"];
    sessionVersion?: number;
  }) {
    return app.jwt.sign(
      {
        sub: user.id,
        clinicId: user.clinicId,
        role: user.role,
        sessionVersion: user.sessionVersion ?? 0,
      },
      { expiresIn: "8h" },
    );
  }

  app.post(
    "/auth/logout-all",
    { preHandler: authenticate },
    async (request, reply) => {
      await repository.revokeUserSessions(
        request.user.clinicId,
        request.user.sub,
        request.user.sub,
      );
      return reply.status(204).send();
    },
  );

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
    return { token: signSession(user), user: await withAvatar(user) };
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
    return withAvatar(user);
  });

  app.get(
    "/me/profile",
    { preHandler: authenticate },
    async (request, reply) => {
      const profile = await repository.getOwnProfile(
        request.user.clinicId,
        request.user.sub,
      );
      if (!profile)
        return reply
          .status(404)
          .send({ code: "USER_NOT_FOUND", message: "Usuário não encontrado." });
      return profile;
    },
  );

  app.put(
    "/me/profile",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = ownProfileUpdateSchema.parse(request.body);
      if (input.avatarDataUrl) validateAvatar(input.avatarDataUrl);
      const profile = await repository.updateOwnProfile(
        request.user.clinicId,
        request.user.sub,
        input,
      );
      if (!profile)
        return reply
          .status(404)
          .send({ code: "USER_NOT_FOUND", message: "Usuário não encontrado." });
      return profile;
    },
  );

  // Troca a própria senha; as outras sessões caem e esta recebe um token novo.
  app.post("/me/password", { preHandler: authenticate }, async (request) => {
    const input = ownPasswordChangeSchema.parse(request.body);
    const { clinicId, sub } = request.user;
    const user = await repository.findUserById(clinicId, sub);
    if (!user || !(await compare(input.currentPassword, user.passwordHash)))
      throw new DomainError(
        "INVALID_CURRENT_PASSWORD",
        "A senha atual não confere.",
        400,
      );
    if (await compare(input.newPassword, user.passwordHash))
      throw new DomainError(
        "SAME_PASSWORD",
        "A nova senha precisa ser diferente da atual.",
        400,
      );
    await repository.resetAdminUserPassword(
      clinicId,
      sub,
      sub,
      await preparePassword(input.newPassword),
    );
    const updated = (await repository.findUserById(clinicId, sub))!;
    return { token: signSession(updated), user: await withAvatar(updated) };
  });
}

/** Foto do perfil: PNG ou JPEG de até 2 MB, com o conteúdo conferido. */
function validateAvatar(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(dataUrl)!;
  const size = Buffer.from(match[2]!, "base64").length;
  if (size > 2 * 1024 * 1024)
    throw new DomainError("AVATAR_TOO_LARGE", "A foto pode ter até 2 MB.", 413);
  inspectClinicalAttachment({
    patientId: "00000000-0000-4000-8000-000000000000",
    fileName: "foto",
    mimeType: match[1] as "image/png" | "image/jpeg",
    sizeInBytes: size,
    contentBase64: match[2]!,
  });
}
