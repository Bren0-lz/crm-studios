import type { Branch, BranchInput, BranchPhone } from "@crm/contracts";
import { branchAddressFields, branchInputSchema } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import { hasDatabaseCode } from "./helpers.js";

interface BranchRow {
  id: string;
  clinicId: string;
  name: string;
  phones: BranchPhone[];
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference: string | null;
  active: boolean;
  isDefault: boolean;
}

const branchColumns = `id, clinic_id AS "clinicId", name, phones, postal_code AS "postalCode", street, number,
  complement, neighborhood, city, state, reference, active, is_default AS "isDefault"`;

const mapBranch = (row: BranchRow): Branch => ({
  id: row.id,
  clinicId: row.clinicId,
  name: row.name,
  phones: row.phones,
  ...Object.fromEntries(
    branchAddressFields.flatMap((key) => (row[key] ? [[key, row[key]]] : [])),
  ),
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
            JSON.stringify(
              input.phones.map(({ number, label }) => ({
                number,
                ...(label ? { label } : {}),
              })),
            ),
            input.active,
            ...branchAddressFields.map((key) => input[key] || null),
          ];
          const result = id
            ? await client.query<BranchRow>(
                `UPDATE branches SET name=$2, phones=$3::jsonb, active=$4, postal_code=$5, street=$6,
                   number=$7, complement=$8, neighborhood=$9, city=$10, state=$11,
                   reference=$12, updated_at=now()
                 WHERE clinic_id=$1 AND id=$13 RETURNING ${branchColumns}`,
                [...values, id],
              )
            : await client.query<BranchRow>(
                `INSERT INTO branches (clinic_id, name, phones, active, postal_code, street,
                   number, complement, neighborhood, city, state, reference)
                 VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${branchColumns}`,
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
