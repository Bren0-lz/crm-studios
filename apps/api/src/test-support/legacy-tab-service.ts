import { randomUUID } from "node:crypto";
import type { AppointmentInput, PatientTab } from "@crm/contracts";
import type { Database } from "../infrastructure/mysql-client.js";
import type { ClinicRepository } from "../repository.js";
import type { MemoryRepositoryContext } from "../storage/memory/context.js";

/**
 * Serviço não se vende mais na comanda (o avulso é plano avulso), mas comandas antigas
 * ainda têm atendimentos cobrados nela. Grava um item desses direto no armazenamento
 * (memória ou MySQL, com `pool`) para testar a leitura, o fechamento e o crédito gerado.
 */
export async function addLegacyTabService(
  repository: ClinicRepository,
  pool: Database | undefined,
  clinicId: string,
  tabId: string,
  input: Omit<AppointmentInput, "patientId">,
  amountInCents: number,
): Promise<PatientTab> {
  const tabOf = async () =>
    (await repository.getInventoryWorkspace(clinicId)).tabs.find(
      (item) => item.id === tabId,
    )!;
  const appointment = await repository.createAppointment(clinicId, {
    ...input,
    patientId: (await tabOf()).patientId,
  });
  const entry = {
    id: randomUUID(),
    appointmentId: appointment.id,
    serviceId: appointment.serviceId,
    serviceName: appointment.serviceName,
    professionalId: appointment.professionalId,
    professionalName: appointment.professionalName,
    amountInCents,
  };
  if (pool) {
    await pool.query(
      `INSERT INTO patient_tab_services(id,clinic_id,tab_id,appointment_id,service_id,service_name,professional_id,professional_name,amount_in_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entry.id,
        clinicId,
        tabId,
        entry.appointmentId,
        entry.serviceId,
        entry.serviceName,
        entry.professionalId,
        entry.professionalName,
        amountInCents,
      ],
    );
    await pool.query(
      "UPDATE patient_tabs SET total_in_cents=total_in_cents+$3 WHERE clinic_id=$1 AND id=$2",
      [clinicId, tabId, amountInCents],
    );
  } else {
    const { context } = repository as unknown as {
      context: MemoryRepositoryContext;
    };
    const tab = context.patientTabs.find(
      (item) => item.clinicId === clinicId && item.id === tabId,
    )!;
    (tab.services ??= []).push(entry);
    tab.totalInCents += amountInCents;
  }
  return tabOf();
}
