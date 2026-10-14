import type {
  AdministrativeRegistryInput,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import type { PostgresRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import { type ProfessionalRow, hasDatabaseCode } from "./helpers.js";
const mapProfessional = (row: ProfessionalRow): Professional => ({
  ...row,
  crefito: row.crefito ?? "",
});
const professionalColumns =
  'id,clinic_id AS "clinicId",full_name AS "fullName",crefito,specialty,color,active';
const roomColumns = 'id,clinic_id AS "clinicId",name,capacity,active';
const serviceColumns =
  'id,clinic_id AS "clinicId",name,duration_minutes AS "durationMinutes",price_in_cents AS "priceInCents",color,active';
export function createRegistryRepository(context: PostgresRepositoryContext) {
  return {
    async getAdministrativeRegistry(clinicId: string) {
      return context.inTransaction(async (client) => {
        const professional = await client.query<ProfessionalRow>(
            `SELECT ${professionalColumns} FROM professionals WHERE clinic_id=$1 ORDER BY full_name`,
            [clinicId],
          ),
          rooms = await client.query<Room>(
            `SELECT ${roomColumns} FROM rooms WHERE clinic_id=$1 ORDER BY name`,
            [clinicId],
          ),
          services = await client.query<Service>(
            `SELECT ${serviceColumns} FROM services WHERE clinic_id=$1 ORDER BY name`,
            [clinicId],
          );
        return {
          professionals: professional.rows.map(mapProfessional),
          rooms: rooms.rows,
          services: services.rows,
        };
      });
    },
    async updateAdministrativeRegistry(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: AdministrativeRegistryInput,
    ) {
      try {
        return await context.inTransaction(async (client) => {
          let record: Professional | Room | Service | undefined;
          if (input.kind === "professional") {
            const data = input.data,
              result = await client.query<ProfessionalRow>(
                `UPDATE professionals SET full_name=$3,crefito=$4,specialty=$5,color=$6,active=$7 WHERE clinic_id=$1 AND id=$2 RETURNING ${professionalColumns}`,
                [
                  clinicId,
                  id,
                  data.fullName,
                  data.crefito,
                  data.specialty,
                  data.color,
                  data.active,
                ],
              );
            record = result.rows[0]
              ? mapProfessional(result.rows[0])
              : undefined;
          } else if (input.kind === "room") {
            await client.query(
              "SELECT id FROM rooms WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
              [clinicId, id],
            );
            if (
              (
                await client.query(
                  "SELECT id FROM group_classes WHERE clinic_id=$1 AND room_id=$2 AND active AND capacity>$3 AND $3<(SELECT capacity FROM rooms WHERE clinic_id=$1 AND id=$2)",
                  [clinicId, id, input.data.capacity],
                )
              ).rowCount
            )
              throw new DomainError(
                "ROOM_CAPACITY_IN_USE",
                "A capacidade não pode ficar abaixo das vagas de uma turma ativa.",
                409,
              );
            const result = await client.query<Room>(
              `UPDATE rooms SET name=$3,capacity=$4,active=$5 WHERE clinic_id=$1 AND id=$2 RETURNING ${roomColumns}`,
              [
                clinicId,
                id,
                input.data.name,
                input.data.capacity,
                input.data.active,
              ],
            );
            record = result.rows[0];
          } else {
            const data = input.data,
              result = await client.query<Service>(
                `UPDATE services SET name=$3,duration_minutes=$4,price_in_cents=$5,color=$6,active=$7 WHERE clinic_id=$1 AND id=$2 RETURNING ${serviceColumns}`,
                [
                  clinicId,
                  id,
                  data.name,
                  data.durationMinutes,
                  data.priceInCents,
                  data.color,
                  data.active,
                ],
              );
            record = result.rows[0];
          }
          if (!record)
            throw new DomainError(
              "REGISTRY_NOT_FOUND",
              "Cadastro não encontrado.",
              404,
            );
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "registry.updated",
            input.kind,
            id,
            { active: input.data.active },
          );
          return record;
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            input.kind === "room"
              ? "ROOM_DUPLICATE"
              : "PROFESSIONAL_CREFITO_EXISTS",
            "Já existe um cadastro com este nome ou registro.",
            409,
          );
        throw error;
      }
    },
  };
}
