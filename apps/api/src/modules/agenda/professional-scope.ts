import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";

/**
 * Profissionais cuja agenda a requisição enxerga (`undefined` = todos). Com "Ver agenda de
 * todos os profissionais", vale a escolha enviada (vazia = todos); sem ela, só o profissional
 * ligado ao usuário, ou nenhum quando não há vínculo.
 */
export function agendaProfessionalScope({
  repository,
  requestAccess,
}: Pick<RouteContext, "repository" | "requestAccess">) {
  return async (
    request: FastifyRequest,
    requested: readonly string[] = [],
  ): Promise<readonly string[] | undefined> => {
    if (requestAccess.get(request)?.permissions.includes("agenda.view_all"))
      return requested.length > 0 ? requested : undefined;
    const own = (
      await repository.getOwnProfile(request.user.clinicId, request.user.sub)
    )?.professional?.id;
    return own ? [own] : [];
  };
}

/** Itens sem profissional (ex.: bloqueio só de sala) continuam visíveis para todos. */
export function inProfessionalScope<
  T extends { professionalId?: string | null | undefined },
>(items: T[], scope: readonly string[] | undefined) {
  return scope
    ? items.filter(
        (item) => !item.professionalId || scope.includes(item.professionalId),
      )
    : items;
}

/** `?professionalIds=a,b` do painel inicial. */
export const professionalIdsQuery = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : []))
  .pipe(z.array(z.uuid()).max(100));
