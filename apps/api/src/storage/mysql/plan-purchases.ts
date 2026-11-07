import type { PlanPurchaseInput, PlanPurchaseResult } from "@crm/contracts";
import type { MysqlRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import {
  purchaseFingerprint,
  assertPlanEnrollmentSeat,
  validatePurchaseSchedule,
} from "../../modules/plans/purchase.js";
import { assertDocumentPatientCpf } from "../../modules/contracts/patient-cpf.js";
import { createIssuedDocumentInTransaction } from "./contracts.js";
import {
  type GroupEnrollmentRow,
  groupEnrollmentColumns,
  mapGroupEnrollment,
} from "./helpers.js";
export function createPlanPurchasesRepository(context: MysqlRepositoryContext) {
  return {
    async purchasePatientPlan(
      clinicId: string,
      actorId: string,
      input: PlanPurchaseInput,
    ): Promise<PlanPurchaseResult> {
      return context.inTransaction(async (client) => {
        await client.lock(clinicId);
        const fingerprint = purchaseFingerprint(input),
          cached = await client.query<{
            fingerprint: string;
            result: PlanPurchaseResult;
          }>(
            "SELECT fingerprint,result FROM plan_purchases WHERE clinic_id=$1 AND idempotency_key=$2",
            [clinicId, input.idempotencyKey],
          );
        if (cached.rows[0]) {
          if (cached.rows[0].fingerprint !== fingerprint)
            throw new DomainError(
              "PLAN_PURCHASE_KEY_REUSED",
              "Esta confirmação já foi usada com outras condições. Inicie uma nova contratação.",
              409,
            );
          return cached.rows[0].result;
        }
        const settings = await client.query<{ timezone: string }>(
          "SELECT timezone FROM clinics WHERE id=$1",
          [clinicId],
        );
        if (!settings.rows[0])
          throw new DomainError(
            "CLINIC_NOT_FOUND",
            "Clínica não encontrada.",
            404,
          );
        validatePurchaseSchedule(input, settings.rows[0].timezone);
        if (input.groupId) {
          const group = await client.query<{ serviceId: string }>(
            'SELECT service_id AS "serviceId" FROM group_classes WHERE clinic_id=$1 AND id=$2 AND active LOCK IN SHARE MODE',
            [clinicId, input.groupId],
          );
          if (!group.rows[0])
            throw new DomainError(
              "GROUP_OR_PATIENT_NOT_FOUND",
              "Turma ativa não encontrada.",
              404,
            );
          if (
            !input.plan.services.some(
              (item) => item.serviceId === group.rows[0]!.serviceId,
            )
          )
            throw new DomainError(
              "GROUP_SERVICE_MISMATCH",
              "A turma escolhida não é do serviço do plano.",
              400,
            );
        }
        const planId = await context.insertPatientPlan(
          client,
          clinicId,
          actorId,
          input.plan,
          "Crédito inicial do plano",
        );
        const plan = (await context.findPatientPlan(client, clinicId, planId))!,
          appointments = [];
        for (const appointment of input.appointments) {
          const related = await client.query<{ duration: number }>(
            "SELECT s.duration_minutes AS duration FROM services s,professionals pr,rooms r WHERE s.clinic_id=$1 AND s.id=$2 AND s.active AND pr.clinic_id=$1 AND pr.id=$3 AND pr.active AND r.clinic_id=$1 AND r.id=$4 AND r.active",
            [
              clinicId,
              appointment.serviceId,
              appointment.professionalId,
              appointment.roomId,
            ],
          );
          if (!related.rows[0])
            throw new DomainError(
              "RELATED_RECORD_NOT_FOUND",
              "Serviço, profissional ou sala não encontrado.",
              404,
            );
          appointments.push(
            await context.insertAppointment(
              clinicId,
              { ...appointment, planId },
              related.rows[0].duration,
              { patientId: plan.patientId, leadId: null },
              client,
            ),
          );
        }
        // Cliente que já está na turma (plano anterior vencido ou cancelado não encerra a
        // matrícula): o novo plano segue com a mesma matrícula, sem duplicar.
        let current = input.groupId
          ? (
              await client.query<GroupEnrollmentRow>(
                `SELECT ${groupEnrollmentColumns} FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.clinic_id=$1 AND e.group_id=$2 AND e.patient_id=$3 AND e.status IN ('active','waitlisted') FOR UPDATE`,
                [clinicId, input.groupId, plan.patientId],
              )
            ).rows[0]
          : undefined;
        // Cliente na lista de espera da turma e com vaga livre: a venda confirma a matrícula
        // (como "Cliente aceitou" na Lista de espera), em vez de recusar como turma cheia.
        if (current?.status === "waitlisted") {
          const group = await client.query<{ capacity: number }>(
            `SELECT capacity FROM group_classes WHERE clinic_id=$1 AND id=$2 AND active FOR UPDATE`,
            [clinicId, current.groupId],
          );
          const active = await client.query<{ id: string }>(
            `SELECT id FROM group_enrollments WHERE clinic_id=$1 AND group_id=$2 AND status='active' FOR UPDATE`,
            [clinicId, current.groupId],
          );
          if (group.rows[0] && active.rows.length < group.rows[0].capacity) {
            await client.query(
              `UPDATE group_enrollments SET status='active',queue_position=NULL,enrolled_at=GREATEST(enrolled_at,NOW(6)),updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`,
              [clinicId, current.id],
            );
            await client.query(
              `UPDATE group_enrollments e JOIN (SELECT id,row_number() OVER (ORDER BY queue_position,enrolled_at) AS position FROM group_enrollments WHERE clinic_id=$1 AND group_id=$2 AND status='waitlisted') ranked ON e.id=ranked.id SET e.queue_position=ranked.position`,
              [clinicId, current.groupId],
            );
            current = (
              await client.query<GroupEnrollmentRow>(
                `SELECT ${groupEnrollmentColumns} FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.clinic_id=$1 AND e.id=$2`,
                [clinicId, current.id],
              )
            ).rows[0];
          }
        }
        const enrollment = current
          ? mapGroupEnrollment(current)
          : input.groupId
            ? await context.insertGroupEnrollment(client, clinicId, {
                groupId: input.groupId,
                patientId: plan.patientId,
              })
            : undefined;
        // Sem vaga confirmada na turma não há venda (TW3): desfaz plano e matrícula.
        assertPlanEnrollmentSeat(enrollment);
        let document = input.document
          ? await createIssuedDocumentInTransaction(
              context,
              client,
              clinicId,
              actorId,
              { ...input.document, patientId: plan.patientId, planId },
            )
          : undefined;
        if (document) {
          assertDocumentPatientCpf(document);
          await client.query(
            "UPDATE issued_documents SET status='issued',issued_at=NOW(6),updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2",
            [clinicId, document.id],
          );
          document = (await context.findIssuedDocument(
            client,
            clinicId,
            document.id,
          ))!;
        }
        const result: PlanPurchaseResult = {
          plan,
          appointments,
          ...(enrollment ? { enrollment } : {}),
          ...(document ? { document } : {}),
        };
        await context.addAdminAudit(
          client,
          clinicId,
          actorId,
          "plan.purchased",
          "plan",
          planId,
          {
            appointmentIds: appointments.map((item) => item.id),
            enrollmentId: enrollment?.id,
            documentId: document?.id,
          },
        );
        await client.query(
          "INSERT INTO plan_purchases(clinic_id,idempotency_key,fingerprint,result,actor_user_id) VALUES($1,$2,$3,$4,$5)",
          [
            clinicId,
            input.idempotencyKey,
            fingerprint,
            JSON.stringify(result),
            actorId,
          ],
        );
        return result;
      });
    },
  };
}
