import { loginSchema, type ApiError } from "@crm/contracts";
import { compare } from "bcryptjs";
import { config } from "../../config.js";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerAuthRoutes(context: RouteContext) {
  const { app, loginAttempts, repository, toUserSummary, authenticate } =
    context;

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
}
