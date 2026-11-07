import {
  type AppModule,
  type AutomaticTagSubject,
  saoPauloToday,
  withAutomaticPatientTags,
} from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";

/**
 * Aplica as etiquetas automáticas aos clientes devolvidos pela API.
 * - "Pagamento atrasado" (QC7) segue a regra e a visibilidade do motivo `overdue_payment` dos
 *   Contatos sugeridos: parcela vencida e em aberto (hoje no fuso da clínica), só para quem vê o
 *   Financeiro.
 * - "Falta CPF" (B6-05): cliente sem CPF, para todos os perfis.
 * - "Cadastro incompleto" e "Sem e-mail" (CD3): cliente importado pela planilha sem WhatsApp/
 *   contato de emergência ou sem e-mail, para todos os perfis.
 */
export async function automaticPatientTagger(
  repository: ClinicRepository,
  clinicId: string,
  modules: readonly AppModule[],
) {
  const overdue = modules.includes("finance")
    ? new Set(
        await repository.listOverduePatientIds(clinicId, saoPauloToday()),
      )
    : null;
  return <T extends AutomaticTagSubject>(patient: T): T =>
    withAutomaticPatientTags(patient, overdue);
}
