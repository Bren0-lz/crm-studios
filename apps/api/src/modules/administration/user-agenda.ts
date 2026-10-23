import type { UserBranchAccess, UserRole } from "@crm/contracts";
import { DomainError } from "../../repository.js";

export function assertUserAgendaBranch(
  branchId: string,
  role: UserRole,
  access: UserBranchAccess,
) {
  if (
    role !== "admin" &&
    !access.allBranches &&
    !access.branchIds.includes(branchId)
  )
    throw new DomainError(
      "USER_PROFESSIONAL_BRANCH_MISMATCH",
      "O usuário precisa ter acesso à filial do profissional da agenda.",
      409,
    );
}
