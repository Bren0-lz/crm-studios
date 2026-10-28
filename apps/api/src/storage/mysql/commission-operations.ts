import type { CommissionRuleInput } from "@crm/contracts";
import type { MysqlRepositoryContext } from "./context.js";
import {
  commissionAmount,
  commissionRuleJoin,
  commissionRuleSnapshot,
  localMonth,
} from "./sql.js";
export function createCommissionOperationsRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async createCommissionRule(clinicId: string, input: CommissionRuleInput) {
      return context.inTransaction(async (client) =>
        context.insertCommissionRule(client, clinicId, input),
      );
    },
    async generateCommissions(clinicId: string, competence: string) {
      await context.inTransaction(async (client) => {
        await client.lock(clinicId);
        await client.query(
          `INSERT INTO commission_entries(clinic_id,professional_id,appointment_id,group_attendance_id,service_id,rule_id,rule_snapshot,competence,base_amount_in_cents,percentage,amount_in_cents)
  WITH sources AS (
    SELECT a.clinic_id,a.id AS appointment_id,CAST(NULL AS CHAR(36)) AS group_attendance_id,a.professional_id,a.service_id,a.starts_at FROM appointments a WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL
    UNION ALL SELECT ga.clinic_id,NULL,ga.id,coalesce(gs.professional_id,g.professional_id),g.service_id,gs.starts_at FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present')
  )
    SELECT a.clinic_id,a.professional_id,a.appointment_id,a.group_attendance_id,a.service_id,rule.id,${commissionRuleSnapshot},$2,s.price_in_cents,rule.percentage,${commissionAmount}
    FROM sources a JOIN services s ON s.id=a.service_id AND s.clinic_id=a.clinic_id JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=a.clinic_id ${commissionRuleJoin("a.clinic_id")}
    WHERE ${localMonth("a.starts_at")}=$2 ON DUPLICATE KEY UPDATE commission_entries.id=commission_entries.id`,
          [clinicId, competence],
        );
      });
      return context.listCommissions(clinicId, competence);
    },
  };
}
