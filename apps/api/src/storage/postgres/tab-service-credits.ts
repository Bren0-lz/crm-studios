import { tabCreditHistoryLabel, tabCreditPlanName } from "@crm/contracts";
import type { PoolClient } from "pg";
import { DomainError } from "../../repository.js";

export async function createTabServiceCredits(
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  tabId: string,
) {
  const result = await client.query<{
    appointmentId: string;
    patientId: string;
    serviceId: string;
    serviceName: string;
    amountInCents: number;
    date: string;
    status: string;
    covered: boolean;
  }>(
    `
    SELECT ts.appointment_id AS "appointmentId",a.patient_id AS "patientId",ts.service_id AS "serviceId",ts.service_name AS "serviceName",ts.amount_in_cents AS "amountInCents",(a.starts_at AT TIME ZONE c.timezone)::date::text AS date,a.status,
      EXISTS(SELECT 1 FROM patient_plans p JOIN patient_plan_services ps ON ps.plan_id=p.id AND ps.clinic_id=p.clinic_id WHERE p.clinic_id=$1 AND p.patient_id=a.patient_id AND p.source_tab_id IS NULL AND p.status='active' AND ps.service_id=a.service_id AND p.valid_from<=(a.starts_at AT TIME ZONE c.timezone)::date AND (p.valid_until IS NULL OR p.valid_until>=(a.starts_at AT TIME ZONE c.timezone)::date)) AS covered
    FROM patient_tab_services ts JOIN patient_tabs t ON t.id=ts.tab_id AND t.clinic_id=ts.clinic_id JOIN appointments a ON a.id=ts.appointment_id AND a.clinic_id=ts.clinic_id AND a.patient_id=t.patient_id JOIN clinics c ON c.id=ts.clinic_id
    WHERE ts.clinic_id=$1 AND ts.tab_id=$2 ORDER BY ts.id FOR UPDATE OF a`,
    [clinicId, tabId],
  );
  for (const item of result.rows) {
    if (!["scheduled", "confirmed"].includes(item.status))
      throw new DomainError(
        "TAB_SERVICE_NOT_SCHEDULED",
        "A comanda exige serviços com atendimento agendado. Revise os itens antes de fechar.",
        409,
      );
    if (item.covered)
      throw new DomainError(
        "APPOINTMENT_ALREADY_BILLED",
        "O atendimento já está coberto por um plano. Remova o serviço da comanda.",
        409,
      );
    const plan = await client.query<{ id: string }>(
      `INSERT INTO patient_plans(clinic_id,patient_id,service_id,name,kind,total_sessions,remaining_sessions,valid_from,total_value_in_cents,installments,first_due_date,auto_renew,source_tab_id,source_appointment_id,branch_id) VALUES($1,$2,$3,$4,'single',1,1,$5,$6,1,$5,false,$7,$8,(SELECT branch_id FROM patient_tabs WHERE clinic_id=$1 AND id=$7)) RETURNING id`,
      [
        clinicId,
        item.patientId,
        item.serviceId,
        tabCreditPlanName(item.serviceName),
        item.date,
        item.amountInCents,
        tabId,
        item.appointmentId,
      ],
    );
    const planId = plan.rows[0]!.id;
    await client.query(
      `INSERT INTO patient_plan_services(clinic_id,plan_id,service_id,service_name,position,total_sessions,remaining_sessions,total_value_in_cents) VALUES($1,$2,$3,$4,0,1,1,$5)`,
      [clinicId, planId, item.serviceId, item.serviceName, item.amountInCents],
    );
    // O gatilho do histórico grava "Plano contratado"; o crédito da comanda
    // aparece como serviço avulso.
    await client.query(
      `UPDATE audit_events SET action='plan.tab_credit',description=$3 WHERE clinic_id=$1 AND source_table='patient_plans' AND source_id=$2 AND action='plan.created'`,
      [clinicId, planId, tabCreditHistoryLabel],
    );
    await client.query(
      `INSERT INTO session_movements(clinic_id,plan_id,service_id,kind,quantity,reason,actor_user_id) VALUES($1,$2,$3,'credit',1,'Crédito do serviço vendido na comanda',$4)`,
      [clinicId, planId, item.serviceId, actorUserId],
    );
  }
}

export async function cancelTabServiceCredits(
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  tabId: string,
) {
  const plans = await client.query<{ id: string }>(
    "SELECT id FROM patient_plans WHERE clinic_id=$1 AND source_tab_id=$2 AND status<>'cancelled' ORDER BY id FOR UPDATE",
    [clinicId, tabId],
  );
  for (const plan of plans.rows) {
    if (
      (
        await client.query(
          `SELECT 1 FROM session_movements WHERE clinic_id=$1 AND plan_id=$2 AND (appointment_id IS NOT NULL OR group_attendance_id IS NOT NULL) HAVING coalesce(sum(quantity),0)<0`,
          [clinicId, plan.id],
        )
      ).rowCount
    )
      throw new DomainError(
        "TAB_SERVICE_CORRECTION_REQUIRED",
        "Corrija a presença dos serviços realizados na agenda antes de cancelar a comanda.",
        409,
      );
    await client.query(
      `INSERT INTO session_movements(clinic_id,plan_id,service_id,kind,quantity,reason,actor_user_id) SELECT clinic_id,plan_id,service_id,'adjustment',-remaining_sessions,'Cancelamento da comanda',$3 FROM patient_plan_services WHERE clinic_id=$1 AND plan_id=$2 AND remaining_sessions>0`,
      [clinicId, plan.id, actorUserId],
    );
    await client.query(
      "UPDATE patient_plan_services SET remaining_sessions=0 WHERE clinic_id=$1 AND plan_id=$2",
      [clinicId, plan.id],
    );
    await client.query(
      "UPDATE patient_plans SET remaining_sessions=0,status='cancelled',cancelled_at=now(),cancelled_value_in_cents=total_value_in_cents,updated_at=now() WHERE clinic_id=$1 AND id=$2",
      [clinicId, plan.id],
    );
  }
}
