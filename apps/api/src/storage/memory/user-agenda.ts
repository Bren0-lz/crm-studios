import type { AdminUserInput, AdminUserUpdate } from "@crm/contracts";
import { DomainError, type AuthenticatedUser } from "../../repository.js";
import { assertUserAgendaBranch } from "../../modules/administration/user-agenda.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid } from "./helpers.js";

/** Valida sem efeitos; a função devolvida só é chamada após o preflight do formulário. */
export function prepareUserAgenda(
  context: MemoryRepositoryContext,
  user: AuthenticatedUser,
  input: AdminUserInput | AdminUserUpdate,
  actorUserId: string,
) {
  const operation = input.professional;
  const previous = context.linkedProfessional(user.clinicId, user.id);
  let professional = previous;
  if (operation?.mode === "create") {
    professional = {
      ...operation.data,
      id: uuid(),
      clinicId: user.clinicId,
      branchId: context.writeBranchId(user.clinicId),
      active: true,
    };
  } else if (operation?.mode === "save") {
    professional = context.professionals.find(
      (p) => p.clinicId === user.clinicId && p.id === operation.id,
    );
    if (
      !professional ||
      (!professional.active && professional.id !== previous?.id)
    )
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional ativo não encontrado.",
        404,
      );
    const owner = context.professionalUsers.get(professional.id);
    if (owner && owner !== user.id)
      throw new DomainError(
        "PROFESSIONAL_ALREADY_LINKED",
        "Este profissional já está ligado a outro usuário.",
        409,
      );
  }
  if (professional && operation)
    context.assertBranchInScope(context.branchOf(professional));
  if (previous && operation && previous.id !== professional?.id)
    context.assertBranchInScope(context.branchOf(previous));
  if (professional && (operation || input.branchAccess)) {
    assertUserAgendaBranch(
      context.branchOf(professional),
      input.role,
      input.branchAccess ?? {
        allBranches: user.allBranches ?? true,
        branchIds: user.branchIds ?? [],
      },
    );
  }
  if (
    professional &&
    operation &&
    operation.mode !== "deactivate" &&
    context.professionals.some(
      (p) =>
        p.clinicId === user.clinicId &&
        p.id !== professional.id &&
        context.branchOf(p) === context.branchOf(professional) &&
        p.crefito.toLowerCase() === operation.data.crefito.toLowerCase(),
    )
  )
    throw new DomainError(
      "PROFESSIONAL_CREFITO_EXISTS",
      "Já existe um profissional com este registro.",
      409,
    );
  return () => {
    if (!professional || !operation) return;
    if (operation.mode === "create") context.professionals.push(professional);
    if (operation.mode === "deactivate") professional.active = false;
    else Object.assign(professional, operation.data, { active: true });
    if (previous && previous.id !== professional.id)
      context.professionalUsers.delete(previous.id);
    context.professionalUsers.set(professional.id, user.id);
    // A implementação em memória mantém os nomes desnormalizados das telas.
    for (const items of [
      context.appointments,
      context.groupClasses,
      context.groupSessions,
    ])
      for (const item of items)
        if (
          item.clinicId === user.clinicId &&
          item.professionalId === professional.id
        ) {
          item.professionalName = professional.fullName;
          if ("professionalColor" in item)
            item.professionalColor = professional.color;
        }
    context.addAdminAudit(
      actorUserId,
      "users.professional_updated",
      "user",
      user.id,
      {
        professionalId: professional.id,
        previousProfessionalId: previous?.id ?? null,
        active: professional.active,
      },
      user.clinicId,
    );
  };
}
