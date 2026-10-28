import { tabCreditHistoryLabel } from "@crm/contracts";

/**
 * Histórico automático do sistema ("Cliente cadastrado", "Pagamento recebido"…). No Postgres
 * eram gatilhos que copiavam cada criação para `audit_events`; no MySQL compartilhado
 * gatilhos podem não ser permitidos, então os eventos são montados na leitura a partir das
 * próprias tabelas (como o repositório em memória faz). O id do evento é o id do registro.
 * Alterações e exclusões continuam no histórico pelos eventos de operação da API.
 */
interface HistorySource {
  table: string;
  module: string;
  action: string;
  label: string;
  /** Coluna com o instante do evento. */
  time?: string;
  /** Evento com autor conhecido (no Postgres, `append_system_history`). */
  actor?: string;
  /** Nome do registro mostrado no histórico (fora do módulo clínico). */
  subject?: string;
  /** Campos clínicos copiados para os metadados (nunca o conteúdo). */
  clinical?: Record<string, string>;
  /** Ação composta com uma coluna (ex.: `financial.payment`). */
  actionSuffix?: string;
}

const patient = { patientId: "patient_id" };

const sources: HistorySource[] = [
  {
    table: "appointment_reschedules",
    module: "agenda",
    action: "appointment.rescheduled",
    label: "Atendimento reagendado",
    actor: "actor_user_id",
  },
  {
    table: "appointments",
    module: "agenda",
    action: "appointment.created",
    label: "Atendimento agendado",
  },
  {
    table: "assessment_templates",
    module: "clinical",
    action: "clinical.template_created",
    label: "Modelo de avaliação criado",
    clinical: { version: "version" },
  },
  {
    table: "clinical_access_events",
    module: "clinical",
    action: "clinical.access",
    label: "Acesso a prontuário registrado",
    actor: "actor_user_id",
    actionSuffix: "action",
    clinical: { ...patient, entityType: "entity_type", entityId: "entity_id" },
  },
  {
    table: "clinical_addenda",
    module: "clinical",
    action: "clinical.addendum_created",
    label: "Adendo clínico registrado",
    clinical: { ...patient, clinicalRecordId: "clinical_record_id" },
  },
  {
    table: "clinical_alerts",
    module: "clinical",
    action: "clinical.alert_created",
    label: "Alerta clínico registrado",
    clinical: patient,
  },
  {
    table: "clinical_assessments",
    module: "clinical",
    action: "clinical.assessment_created",
    label: "Avaliação clínica registrada",
    clinical: patient,
  },
  {
    table: "clinical_attachments",
    module: "clinical",
    action: "clinical.attachment_created",
    label: "Anexo clínico registrado",
    clinical: patient,
  },
  {
    table: "clinical_measurements",
    module: "clinical",
    action: "clinical.measurement_created",
    label: "Medida clínica registrada",
    clinical: patient,
  },
  {
    table: "clinical_record_revisions",
    module: "clinical",
    action: "clinical.revision",
    label: "Versão de prontuário registrada",
    actor: "author_user_id",
    clinical: { clinicalRecordId: "clinical_record_id", version: "version" },
  },
  {
    table: "clinical_records",
    module: "clinical",
    action: "clinical.record_created",
    label: "Prontuário criado",
    clinical: { ...patient, version: "version" },
  },
  {
    table: "commission_entries",
    module: "finance",
    action: "commission.created",
    label: "Comissão gerada",
  },
  {
    table: "commission_rules",
    module: "finance",
    action: "commission.rule_created",
    label: "Regra de comissão criada",
  },
  {
    table: "contact_activities",
    module: "relationship",
    action: "relationship.contact",
    label: "Contato com cliente registrado",
    actor: "actor_user_id",
  },
  {
    table: "document_templates",
    module: "contracts",
    action: "contract.template_created",
    label: "Modelo de contrato criado",
    subject: "name",
  },
  {
    table: "financial_events",
    module: "finance",
    action: "financial",
    label: "Movimentação de recebível registrada",
    actor: "actor_user_id",
    actionSuffix: "kind",
  },
  {
    table: "group_attendance",
    module: "groups",
    action: "group.attendance",
    label: "Presença em turma registrada",
    time: "recorded_at",
  },
  {
    table: "group_classes",
    module: "groups",
    action: "group.created",
    label: "Turma criada",
    subject: "name",
  },
  {
    table: "group_enrollments",
    module: "groups",
    action: "group.enrolled",
    label: "Cliente matriculado em turma",
    time: "enrolled_at",
  },
  {
    table: "group_sessions",
    module: "groups",
    action: "group.session_created",
    label: "Aula de turma criada",
  },
  {
    table: "holidays",
    module: "settings",
    action: "holiday.created",
    label: "Feriado cadastrado",
    subject: "name",
  },
  {
    table: "issued_documents",
    module: "contracts",
    action: "contract.created",
    label: "Contrato registrado",
    subject: "title",
  },
  {
    table: "lead_contacts",
    module: "crm",
    action: "lead.contact",
    label: "Contato com lead registrado",
    actor: "actor_user_id",
  },
  {
    table: "lead_stage_history",
    module: "crm",
    action: "lead.stage_changed",
    label: "Lead movimentado no funil",
    actor: "actor_user_id",
  },
  {
    table: "lead_tasks",
    module: "crm",
    action: "lead.task_created",
    label: "Tarefa de lead criada",
    subject: "title",
  },
  {
    table: "leads",
    module: "crm",
    action: "lead.created",
    label: "Lead cadastrado",
    subject: "full_name",
  },
  {
    table: "outbound_messages",
    module: "communications",
    action: "message.created",
    label: "Mensagem registrada",
    actor: "NULL",
  },
  {
    table: "patient_plans",
    module: "plans",
    action: "plan.created",
    label: "Plano contratado",
    subject: "name",
  },
  {
    table: "patients",
    module: "patients",
    action: "patient.created",
    label: "Cliente cadastrado",
    subject: "full_name",
  },
  {
    table: "payable_events",
    module: "finance",
    action: "payable",
    label: "Movimentação de conta a pagar registrada",
    actor: "actor_user_id",
    actionSuffix: "kind",
  },
  {
    table: "products",
    module: "patients",
    action: "product.created",
    label: "Produto cadastrado",
    subject: "name",
  },
  {
    table: "professionals",
    module: "agenda",
    action: "professional.created",
    label: "Profissional cadastrado",
    subject: "full_name",
  },
  {
    table: "receivable_renegotiations",
    module: "finance",
    action: "finance.renegotiated",
    label: "Recebíveis renegociados",
  },
  {
    table: "recurring_payables",
    module: "finance",
    action: "recurring_payable.created",
    label: "Conta recorrente criada",
  },
  {
    table: "replacement_credits",
    module: "groups",
    action: "group.replacement_created",
    label: "Crédito de reposição criado",
  },
  {
    table: "rooms",
    module: "agenda",
    action: "room.created",
    label: "Sala cadastrada",
    subject: "name",
  },
  {
    table: "satisfaction_surveys",
    module: "agenda",
    action: "satisfaction.created",
    label: "Pesquisa de satisfação registrada",
    actor: "actor_user_id",
  },
  {
    table: "schedule_blocks",
    module: "agenda",
    action: "schedule.block_created",
    label: "Bloqueio de agenda criado",
  },
  {
    table: "services",
    module: "agenda",
    action: "service.created",
    label: "Serviço cadastrado",
    subject: "name",
  },
  {
    table: "session_movements",
    module: "plans",
    action: "session.movement",
    label: "Saldo de sessões movimentado",
    actor: "actor_user_id",
  },
  {
    table: "stock_movements",
    module: "patients",
    action: "stock.movement",
    label: "Estoque movimentado",
    actor: "actor_user_id",
  },
  {
    table: "therapeutic_goals",
    module: "clinical",
    action: "clinical.goal_created",
    label: "Objetivo terapêutico criado",
    clinical: patient,
  },
  {
    table: "treatment_closures",
    module: "clinical",
    action: "clinical.closure_created",
    label: "Encerramento clínico registrado",
    clinical: patient,
  },
];

const text = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sourceSelect(source: HistorySource, clinicParameter: string) {
  const time = `s.${source.time ?? "created_at"}`;
  const actor =
    source.actor && source.actor !== "NULL" ? `s.${source.actor}` : "NULL";
  let action = text(source.action);
  let label = text(source.label);
  if (
    source.table === "financial_events" ||
    source.table === "payable_events"
  ) {
    action = `CONCAT(${action}, '.', s.kind)`;
    label = `CASE s.kind WHEN 'payment' THEN ${text(source.table === "financial_events" ? "Pagamento recebido" : "Conta paga")}
      WHEN 'payment_reversal' THEN 'Pagamento estornado' WHEN 'cancellation' THEN 'Conta cancelada'
      ELSE 'Conta registrada' END`;
  } else if (source.actionSuffix) {
    action = `CONCAT(${action}, '.', s.${source.actionSuffix})`;
  } else if (source.table === "patient_plans") {
    // Crédito vendido na comanda aparece como serviço avulso.
    action = `IF(s.source_tab_id IS NULL, ${action}, 'plan.tab_credit')`;
    label = `IF(s.source_tab_id IS NULL, ${label}, ${text(tabCreditHistoryLabel)})`;
  }
  const metadata = [
    `'sourceTable', ${text(source.table)}`,
    "'sourceId', s.id",
    "'importedHistory', 1 = 0",
    `'actorUnavailable', ${actor} IS NULL`,
    ...(source.module !== "clinical" && source.subject
      ? [`'subjectName', s.${source.subject}`]
      : []),
    ...Object.entries(source.clinical ?? {}).map(
      ([key, column]) => `${text(key)}, s.${column}`,
    ),
  ];
  return `SELECT s.id, s.clinic_id, ${actor} AS actor_user_id, CAST(NULL AS CHAR) AS ip_address,
      ${text(source.module)} AS module, ${label} AS description, ${action} AS action,
      ${text(source.table)} AS entity_type, s.id AS entity_id,
      CAST(JSON_OBJECT(${metadata.join(", ")}) AS CHAR) AS metadata, ${time} AS created_at
    FROM ${source.table} s WHERE s.clinic_id = ${clinicParameter} AND ${time} IS NOT NULL`;
}

/**
 * Tabela derivada com os eventos gravados (`audit_events`) e os montados das tabelas de
 * origem, com as mesmas colunas de `audit_events`.
 */
export function historyEventsTable(clinicParameter: string) {
  return `(SELECT a.id, a.clinic_id, a.actor_user_id, a.ip_address, a.module, a.description,
      a.action, a.entity_type, a.entity_id, CAST(a.metadata AS CHAR) AS metadata, a.created_at
    FROM audit_events a WHERE a.clinic_id = ${clinicParameter}
    UNION ALL ${sources
      .map((source) => sourceSelect(source, clinicParameter))
      .join("\n    UNION ALL ")})`;
}
