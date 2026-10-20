import type { Branch, BranchInput } from "@crm/contracts";
import { branchInputSchema } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import { hasDatabaseCode } from "./helpers.js";

interface BranchRow {
  id: string;
  clinicId: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  isDefault: boolean;
}

const branchColumns =
  'id, clinic_id AS "clinicId", name, address, phone, active, is_default AS "isDefault"';

const mapBranch = (row: BranchRow): Branch => ({
  id: row.id,
  clinicId: row.clinicId,
  name: row.name,
  ...(row.address ? { address: row.address } : {}),
  ...(row.phone ? { phone: row.phone } : {}),
  active: row.active,
  isDefault: row.isDefault,
});

export function createBranchesRepository(context: PostgresRepositoryContext) {
  return {
    async listBranches(clinicId: string) {
      const result = await context.pool.query<BranchRow>(
        `SELECT ${branchColumns} FROM branches WHERE clinic_id=$1
         ORDER BY is_default DESC, name`,
        [clinicId],
      );
      return result.rows.map(mapBranch);
    },

    async saveBranch(
      clinicId: string,
      actorUserId: string,
      rawInput: BranchInput,
      id?: string,
    ) {
      const input = branchInputSchema.parse(rawInput);
      try {
        return await context.inTransaction(async (client) => {
          if (id) {
            const current = await client.query<{ isDefault: boolean }>(
              'SELECT is_default AS "isDefault" FROM branches WHERE clinic_id=$1 AND id=$2 FOR UPDATE',
              [clinicId, id],
            );
            if (!current.rows[0]) return null;
            if (current.rows[0].isDefault && !input.active)
              throw new DomainError(
                "BRANCH_DEFAULT_INACTIVE",
                "A filial padrão não pode ser desativada.",
                409,
              );
          }
          const values = [
            clinicId,
            input.name,
            input.address || null,
            input.phone || null,
            input.active,
          ];
          const result = id
            ? await client.query<BranchRow>(
                `UPDATE branches SET name=$2, address=$3, phone=$4, active=$5, updated_at=now()
                 WHERE clinic_id=$1 AND id=$6 RETURNING ${branchColumns}`,
                [...values, id],
              )
            : await client.query<BranchRow>(
                `INSERT INTO branches (clinic_id, name, address, phone, active)
                 VALUES ($1,$2,$3,$4,$5) RETURNING ${branchColumns}`,
                values,
              );
          const branch = mapBranch(result.rows[0]!);
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            id ? "branch.updated" : "branch.created",
            "branch",
            branch.id,
            { name: branch.name, active: branch.active },
          );
          return branch;
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "BRANCH_NAME_DUPLICATE",
            "Já existe uma filial com este nome.",
            409,
          );
        throw error;
      }
    },
  };
}
