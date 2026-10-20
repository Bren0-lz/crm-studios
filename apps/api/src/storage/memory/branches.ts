import type { Branch, BranchInput } from "@crm/contracts";
import { branchInputSchema } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid } from "./helpers.js";

export function createBranchesRepository(context: MemoryRepositoryContext) {
  return {
    async listBranches(clinicId: string) {
      context.defaultBranchId(clinicId);
      return structuredClone(
        context.branches
          .filter((branch) => branch.clinicId === clinicId)
          .sort(
            (a, b) =>
              Number(b.isDefault) - Number(a.isDefault) ||
              a.name.localeCompare(b.name),
          ),
      );
    },

    async saveBranch(
      clinicId: string,
      actorUserId: string,
      rawInput: BranchInput,
      id?: string,
    ) {
      const input = branchInputSchema.parse(rawInput);
      context.defaultBranchId(clinicId);
      const current = id
        ? context.branches.find(
            (branch) => branch.clinicId === clinicId && branch.id === id,
          )
        : undefined;
      if (id && !current) return null;
      if (
        context.branches.some(
          (branch) =>
            branch.clinicId === clinicId &&
            branch.id !== id &&
            branch.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        throw new DomainError(
          "BRANCH_NAME_DUPLICATE",
          "Já existe uma filial com este nome.",
          409,
        );
      if (current?.isDefault && !input.active)
        throw new DomainError(
          "BRANCH_DEFAULT_INACTIVE",
          "A filial padrão não pode ser desativada.",
          409,
        );
      const branch: Branch = current ?? {
        id: uuid(),
        clinicId,
        name: input.name,
        active: input.active,
        isDefault: false,
      };
      branch.name = input.name;
      branch.active = input.active;
      if (input.address) branch.address = input.address;
      else delete branch.address;
      if (input.phone) branch.phone = input.phone;
      else delete branch.phone;
      if (!current) context.branches.push(branch);
      context.addAdminAudit(
        actorUserId,
        current ? "branch.updated" : "branch.created",
        "branch",
        branch.id,
        { name: branch.name, active: branch.active },
        clinicId,
      );
      return structuredClone(branch);
    },
  };
}
