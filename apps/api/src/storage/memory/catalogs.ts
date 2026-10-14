import {
  patientTagKey,
  type ClinicCatalogEntry,
  type ClinicCatalogInput,
  type ClinicCatalogKind,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createCatalogsRepository(context: MemoryRepositoryContext) {
  const entries = context.clinicCatalogEntries;
  return {
    async listClinicCatalog(clinicId: string, kind: ClinicCatalogKind) {
      return entries
        .filter((item) => item.clinicId === clinicId && item.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((item) => ({ ...item }));
    },
    async saveClinicCatalog(
      clinicId: string,
      actorUserId: string,
      kind: ClinicCatalogKind,
      input: ClinicCatalogInput,
      id?: string,
    ) {
      const current = id
        ? entries.find(
            (item) =>
              item.id === id &&
              item.clinicId === clinicId &&
              item.kind === kind,
          )
        : undefined;
      if (id && !current) return null;
      if (
        entries.some(
          (item) =>
            item.clinicId === clinicId &&
            item.kind === kind &&
            item.id !== id &&
            patientTagKey(item.name) === patientTagKey(input.name),
        )
      )
        throw new DomainError(
          "CATALOG_DUPLICATE",
          "Já existe um cadastro com este nome.",
          409,
        );
      if (
        input.parentId &&
        entries.some(
          (item) => item.clinicId === clinicId && item.parentId === id,
        )
      )
        throw new DomainError(
          "CATALOG_HAS_SUBCATEGORIES",
          "Uma categoria com subcategorias não pode se tornar subcategoria.",
          409,
        );
      if (
        input.parentId &&
        (kind !== "product_category" ||
          input.parentId === id ||
          !entries.some(
            (item) =>
              item.clinicId === clinicId &&
              item.kind === kind &&
              item.id === input.parentId &&
              !item.parentId &&
              (item.active || current?.parentId === item.id),
          ))
      )
        throw new DomainError(
          "CATALOG_INVALID_PARENT",
          "Categoria principal inválida.",
          400,
        );
      const item: ClinicCatalogEntry = {
        ...current,
        ...input,
        id: current?.id ?? uuid(),
        clinicId,
        kind,
        createdAt: current?.createdAt ?? now(),
        updatedAt: now(),
      };
      if (current) {
        const oldName = current.name;
        Object.assign(current, item);
        if (kind === "interest" || kind === "level")
          for (const patient of context.patients.filter(
            (patient) => patient.clinicId === clinicId,
          )) {
            if (kind === "interest")
              patient.interests = patient.interests?.map((name) =>
                name === oldName ? item.name : name,
              );
            else if (patient.level === oldName) patient.level = item.name;
          }
      } else entries.push(item);
      context.recordAudit(
        clinicId,
        actorUserId,
        "catalog.saved",
        "catalog",
        { kind, name: item.name, active: item.active },
        item.id,
      );
      return { ...item };
    },
  };
}
