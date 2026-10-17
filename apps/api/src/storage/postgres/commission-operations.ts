import type { CommissionRuleInput } from "@crm/contracts";
import type { PostgresRepositoryContext } from "./context.js";
export function createCommissionOperationsRepository(
  context: PostgresRepositoryContext,
) {
  return {
    async createCommissionRule(clinicId: string, input: CommissionRuleInput) {
      return context.inTransaction(async (client) =>
        context.insertCommissionRule(client, clinicId, input),
      );
    },
    async generateCommissions(clinicId: string, competence: string) {
      await context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        await client.query(
          `WITH sources AS (
    SELECT a.clinic_id,a.id AS appointment_id,NULL::uuid AS group_attendance_id,a.professional_id,a.service_id,a.starts_at FROM appointments a WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL
    UNION ALL SELECT ga.clinic_id,NULL::uuid,ga.id,coalesce(gs.professional_id,g.professional_id),g.service_id,gs.starts_at FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present')
  ) INSERT INTO commission_entries(clinic_id,professional_id,appointment_id,group_attendance_id,service_id,rule_id,rule_snapshot,competence,base_amount_in_cents,percentage,amount_in_cents)
    SELECT a.clinic_id,a.professional_id,a.appointment_id,a.group_attendance_id,a.service_id,rule.id,jsonb_build_object('percentage',rule.percentage,'kind',rule.kind,'fixedAmountInCents',rule.fixed_amount_in_cents,'serviceId',rule.service_id,'effectiveFrom',rule.effective_from,'effectiveUntil',rule.effective_until),$2::text,s.price_in_cents,rule.percentage,CASE WHEN rule.kind='fixed' THEN rule.fixed_amount_in_cents ELSE round(s.price_in_cents*rule.percentage/100)::int END
    FROM sources a JOIN clinics c ON c.id=a.clinic_id JOIN services s ON s.id=a.service_id AND s.clinic_id=a.clinic_id JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=a.clinic_id JOIN LATERAL (SELECT cr.* FROM commission_rules cr WHERE cr.clinic_id=a.clinic_id AND (cr.professional_id=a.professional_id OR (pr.user_id IS NOT NULL AND cr.user_id=pr.user_id)) AND cr.active AND (cr.service_id IS NULL OR cr.service_id=a.service_id) AND cr.effective_from<=(a.starts_at AT TIME ZONE c.timezone)::date AND (cr.effective_until IS NULL OR cr.effective_until>=(a.starts_at AT TIME ZONE c.timezone)::date) ORDER BY (cr.user_id IS NOT NULL) DESC,(cr.service_id IS NOT NULL) DESC,cr.effective_from DESC LIMIT 1) rule ON true
    WHERE to_char(a.starts_at AT TIME ZONE c.timezone,'YYYY-MM')=$2::text ON CONFLICT DO NOTHING`,
          [clinicId, competence],
        );
      });
      return context.listCommissions(clinicId, competence);
    },
  };
}
