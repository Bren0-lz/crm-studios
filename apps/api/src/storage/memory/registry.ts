import type { AdministrativeRegistryInput } from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
export function createRegistryRepository(context: MemoryRepositoryContext) {
  return {
    async getAdministrativeRegistry(clinicId: string) {
      return structuredClone({
        professionals: context.professionals.filter(
          (item) => item.clinicId === clinicId && context.inBranchScope(item),
        ),
        rooms: context.rooms.filter(
          (item) => item.clinicId === clinicId && context.inBranchScope(item),
        ),
        services: context.services.filter((item) => item.clinicId === clinicId),
      });
    },
    async updateAdministrativeRegistry(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: AdministrativeRegistryInput,
    ) {
      const items =
        input.kind === "professional"
          ? context.professionals
          : input.kind === "room"
            ? context.rooms
            : context.services;
      const current = items.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!current)
        throw new DomainError(
          "REGISTRY_NOT_FOUND",
          "Cadastro não encontrado.",
          404,
        );
      if (
        input.kind === "professional" &&
        context.professionals.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== id &&
            context.branchOf(item) === context.branchOf(current) &&
            item.crefito.toLowerCase() === input.data.crefito.toLowerCase(),
        )
      )
        throw new DomainError(
          "PROFESSIONAL_CREFITO_EXISTS",
          "Já existe um profissional com este registro.",
          409,
        );
      if (
        input.kind === "room" &&
        context.rooms.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== id &&
            context.branchOf(item) === context.branchOf(current) &&
            item.name.toLowerCase() === input.data.name.toLowerCase(),
        )
      )
        throw new DomainError(
          "ROOM_DUPLICATE",
          "Já existe uma sala com este nome.",
          409,
        );
      if (
        input.kind === "room" &&
        input.data.capacity < (current as { capacity: number }).capacity &&
        context.groupClasses.some(
          (item) =>
            item.clinicId === clinicId &&
            item.roomId === id &&
            item.active &&
            item.capacity > input.data.capacity,
        )
      )
        throw new DomainError(
          "ROOM_CAPACITY_IN_USE",
          "A capacidade não pode ficar abaixo das vagas de uma turma ativa.",
          409,
        );
      Object.assign(current, input.data);
      for (const collection of [
        context.appointments,
        context.groupClasses,
        context.groupSessions,
      ])
        for (const item of collection) {
          if (item.clinicId !== clinicId) continue;
          if (input.kind === "professional" && item.professionalId === id) {
            item.professionalName = input.data.fullName;
            if ("professionalColor" in item)
              item.professionalColor = input.data.color;
          }
          if (input.kind === "room" && item.roomId === id)
            item.roomName = input.data.name;
          if (
            input.kind === "service" &&
            "serviceId" in item &&
            item.serviceId === id
          )
            item.serviceName = input.data.name;
        }
      context.recordAudit(
        clinicId,
        actorUserId,
        "registry.updated",
        input.kind,
        { active: input.data.active },
        id,
      );
      return structuredClone(current);
    },
  };
}
