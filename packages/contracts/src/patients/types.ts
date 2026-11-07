import { z } from "zod";
import type { Appointment, GroupEnrollment } from "../agenda/types.js";
import type { BroadcastSkipReason } from "../communications/types.js";
import type { PatientPlan } from "../plans/types.js";
import type { WaitlistEntry } from "../waitlist/types.js";
import {
  clientAgeBandSchema,
  guidedPatientInputSchema,
  leadStageSchema,
  patientExportColumnSchema,
  patientExportFilterSchema,
  patientImportFieldSchema,
  patientImportFileSchema,
  patientImportInputSchema,
  patientUpdateInputSchema,
  patientInputSchema,
  patientDiscountSchema,
  patientListQuerySchema,
  patientStatusSchema,
  patientTagCategorySchema,
  patientTagInputSchema,
  patientTagUpdateSchema,
} from "./model.js";

export type PatientStatus = z.infer<typeof patientStatusSchema>;

export type PatientInput = z.infer<typeof patientInputSchema>;

/** Cliente vindo da planilha: o CPF pode faltar (B6-05). */
export type PatientImportInput = z.infer<typeof patientImportInputSchema>;

/** Edição do cliente: o CPF pode seguir vazio, mas não ser apagado (B6-05). */
export type PatientUpdateInput = z.infer<typeof patientUpdateInputSchema>;

export type PatientDiscount = z.infer<typeof patientDiscountSchema>;

export type PatientTagInput = z.infer<typeof patientTagInputSchema>;
export type PatientTagCategory = z.infer<typeof patientTagCategorySchema>;

export type PatientTagUpdate = z.infer<typeof patientTagUpdateSchema>;

/** Etiqueta configurada da clínica (Configurações › Etiquetas). */
export interface PatientTag {
  id: string;
  clinicId: string;
  name: string;
  /** `#rrggbb` (minúsculas). */
  color: string;
  /** Categoria opcional (V3); a cor dela vale quando a etiqueta não tem cor própria. */
  category?: PatientTagCategory;
  /** Quantos clientes têm a etiqueta. */
  patientCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PatientExportColumn = z.infer<typeof patientExportColumnSchema>;

export type PatientExportFilter = z.infer<typeof patientExportFilterSchema>;

export type GuidedPatientInput = z.infer<typeof guidedPatientInputSchema>;

export type GuidedPatientNext = GuidedPatientInput["next"];

/** Resposta de `POST /patients/guided` (só os registros criados pelo passo escolhido). */
export interface GuidedPatientResult {
  patient: Patient;
  appointment?: Appointment;
  plan?: PatientPlan;
  /** `status: "waitlisted"` quando a turma estava cheia. */
  enrollment?: GroupEnrollment;
  /** Demais planos de `additionalPlans`, na mesma ordem, cada um com a sua matrícula. */
  additionalPlans?: { plan: PatientPlan; enrollment?: GroupEnrollment }[];
  /** Entradas da Lista de espera criadas para os serviços de turma cheia (TW3). */
  waitlistEntries?: WaitlistEntry[];
}

export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

export type LeadStage = z.infer<typeof leadStageSchema>;

export interface PatientWithoutReturn {
  patientId: string;
  patientName: string;
  lastCompletedAt: string;
  nextAppointmentAt?: string;
  /** Contato do cadastro, para o botão de WhatsApp da lista. */
  phone?: string;
  whatsapp?: string;
  /** Tudo o que o cliente já contratou (todo o histórico, sem repetir), para o filtro da lista. */
  contracted?: ContractedItem[];
}

/**
 * Item já contratado pelo cliente: plano, plano avulso, produto ou serviço de comanda antiga,
 * pelo nome da venda.
 */
export interface ContractedItem {
  sourceType: "plan" | "single" | "service" | "product";
  itemName: string;
}

export interface Patient extends Omit<
  PatientInput,
  "cpf" | "whatsapp" | "emergencyContactName" | "emergencyContactPhone"
> {
  /** Cadastros antigos e duplicados já mesclados podem não ter CPF. */
  cpf?: string | undefined;
  /** Cadastros antigos e importados podem estar sem WhatsApp ou contato de emergência (CD1). */
  whatsapp?: string | undefined;
  emergencyContactName?: string | undefined;
  emergencyContactPhone?: string | undefined;
  inactiveAt?: string;
  mergedIntoPatientId?: string;
  /** Data da importação pela planilha (CD3); ausente em cadastro manual. */
  importedAt?: string;
  id: string;
  clinicId: string;
  recordNumber: string;
  status: PatientStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cliente na lista mínima de apoio (`GET /patients/options`): só o que Agenda, Comunicações,
 * Contratos e Turmas precisam para escolher o cliente (nome) e filtrar comunicados (etiquetas),
 * sem os dados cadastrais (telefone, CPF, endereço…), que ficam no módulo Clientes.
 */
export interface PatientOption {
  id: string;
  fullName: string;
  tags: string[];
}

export type ClientAgeBand = z.infer<typeof clientAgeBandSchema>;

export interface ClientAgeBandCount {
  band: ClientAgeBand;
  label: string;
  clients: number;
}

export interface BroadcastSkippedPatient {
  patientId: string;
  patientName: string;
  reason: BroadcastSkipReason;
}

// Linha do tempo do cliente

export type PatientTimelineKind =
  | "appointment"
  | "plan_created"
  | "plan_renewed"
  | "plan_cancelled"
  | "payment"
  | "payment_reversal"
  /** Recibo para assinatura da baixa: enviado, 1ª visualização e assinatura do cliente. */
  | "receipt_sent"
  | "receipt_viewed"
  | "receipt_signed"
  | "contact"
  | "message"
  | "satisfaction"
  /** Edição do cadastro do cliente (diferenças e motivo, como no Histórico geral). */
  | "patient_updated";

/**
 * Evento do histórico do cliente (`GET /patients/:id/timeline`, mais recentes
 * primeiro). Nunca traz conteúdo clínico (evoluções, avaliações).
 */
export interface PatientTimelineEntry {
  /** `<kind>:<id da origem>` — único na linha do tempo. */
  id: string;
  kind: PatientTimelineKind;
  /** ISO 8601. */
  occurredAt: string;
  /** Texto curto em pt-BR. */
  title: string;
  detail?: string;
  /** Valor com sinal (estornos negativos). */
  amountInCents?: number;
  /**
   * Código bruto da origem: status do atendimento (`AppointmentStatus`),
   * resultado do contato (`ContactOutcome`) ou status da mensagem.
   */
  status?: string;
  /** Nota 0–10, só em `satisfaction`. */
  score?: number;
}

export type PatientImportRowStatus = "valid" | "error" | "duplicate";

/** Com quem a linha importada colide: um cliente já cadastrado ou uma linha anterior do arquivo. */
export type PatientImportDuplicate =
  | {
      kind: "existing";
      field: "cpf" | "phone";
      patientId: string;
      fullName: string;
    }
  | { kind: "row"; field: "cpf" | "phone"; line: number };

export interface PatientImportRow {
  /** Número da linha na planilha (o cabeçalho é a linha 1 quando está no topo). */
  line: number;
  status: PatientImportRowStatus;
  /** Nome e telefone como vieram no arquivo, para exibir na prévia. */
  fullName: string;
  phone: string;
  /** Presente em linhas `valid` e `duplicate`. */
  input?: PatientImportInput;
  /** Mensagens em pt-BR, presentes em linhas `error`. */
  errors?: string[];
  /** Presente em linhas `duplicate`. */
  duplicateOf?: PatientImportDuplicate;
}

export type PatientImportField = z.infer<typeof patientImportFieldSchema>;

/** Coluna da planilha enviada: título do cabeçalho e até 3 valores de exemplo. */
export interface PatientImportColumn {
  /** Posição da coluna (0 = primeira). */
  index: number;
  title: string;
  samples: string[];
}

export interface PatientImportAnalysis {
  /** Colunas do cabeçalho, para a tela de mapeamento (vazio se o arquivo não tem cabeçalho). */
  columns: PatientImportColumn[];
  /** Mapeamento aplicado: `mapping[i]` é o campo da coluna `i` (`null` = não importada). */
  mapping: (PatientImportField | null)[];
  rows: PatientImportRow[];
  /** Problemas gerais do arquivo (ex.: coluna obrigatória ausente); quando há algum, `rows` fica vazio. */
  errors: string[];
  totals: { valid: number; error: number; duplicate: number };
}

export type PatientImportFileInput = z.infer<typeof patientImportFileSchema>;

/** Resultado da importação: linhas criadas, ignoradas por duplicidade e linhas com erro. */
export interface PatientImportResult {
  created: number;
  skipped: number;
  errors: number;
}
