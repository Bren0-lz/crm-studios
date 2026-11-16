import { z } from "zod";
import type { GroupClass, GroupEnrollment } from "../agenda/types.js";
import {
  waitlistEntryInputSchema,
  waitlistEntryUpdateSchema,
  waitlistKindSchema,
  waitlistStatusSchema,
} from "./model.js";

export type WaitlistKind = z.infer<typeof waitlistKindSchema>;

export type WaitlistStatus = z.infer<typeof waitlistStatusSchema>;

export type WaitlistEntryInput = z.input<typeof waitlistEntryInputSchema>;

export type WaitlistEntryData = z.output<typeof waitlistEntryInputSchema>;

export type WaitlistEntryUpdate = z.infer<typeof waitlistEntryUpdateSchema>;

export interface WaitlistEntry {
  id: string;
  clinicId: string;
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  kind: WaitlistKind;
  serviceId: string | null;
  productId: string | null;
  /** Nome do serviço ou do produto aguardado. */
  itemName: string;
  status: WaitlistStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Quando saiu da fila (atendido ou desistiu). */
  resolvedAt: string | null;
}

/** Serviços e produtos ativos que podem ser aguardados. */
export interface WaitlistOptions {
  services: { id: string; name: string }[];
  products: { id: string; name: string; currentStock: number }[];
}

/**
 * Espera da turma (RE14): matrícula `waitlisted` de uma turma cheia, mostrada na Lista de
 * espera junto das entradas do serviço. A posição é a da fila da turma (`queuePosition`).
 */
export interface GroupWaitlistItem {
  enrollment: GroupEnrollment;
  group: GroupClass;
}

export interface WaitlistDemand {
  key: string;
  kind: WaitlistKind;
  itemId: string;
  itemName: string;
  total: number;
  waiting: number;
  contacted: number;
  /** Entrada mais antiga ainda na fila. */
  oldestSince: string;
}
