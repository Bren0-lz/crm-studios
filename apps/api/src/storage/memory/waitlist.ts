import {
  activeWaitlistStatuses,
  type WaitlistEntry,
  type WaitlistEntryData,
  type WaitlistEntryUpdate,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

/** Entrada gravada: nomes e telefone vêm do cadastro na leitura. */
export type WaitlistRow = Omit<
  WaitlistEntry,
  "patientName" | "patientPhone" | "itemName"
>;

export function createWaitlistRepository(context: MemoryRepositoryContext) {
  const visible = (row: WaitlistRow, clinicId: string) =>
    row.clinicId === clinicId && context.inBranchScope(row);
  function itemName(row: Pick<WaitlistRow, "serviceId" | "productId">) {
    return row.serviceId
      ? context.services.find((item) => item.id === row.serviceId)?.name
      : context.products.find((item) => item.id === row.productId)?.name;
  }
  function toEntry(row: WaitlistRow): WaitlistEntry {
    const patient = context.patients.find((item) => item.id === row.patientId);
    return {
      ...row,
      patientName: patient?.fullName ?? "",
      patientPhone: patient?.phone ?? "",
      itemName: itemName(row) ?? "",
    };
  }
  return {
    async listWaitlist(clinicId: string) {
      return context.waitlistEntries
        .filter((row) => visible(row, clinicId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toEntry);
    },
    async createWaitlistEntry(
      clinicId: string,
      _actorUserId: string,
      input: WaitlistEntryData,
    ) {
      if (
        !context.patients.some(
          (item) => item.clinicId === clinicId && item.id === input.patientId,
        )
      )
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      if (
        input.serviceId &&
        !context.services.some(
          (item) => item.clinicId === clinicId && item.id === input.serviceId,
        )
      )
        throw new DomainError(
          "SERVICE_NOT_FOUND",
          "Serviço não encontrado.",
          404,
        );
      if (
        input.productId &&
        !context.products.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.productId &&
            context.inBranchScope(item),
        )
      )
        throw new DomainError(
          "PRODUCT_NOT_FOUND",
          "Produto não encontrado.",
          404,
        );
      const duplicate = context.waitlistEntries.find(
        (row) =>
          visible(row, clinicId) &&
          row.patientId === input.patientId &&
          row.serviceId === input.serviceId &&
          row.productId === input.productId &&
          activeWaitlistStatuses.includes(row.status),
      );
      if (duplicate)
        throw new DomainError(
          "WAITLIST_DUPLICATE",
          `O cliente já está na lista de espera de ${itemName(duplicate)}.`,
          409,
        );
      const timestamp = now();
      const row: WaitlistRow = {
        id: uuid(),
        clinicId,
        branchId: context.writeBranchId(clinicId),
        patientId: input.patientId,
        kind: input.kind,
        serviceId: input.serviceId,
        productId: input.productId,
        status: "waiting",
        notes: input.notes,
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: null,
      };
      context.waitlistEntries.push(row);
      return toEntry(row);
    },
    async updateWaitlistEntry(
      clinicId: string,
      _actorUserId: string,
      id: string,
      input: WaitlistEntryUpdate,
    ) {
      const row = context.waitlistEntries.find(
        (item) => item.id === id && visible(item, clinicId),
      );
      if (!row) return null;
      const timestamp = now();
      if (input.status !== undefined && input.status !== row.status) {
        row.status = input.status;
        row.resolvedAt = activeWaitlistStatuses.includes(input.status)
          ? null
          : timestamp;
      }
      if (input.notes !== undefined) row.notes = input.notes;
      row.updatedAt = timestamp;
      return toEntry(row);
    },
    async deleteWaitlistEntry(clinicId: string, id: string) {
      const index = context.waitlistEntries.findIndex(
        (item) => item.id === id && visible(item, clinicId),
      );
      if (index < 0) return false;
      context.waitlistEntries.splice(index, 1);
      return true;
    },
  };
}
