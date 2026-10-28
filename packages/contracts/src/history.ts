import type { AppModule } from "./index.js";
import { permissionCatalog } from "./permissions.js";

export const historyActions: {
  action: string;
  module: AppModule;
  label: string;
}[] = [
  {
    action: "agenda.note_created",
    module: "agenda",
    label: "Nota da agenda criada",
  },
  {
    action: "agenda.note_updated",
    module: "agenda",
    label: "Nota da agenda editada",
  },
  {
    action: "agenda.note_deleted",
    module: "agenda",
    label: "Nota da agenda excluída",
  },
  {
    action: "external.operation_recorded",
    module: "finance",
    label: "Operação externa registrada",
  },
  {
    action: "external.operation_downloaded",
    module: "finance",
    label: "Comprovante de operação externa baixado",
  },
  {
    action: "plan.purchased",
    module: "plans",
    label: "Plano contratado com agenda e contrato",
  },
  {
    action: "reports.clients_exported",
    module: "reports",
    label: "Relatório de clientes exportado",
  },
  { action: "reports.dre_exported", module: "reports", label: "DRE exportada" },
  {
    action: "user.sessions_revoked",
    module: "settings",
    label: "Acessos do usuário encerrados",
  },
  {
    action: "appointment.absence_rescheduled",
    module: "agenda",
    label: "Ausência remarcada com vínculo",
  },
  {
    action: "assessment.template_saved",
    module: "clinical",
    label: "Modelo de avaliação salvo",
  },
  {
    action: "assessment.template_archived",
    module: "clinical",
    label: "Modelo de avaliação arquivado",
  },
  {
    action: "assessment.template_restored",
    module: "clinical",
    label: "Modelo de avaliação reativado",
  },
  {
    action: "catalog.saved",
    module: "settings",
    label: "Cadastro reutilizável salvo",
  },
  {
    action: "clinical.resource_saved",
    module: "clinical",
    label: "Registro clínico salvo",
  },
  {
    action: "clinical.resource_finalized",
    module: "clinical",
    label: "Registro clínico finalizado",
  },
  {
    action: "message_template.saved",
    module: "communications",
    label: "Mensagem padrão salva",
  },
  {
    action: "message_template.archived",
    module: "communications",
    label: "Mensagem padrão arquivada ou reativada",
  },
  {
    action: "campaign.created",
    module: "communications",
    label: "Campanha de WhatsApp criada",
  },
  {
    action: "message.manual_completion",
    module: "communications",
    label: "Conclusão manual de mensagem registrada",
  },
  {
    action: "document.signature_recorded",
    module: "contracts",
    label: "Assinatura manual registrada",
  },
  {
    action: "document.signature_downloaded",
    module: "contracts",
    label: "Cópia assinada consultada",
  },
  {
    action: "document.signature_link_created",
    module: "contracts",
    label: "Link de assinatura gerado",
  },
  {
    action: "document.signature_link_renewed",
    module: "contracts",
    label: "Link de assinatura renovado",
  },
  {
    action: "product.updated",
    module: "patients",
    label: "Produto atualizado",
  },
  {
    action: "tab.item_updated",
    module: "patients",
    label: "Item da comanda atualizado",
  },
  {
    action: "tab.service_added",
    module: "patients",
    label: "Serviço adicionado à comanda",
  },
  {
    action: "tab.service_removed",
    module: "patients",
    label: "Serviço removido da comanda",
  },
  { action: "supplier.saved", module: "finance", label: "Fornecedor salvo" },
  {
    action: "receivable.created",
    module: "finance",
    label: "Conta a receber criada",
  },
  {
    action: "finance.classified",
    module: "finance",
    label: "Lançamento classificado",
  },
  {
    action: "category.dre_group",
    module: "finance",
    label: "Classificação da DRE atualizada",
  },
  {
    action: "finance.dates_updated",
    module: "finance",
    label: "Datas financeiras ajustadas",
  },
  {
    action: "group.replacement_attendance",
    module: "groups",
    label: "Frequência da reposição registrada",
  },
  {
    action: "group.professional",
    module: "groups",
    label: "Profissional do encontro alterado",
  },
  {
    action: "patient.status",
    module: "patients",
    label: "Situação do cliente alterada",
  },
  {
    action: "patients.inactivated",
    module: "patients",
    label: "Clientes inativados em lote",
  },
  {
    action: "patients.merged",
    module: "patients",
    label: "Cadastros de clientes unificados",
  },
  {
    action: "registry.updated",
    module: "settings",
    label: "Cadastro administrativo atualizado",
  },

  {
    action: "plan_template.created",
    module: "settings",
    label: "Plano do catálogo cadastrado",
  },
  {
    action: "plan_template.updated",
    module: "settings",
    label: "Plano do catálogo atualizado",
  },
  { action: "user.created", module: "settings", label: "Usuário cadastrado" },
  { action: "user.updated", module: "settings", label: "Usuário atualizado" },
  {
    action: "user.profile_updated",
    module: "settings",
    label: "Perfil próprio atualizado",
  },
  { action: "branch.created", module: "settings", label: "Filial cadastrada" },
  { action: "branch.updated", module: "settings", label: "Filial atualizada" },
  {
    action: "users.branches_updated",
    module: "settings",
    label: "Filiais do usuário alteradas",
  },
  {
    action: "user.password_reset",
    module: "settings",
    label: "Senha redefinida",
  },
  {
    action: "users.permissions_updated",
    module: "settings",
    label: "Permissões de acesso alteradas",
  },
  {
    action: "users.commission_updated",
    module: "settings",
    label: "Comissão alterada",
  },
  {
    action: "users.professional_updated",
    module: "settings",
    label: "Vínculo com profissional alterado",
  },
  {
    action: "clinic.updated",
    module: "settings",
    label: "Dados da clínica atualizados",
  },
  {
    action: "clinic.auto_finalization_updated",
    module: "settings",
    label: "Finalização automática alterada",
  },
  {
    action: "patient_tag.created",
    module: "settings",
    label: "Etiqueta criada",
  },
  {
    action: "patient_tag.updated",
    module: "settings",
    label: "Etiqueta alterada",
  },
  {
    action: "patient_tag.deleted",
    module: "settings",
    label: "Etiqueta excluída",
  },
  {
    action: "patients.exported",
    module: "patients",
    label: "Lista de clientes exportada",
  },
  {
    action: "financial.created",
    module: "finance",
    label: "Conta a receber criada",
  },
  {
    action: "financial.payment",
    module: "finance",
    label: "Pagamento recebido",
  },
  {
    action: "financial.payment_reversal",
    module: "finance",
    label: "Recebimento estornado",
  },
  {
    action: "financial.cancellation",
    module: "finance",
    label: "Recebível cancelado",
  },
  {
    action: "payable.created",
    module: "finance",
    label: "Conta a pagar criada",
  },
  { action: "payable.payment", module: "finance", label: "Conta paga" },
  {
    action: "payable.payment_reversal",
    module: "finance",
    label: "Pagamento estornado",
  },
  {
    action: "payable.cancellation",
    module: "finance",
    label: "Conta a pagar cancelada",
  },
  {
    action: "appointment.rescheduled",
    module: "agenda",
    label: "Atendimento reagendado",
  },
  {
    action: "appointment.updated",
    module: "agenda",
    label: "Atendimento alterado",
  },
  {
    action: "lead.stage_changed",
    module: "crm",
    label: "Lead mudou de etapa no funil",
  },
  {
    action: "clinical.revision",
    module: "clinical",
    label: "Versão de prontuário registrada",
  },
  ...["read", "export", "upload", "download", "addendum"].map(
    (action, index) => ({
      action: `clinical.access.${action}`,
      module: "clinical" as const,
      label: [
        "Prontuário consultado",
        "Prontuário exportado",
        "Anexo clínico enviado",
        "Anexo clínico baixado",
        "Adendo clínico registrado",
      ][index]!,
    }),
  ),
  {
    action: "session.movement",
    module: "plans",
    label: "Saldo de sessões alterado",
  },
  {
    action: "stock.movement",
    module: "patients",
    label: "Estoque ajustado",
  },
  {
    action: "lead.contact",
    module: "crm",
    label: "Contato com lead registrado",
  },
  {
    action: "relationship.contact",
    module: "relationship",
    label: "Contato com cliente registrado",
  },
  {
    action: "message.created",
    module: "communications",
    label: "Mensagem registrada",
  },
  {
    action: "satisfaction.created",
    module: "agenda",
    label: "Pesquisa de satisfação registrada",
  },
  {
    action: "patient.created",
    module: "patients",
    label: "Cliente cadastrado",
  },
  {
    action: "appointment.created",
    module: "agenda",
    label: "Atendimento agendado",
  },
  { action: "plan.created", module: "plans", label: "Plano contratado" },
  {
    action: "plan.tab_credit",
    module: "plans",
    label: "Serviço avulso na comanda",
  },
  {
    action: "lead.updated",
    module: "crm",
    label: "Cadastro do lead atualizado",
  },
  { action: "lead.created", module: "crm", label: "Lead cadastrado" },
  {
    action: "lead.task_created",
    module: "crm",
    label: "Tarefa de lead criada",
  },
  {
    action: "product.created",
    module: "patients",
    label: "Produto cadastrado",
  },
  { action: "tab.created", module: "patients", label: "Comanda aberta" },
  { action: "group.created", module: "groups", label: "Turma criada" },
  {
    action: "group.enrolled",
    module: "groups",
    label: "Cliente matriculado em turma",
  },
  {
    action: "group.session_created",
    module: "groups",
    label: "Aula de turma criada",
  },
  {
    action: "schedule.block_created",
    module: "agenda",
    label: "Bloqueio de agenda criado",
  },
  {
    action: "professional.created",
    module: "agenda",
    label: "Profissional cadastrado",
  },
  { action: "room.created", module: "agenda", label: "Sala cadastrada" },
  { action: "service.created", module: "agenda", label: "Serviço cadastrado" },
  {
    action: "clinical.record_created",
    module: "clinical",
    label: "Prontuário criado",
  },
  {
    action: "clinical.attachment_created",
    module: "clinical",
    label: "Anexo clínico registrado",
  },
  {
    action: "clinical.addendum_created",
    module: "clinical",
    label: "Adendo clínico registrado",
  },
  {
    action: "clinical.alert_created",
    module: "clinical",
    label: "Alerta clínico registrado",
  },
  {
    action: "clinical.template_created",
    module: "clinical",
    label: "Modelo de avaliação criado",
  },
  {
    action: "clinical.assessment_created",
    module: "clinical",
    label: "Avaliação clínica registrada",
  },
  {
    action: "clinical.goal_created",
    module: "clinical",
    label: "Objetivo terapêutico criado",
  },
  {
    action: "clinical.measurement_created",
    module: "clinical",
    label: "Medida clínica registrada",
  },
  {
    action: "clinical.closure_created",
    module: "clinical",
    label: "Encerramento clínico registrado",
  },
  {
    action: "finance.renegotiated",
    module: "finance",
    label: "Recebíveis renegociados",
  },
  {
    action: "commission.reconciled",
    module: "finance",
    label: "Comissão conciliada com a origem",
  },
  {
    action: "commission.account_paid",
    module: "finance",
    label: "Baixa da comissão conciliada",
  },
  {
    action: "commission.account_reversed",
    module: "finance",
    label: "Estorno da comissão conciliada",
  },
  {
    action: "commission.rule_created",
    module: "finance",
    label: "Regra de comissão criada",
  },
  {
    action: "commission.payment_reversed",
    module: "finance",
    label: "Pagamento da comissão estornado",
  },
  { action: "commission.created", module: "finance", label: "Comissão gerada" },
  {
    action: "recurring_payable.created",
    module: "finance",
    label: "Conta recorrente criada",
  },
  {
    action: "contract.template_created",
    module: "contracts",
    label: "Modelo de contrato criado",
  },
  {
    action: "contract.created",
    module: "contracts",
    label: "Contrato registrado",
  },
  {
    action: "holiday.created",
    module: "settings",
    label: "Feriado cadastrado",
  },
  {
    action: "patients.updated",
    module: "patients",
    label: "Registro atualizado: Cliente",
  },
  {
    action: "patients.deleted",
    module: "patients",
    label: "Registro excluído: Cliente",
  },
  {
    action: "appointments.updated",
    module: "agenda",
    label: "Registro atualizado: Atendimento",
  },
  {
    action: "appointments.deleted",
    module: "agenda",
    label: "Registro excluído: Atendimento",
  },
  {
    action: "patient_plans.updated",
    module: "plans",
    label: "Registro atualizado: Plano",
  },
  {
    action: "patient_plans.deleted",
    module: "plans",
    label: "Registro excluído: Plano",
  },
  {
    action: "leads.updated",
    module: "crm",
    label: "Registro atualizado: Lead",
  },
  { action: "leads.deleted", module: "crm", label: "Registro excluído: Lead" },
  {
    action: "lead_tasks.updated",
    module: "crm",
    label: "Registro atualizado: Tarefa",
  },
  {
    action: "lead_tasks.deleted",
    module: "crm",
    label: "Registro excluído: Tarefa",
  },
  {
    action: "products.updated",
    module: "patients",
    label: "Registro atualizado: Produto",
  },
  {
    action: "products.deleted",
    module: "patients",
    label: "Registro excluído: Produto",
  },
  {
    action: "patient_tabs.updated",
    module: "patients",
    label: "Registro atualizado: Comanda",
  },
  {
    action: "patient_tabs.deleted",
    module: "patients",
    label: "Registro excluído: Comanda",
  },
  {
    action: "group_classes.updated",
    module: "groups",
    label: "Registro atualizado: Turma",
  },
  {
    action: "group_classes.deleted",
    module: "groups",
    label: "Registro excluído: Turma",
  },
  {
    action: "group_enrollments.updated",
    module: "groups",
    label: "Registro atualizado: Matrícula",
  },
  {
    action: "group_enrollments.deleted",
    module: "groups",
    label: "Registro excluído: Matrícula",
  },
  {
    action: "group_sessions.updated",
    module: "groups",
    label: "Registro atualizado: Aula",
  },
  {
    action: "group_sessions.deleted",
    module: "groups",
    label: "Registro excluído: Aula",
  },
  {
    action: "schedule_blocks.updated",
    module: "agenda",
    label: "Registro atualizado: Bloqueio de agenda",
  },
  {
    action: "schedule_blocks.deleted",
    module: "agenda",
    label: "Registro excluído: Bloqueio de agenda",
  },
  {
    action: "professionals.updated",
    module: "agenda",
    label: "Registro atualizado: Profissional",
  },
  {
    action: "professionals.deleted",
    module: "agenda",
    label: "Registro excluído: Profissional",
  },
  {
    action: "rooms.updated",
    module: "agenda",
    label: "Registro atualizado: Sala",
  },
  {
    action: "rooms.deleted",
    module: "agenda",
    label: "Registro excluído: Sala",
  },
  {
    action: "services.updated",
    module: "agenda",
    label: "Registro atualizado: Serviço",
  },
  {
    action: "services.deleted",
    module: "agenda",
    label: "Registro excluído: Serviço",
  },
  {
    action: "clinical_records.updated",
    module: "clinical",
    label: "Registro atualizado: Prontuário",
  },
  {
    action: "clinical_records.deleted",
    module: "clinical",
    label: "Registro excluído: Prontuário",
  },
  {
    action: "clinical_attachments.updated",
    module: "clinical",
    label: "Registro atualizado: Anexo clínico",
  },
  {
    action: "clinical_attachments.deleted",
    module: "clinical",
    label: "Registro excluído: Anexo clínico",
  },
  {
    action: "clinical_addenda.updated",
    module: "clinical",
    label: "Registro atualizado: Adendo clínico",
  },
  {
    action: "clinical_addenda.deleted",
    module: "clinical",
    label: "Registro excluído: Adendo clínico",
  },
  {
    action: "assessment_templates.updated",
    module: "clinical",
    label: "Registro atualizado: Modelo de avaliação",
  },
  {
    action: "assessment_templates.deleted",
    module: "clinical",
    label: "Registro excluído: Modelo de avaliação",
  },
  {
    action: "clinical_assessments.updated",
    module: "clinical",
    label: "Registro atualizado: Avaliação clínica",
  },
  {
    action: "clinical_assessments.deleted",
    module: "clinical",
    label: "Registro excluído: Avaliação clínica",
  },
  {
    action: "therapeutic_goals.updated",
    module: "clinical",
    label: "Registro atualizado: Objetivo terapêutico",
  },
  {
    action: "therapeutic_goals.deleted",
    module: "clinical",
    label: "Registro excluído: Objetivo terapêutico",
  },
  {
    action: "clinical_measurements.updated",
    module: "clinical",
    label: "Registro atualizado: Medida clínica",
  },
  {
    action: "clinical_measurements.deleted",
    module: "clinical",
    label: "Registro excluído: Medida clínica",
  },
  {
    action: "treatment_closures.updated",
    module: "clinical",
    label: "Registro atualizado: Encerramento clínico",
  },
  {
    action: "treatment_closures.deleted",
    module: "clinical",
    label: "Registro excluído: Encerramento clínico",
  },
  {
    action: "receivable_renegotiations.updated",
    module: "finance",
    label: "Registro atualizado: Renegociação",
  },
  {
    action: "receivable_renegotiations.deleted",
    module: "finance",
    label: "Registro excluído: Renegociação",
  },
  {
    action: "commission_rules.updated",
    module: "finance",
    label: "Registro atualizado: Regra de comissão",
  },
  {
    action: "commission_rules.deleted",
    module: "finance",
    label: "Registro excluído: Regra de comissão",
  },
  {
    action: "commission_entries.updated",
    module: "finance",
    label: "Registro atualizado: Comissão",
  },
  {
    action: "commission_entries.deleted",
    module: "finance",
    label: "Registro excluído: Comissão",
  },
  {
    action: "recurring_payables.updated",
    module: "finance",
    label: "Registro atualizado: Conta recorrente",
  },
  {
    action: "recurring_payables.deleted",
    module: "finance",
    label: "Registro excluído: Conta recorrente",
  },
  {
    action: "document_templates.updated",
    module: "contracts",
    label: "Registro atualizado: Modelo de contrato",
  },
  {
    action: "document_templates.deleted",
    module: "contracts",
    label: "Registro excluído: Modelo de contrato",
  },
  {
    action: "issued_documents.updated",
    module: "contracts",
    label: "Registro atualizado: Contrato",
  },
  {
    action: "issued_documents.deleted",
    module: "contracts",
    label: "Registro excluído: Contrato",
  },
  {
    action: "holidays.updated",
    module: "settings",
    label: "Registro atualizado: Feriado",
  },
  {
    action: "holidays.deleted",
    module: "settings",
    label: "Registro excluído: Feriado",
  },
  {
    action: "group.attendance",
    module: "groups",
    label: "Presença em turma registrada",
  },
  {
    action: "group_attendance.updated",
    module: "groups",
    label: "Registro atualizado: Presença em turma",
  },
  {
    action: "group_attendance.deleted",
    module: "groups",
    label: "Registro excluído: Presença em turma",
  },
  {
    action: "group.replacement_created",
    module: "groups",
    label: "Crédito de reposição criado",
  },
  {
    action: "replacement_credits.updated",
    module: "groups",
    label: "Registro atualizado: Crédito de reposição",
  },
  {
    action: "replacement_credits.deleted",
    module: "groups",
    label: "Registro excluído: Crédito de reposição",
  },
  {
    action: "finance.category_created",
    module: "finance",
    label: "Categoria financeira criada",
  },
  {
    action: "financial_categories.updated",
    module: "finance",
    label: "Registro atualizado: Categoria financeira",
  },
  {
    action: "financial_categories.deleted",
    module: "finance",
    label: "Registro excluído: Categoria financeira",
  },
  {
    action: "finance.cost_center_created",
    module: "finance",
    label: "Centro de custo criado",
  },
  {
    action: "cost_centers.updated",
    module: "finance",
    label: "Registro atualizado: Centro de custo",
  },
  {
    action: "cost_centers.deleted",
    module: "finance",
    label: "Registro excluído: Centro de custo",
  },
  {
    action: "communication.preference_created",
    module: "communications",
    label: "Preferência de comunicação registrada",
  },
  {
    action: "communication_preferences.updated",
    module: "communications",
    label: "Registro atualizado: Preferência de comunicação",
  },
  {
    action: "communication_preferences.deleted",
    module: "communications",
    label: "Registro excluído: Preferência de comunicação",
  },
  {
    action: "financial.adjustment",
    module: "finance",
    label: "Recebível ajustado",
  },
  ...permissionCatalog
    .filter((item) => !item.key.endsWith(".view"))
    .map((item) => ({
      action: `operation.${item.key}`,
      module: item.module,
      label: `Ação realizada: ${item.name}`,
    })),
];

export function historyAction(action: string) {
  return historyActions.find((item) => item.action === action);
}
