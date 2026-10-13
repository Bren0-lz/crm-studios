import { z } from "zod";
import type { Appointment, GroupEnrollment } from "../agenda/types.js";
import type { BroadcastSkipReason } from "../communications/types.js";
import type { PatientPlan } from "../plans/types.js";
import {
  clientAgeBandSchema,
  guidedPatientInputSchema,
  leadStageSchema,
  patientExportColumnSchema,
  patientExportFilterSchema,
  patientImportFileSchema,
  patientInputSchema,
  patientListQuerySchema,
  patientStatusSchema,
  patientTagInputSchema,
  patientTagUpdateSchema,
} from "./model.js";

export type PatientStatus = z.infer<typeof patientStatusSchema>;

export type PatientInput = z.infer<typeof patientInputSchema>;

export type PatientTagInput = z.infer<typeof patientTagInputSchema>;

export type PatientTagUpdate = z.infer<typeof patientTagUpdateSchema>;

/** Etiqueta configurada da clínica (Configurações › Etiquetas). */
export interface PatientTag {
  id: string;
  clinicId: string;
  name: string;
  /** `#rrggbb` (minúsculas). */
  color: string;
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
}

export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

export type LeadStage = z.infer<typeof leadStageSchema>;

export interface PatientWithoutReturn {
  patientId: string;
  patientName: string;
  lastCompletedAt: string;
  nextAppointmentAt?: string;
}

export interface Patient extends PatientInput {
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
  | "contact"
  | "message"
  | "satisfaction";

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
  input?: PatientInput;
  /** Mensagens em pt-BR, presentes em linhas `error`. */
  errors?: string[];
  /** Presente em linhas `duplicate`. */
  duplicateOf?: PatientImportDuplicate;
}

export interface PatientImportAnalysis {
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
