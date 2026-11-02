import type {
  CommissionRecalculationPreviewInput,
  CommissionRuleInput,
} from "@crm/contracts";
import type { CommissionRecalculationRequest } from "../../repository.js";
import { createMysqlCommissionRecalculation } from "./commission-recalculation.js";
import type { MysqlRepositoryContext } from "./context.js";
import {
  commissionAmount,
  commissionBase,
  commissionRuleJoin,
  commissionRuleSnapshot,
  localMonth,
} from "./sql.js";
export function createCommissionOperationsRepository(
  context: MysqlRepositoryContext,
) {
  const recalculation = createMysqlCommissionRecalculation(context);
  return {
    async createCommissionRule(
      clinicId: string,
      input: CommissionRuleInput,
      request?: CommissionRecalculationRequest & { actorId: string },
    ) {
      return context.inTransaction(async (client) => {
        const rule = await context.insertCommissionRule(
          client,
          clinicId,
          input,
        );
        if (request) {
          const { professionalId, ...terms } = input;
          await recalculation.apply(
            client,
            clinicId,
            request.actorId,
            { professionalId },
            [terms],
            request.expectedDigest,
          );
        }
        return rule;
      });
    },
    async previewCommissionRecalculation(
      clinicId: string,
      input: CommissionRecalculationPreviewInput,
    ) {
      return recalculation.preview(
        clinicId,
        input.userId
          ? { userId: input.userId }
          : { professionalId: input.professionalId! },
        input.rules,
      );
    },
    async generateCommissions(clinicId: string, competence: string) {
      const base = commissionBase({
        clinic: "a.clinic_id",
        appointmentId: "a.appointment_id",
        attendanceId: "a.group_attendance_id",
        serviceId: "a.service_id",
      });
      await context.inTransaction(async (client) => {
        await client.lock(clinicId);
        await client.query(
          `INSERT INTO commission_entries(clinic_id,professional_id,appointment_id,group_attendance_id,service_id,rule_id,rule_snapshot,competence,base_amount_in_cents,percentage,amount_in_cents)
  WITH sources AS (
    SELECT a.clinic_id,a.id AS appointment_id,CAST(NULL AS CHAR(36)) AS group_attendance_id,a.professional_id,a.service_id,a.starts_at FROM appointments a WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL
    UNION ALL SELECT ga.clinic_id,NULL,ga.id,coalesce(gs.professional_id,g.professional_id),g.service_id,gs.starts_at FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present')
  )
    SELECT a.clinic_id,a.professional_id,a.appointment_id,a.group_attendance_id,a.service_id,rule.id,${commissionRuleSnapshot},$2,${base},rule.percentage,${commissionAmount(base)}
    FROM sources a JOIN services s ON s.id=a.service_id AND s.clinic_id=a.clinic_id JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=a.clinic_id ${commissionRuleJoin("a.clinic_id")}
    WHERE ${localMonth("a.starts_at")}=$2 AND ${base}>0 ON DUPLICATE KEY UPDATE commission_entries.id=commission_entries.id`,
          [clinicId, competence],
        );
      });
      return context.listCommissions(clinicId, competence);
    },
  };
}
