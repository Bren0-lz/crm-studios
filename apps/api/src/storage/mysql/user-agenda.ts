import { randomUUID } from "node:crypto";
import type { AdminUserInput, AdminUserUpdate } from "@crm/contracts";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import { DomainError } from "../../repository.js";
import { assertUserAgendaBranch } from "../../modules/administration/user-agenda.js";
import type { MysqlRepositoryContext } from "./context.js";
import { hasDatabaseCode } from "./helpers.js";

export function userSaveError(error: unknown): never {
  if (hasDatabaseCode(error, "23505")) {
    const constraint = (error as { constraint?: string }).constraint ?? "";
    if (constraint.includes("crefito"))
      throw new DomainError(
        "PROFESSIONAL_CREFITO_EXISTS",
        "Já existe um profissional com este registro.",
        409,
      );
    if (constraint.includes("professional"))
      throw new DomainError(
        "PROFESSIONAL_ALREADY_LINKED",
        "Este profissional já está ligado a outro usuário.",
        409,
      );
    throw new DomainError(
      "USER_EMAIL_DUPLICATE",
      "Este e-mail já está em uso.",
      409,
    );
  }
  throw error;
}

/** Usa exclusivamente o client e a transação do salvamento do usuário. */
export async function saveUserAgenda(
  context: MysqlRepositoryContext,
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  userId: string,
  input: AdminUserInput | AdminUserUpdate,
) {
  const operation = input.professional;
  if (!operation && !input.branchAccess) return;
  const previous = (
    await client.query<{ id: string; branchId: string; active: boolean }>(
      `SELECT id, branch_id AS "branchId", active FROM professionals
     WHERE clinic_id=$1 AND user_id=$2 FOR UPDATE`,
      [clinicId, userId],
    )
  ).rows[0];
  let target = previous;
  if (operation?.mode === "save") {
    const professional = (
      await client.query<{
        id: string;
        branchId: string;
        active: boolean;
        userId: string | null;
      }>(
        `SELECT id, branch_id AS "branchId", active, user_id AS "userId" FROM professionals
       WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
        [clinicId, operation.id],
      )
    ).rows[0];
    if (
      !professional ||
      (!professional.active && professional.id !== previous?.id)
    )
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional ativo não encontrado.",
        404,
      );
    if (professional.userId && professional.userId !== userId)
      throw new DomainError(
        "PROFESSIONAL_ALREADY_LINKED",
        "Este profissional já está ligado a outro usuário.",
        409,
      );
    target = professional;
  }
  if (target && operation) context.assertBranchInScope(target.branchId);
  if (previous && operation && previous.id !== target?.id)
    context.assertBranchInScope(previous.branchId);
  async function assertUniqueRegistration(branchId: string, id?: string) {
    if (!operation || operation.mode === "deactivate") return;
    const duplicate = await client.query(
      `SELECT id FROM professionals WHERE clinic_id=$1 AND branch_id=$2
       AND lower(crefito)=lower($3) AND ($4 IS NULL OR id<>$4)`,
      [clinicId, branchId, operation.data.crefito, id ?? null],
    );
    if (duplicate.rowCount)
      throw new DomainError(
        "PROFESSIONAL_CREFITO_EXISTS",
        "Já existe um profissional com este registro.",
        409,
      );
  }
  if (operation?.mode === "create") {
    const branch = (
      await client.query<{ id: string }>(
        `SELECT id FROM branches WHERE clinic_id=$1 AND id=COALESCE($2,
       (SELECT b.id FROM branches b WHERE b.clinic_id=$1 AND b.is_default))`,
        [clinicId, context.branchWriteId()],
      )
    ).rows[0];
    if (!branch)
      throw new DomainError("BRANCH_NOT_FOUND", "Filial não encontrada.", 404);
    context.assertBranchInScope(branch.id);
    await assertUniqueRegistration(branch.id);
    // Liberar o vínculo anterior antes do INSERT evita violar a unicidade por usuário.
    await client.query(
      "UPDATE professionals SET user_id=NULL WHERE clinic_id=$1 AND user_id=$2",
      [clinicId, userId],
    );
    const professionalId = randomUUID();
    await client.query(
      `INSERT INTO professionals (clinic_id,branch_id,user_id,full_name,crefito,specialty,color,id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
          clinicId,
          branch.id,
          userId,
          operation.data.fullName,
          operation.data.crefito,
        operation.data.specialty,
        operation.data.color,
        professionalId,
      ],
    );
    target = { id: professionalId, branchId: branch.id, active: true };
  }
  if (!target) return;
  const user = (await context.findAdminUser(client, clinicId, userId))!;
  assertUserAgendaBranch(
    target.branchId,
    input.role,
    input.branchAccess ?? {
      allBranches: user.allBranches ?? true,
      branchIds: user.branchIds ?? [],
    },
  );
  if (!operation) return;
  if (operation.mode === "deactivate") {
    await client.query(
      "UPDATE professionals SET active=false,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2",
      [clinicId, target.id],
    );
  } else if (operation.mode === "save") {
    await assertUniqueRegistration(target.branchId, target.id);
    await client.query(
      "UPDATE professionals SET user_id=NULL,updated_at=NOW(6) WHERE clinic_id=$1 AND user_id=$2 AND id<>$3",
      [clinicId, userId, target.id],
    );
    await client.query(
      `UPDATE professionals SET full_name=$3,crefito=$4,specialty=$5,color=$6,active=true,user_id=$7,updated_at=NOW(6)
       WHERE clinic_id=$1 AND id=$2`,
      [
        clinicId,
        target.id,
        operation.data.fullName,
        operation.data.crefito,
        operation.data.specialty,
        operation.data.color,
        userId,
      ],
    );
  }
  await context.addAdminAudit(
    client,
    clinicId,
    actorUserId,
    "users.professional_updated",
    "user",
    userId,
    {
      professionalId: target.id,
      previousProfessionalId: previous?.id ?? null,
      active: operation.mode !== "deactivate",
    },
  );
}
