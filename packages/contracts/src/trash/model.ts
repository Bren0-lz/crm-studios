import { z } from "zod";
import type { AppModule } from "../administration/types.js";

/** Tópicos com lixeira. Cada tela mostra só a lixeira do próprio tópico. */
export const trashKindSchema = z.enum([
  "patients",
  "leads",
  "appointments",
  "patient-plans",
]);

/** Área que precisa estar liberada, além da permissão da lixeira, para cada tópico. */
export const trashKindModules = {
  patients: "patients",
  leads: "crm",
  appointments: "agenda",
  "patient-plans": "plans",
} as const satisfies Record<z.infer<typeof trashKindSchema>, AppModule>;

export const trashKindLabels: Record<
  z.infer<typeof trashKindSchema>,
  string
> = {
  patients: "Clientes",
  leads: "Leads",
  appointments: "Atendimentos",
  "patient-plans": "Planos do cliente",
};

/** Palavra que a pessoa digita para confirmar a exclusão definitiva. */
export const trashPurgeConfirmation = "EXCLUIR";
export const trashPurgeInputSchema = z.object({
  confirmation: z.literal(trashPurgeConfirmation, {
    message: `Digite ${trashPurgeConfirmation} para confirmar.`,
  }),
});

/**
 * Nome, em português, de cada tipo de registro apagado junto na exclusão definitiva. A chave é
 * o nome da tabela; o que não estiver aqui aparece como "Outros registros".
 */
export const trashImpactLabels: Record<string, string> = {
  patients: "Clientes",
  leads: "Leads",
  appointments: "Atendimentos",
  appointment_reschedules: "Remarcações",
  patient_plans: "Planos do cliente",
  patient_plan_services: "Serviços de planos",
  session_movements: "Movimentos de sessão",
  patient_tabs: "Comandas",
  patient_tab_services: "Itens de comanda",
  patient_tab_products: "Produtos de comanda",
  receivables: "Contas a receber",
  receivable_renegotiations: "Renegociações",
  financial_events: "Pagamentos recebidos",
  receipt_signatures: "Recibos",
  commission_entries: "Comissões",
  clinical_records: "Evoluções do prontuário",
  clinical_record_revisions: "Versões de evolução",
  clinical_addenda: "Adendos do prontuário",
  clinical_alerts: "Alertas clínicos",
  clinical_assessments: "Avaliações",
  clinical_attachments: "Anexos do prontuário",
  clinical_measurements: "Medições",
  clinical_access_events: "Acessos ao prontuário",
  clinical_resources: "Materiais do prontuário",
  therapeutic_goals: "Metas terapêuticas",
  treatment_closures: "Altas",
  group_enrollments: "Matrículas em turmas",
  group_attendance: "Presenças em turmas",
  replacement_credits: "Créditos de reposição",
  issued_documents: "Documentos emitidos",
  contact_activities: "Contatos registrados",
  communication_preferences: "Preferências de contato",
  outbound_messages: "Mensagens",
  satisfaction_surveys: "Pesquisas de satisfação",
  waitlist_entries: "Lista de espera",
  external_operations: "Operações externas",
  lead_contacts: "Contatos do lead",
  lead_stage_history: "Histórico do funil",
  lead_tasks: "Tarefas do lead",
  event_participants: "Participações em eventos",
};
