import {
  type AppModule,
  saoPauloToday,
  withAutomaticPatientTags,
  withoutAutomaticPatientTags,
} from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";

/**
 * Aplica as etiquetas automáticas (QC7) aos clientes devolvidos pela API. "Pagamento atrasado"
 * segue a regra e a visibilidade do motivo `overdue_payment` dos Contatos sugeridos: parcela
 * vencida e em aberto (hoje no fuso da clínica), só para quem vê o Financeiro.
 */
export async function automaticPatientTagger(
  repository: ClinicRepository,
  clinicId: string,
  modules: readonly AppModule[],
) {
  if (!modules.includes("finance"))
    return <T extends { id: string; tags: string[] }>(patient: T): T => ({
      ...patient,
      tags: withoutAutomaticPatientTags(patient.tags),
    });
  const overdue = new Set(
    await repository.listOverduePatientIds(clinicId, saoPauloToday()),
  );
  return <T extends { id: string; tags: string[] }>(patient: T): T =>
    withAutomaticPatientTags(patient, overdue);
}
