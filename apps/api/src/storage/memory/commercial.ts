import { leadConversionData } from "../../modules/commercial/conversion.js";
import type {
  Lead,
  LeadActivity,
  LeadContact,
  LeadContactInput,
  LeadConversion,
  LeadInput,
  LeadStage,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createCommercialRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async listLeads(clinicId: string) {
      return repositoryContext.leads
        .filter((lead) => lead.clinicId === clinicId)
        .map((lead) => {
          const tasks = repositoryContext.leadTasks.filter(
            (task) => task.clinicId === clinicId && task.leadId === lead.id,
          );
          const contacts = repositoryContext.leadContacts.filter(
            (contact) =>
              contact.clinicId === clinicId && contact.leadId === lead.id,
          );
          const responsibleName = lead.responsibleUserId
            ? repositoryContext.users.find(
                (user) => user.id === lead.responsibleUserId,
              )?.fullName
            : undefined;
          const lastContactAt = contacts.sort((a, b) =>
            b.occurredAt.localeCompare(a.occurredAt),
          )[0]?.occurredAt;
          return {
            ...lead,
            ...(responsibleName ? { responsibleName } : {}),
            openTasks: tasks.filter((task) => task.status === "open").length,
            overdueTasks: tasks.filter(
              (task) => task.status === "open" && task.dueAt < now(),
            ).length,
            ...(lastContactAt ? { lastContactAt } : {}),
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async createLead(clinicId: string, input: LeadInput) {
      if (
        input.responsibleUserId &&
        !repositoryContext.users.some(
          (user) =>
            user.clinicId === clinicId && user.id === input.responsibleUserId,
        )
      )
        throw new DomainError(
          "RESPONSIBLE_USER_NOT_FOUND",
          "Responsável não encontrado.",
          404,
        );
      const timestamp = now();
      const responsibleName = input.responsibleUserId
        ? repositoryContext.users.find(
            (user) => user.id === input.responsibleUserId,
          )?.fullName
        : undefined;
      const lead: Lead = {
        ...input,
        id: uuid(),
        clinicId,
        stage: "new_contact",
        ...(responsibleName ? { responsibleName } : {}),
        openTasks: 0,
        overdueTasks: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.leads.push(lead);
      return lead;
    },

    async updateLead(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: LeadInput,
    ) {
      const lead = repositoryContext.leads.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!lead) return null;
      if (lead.convertedPatientId)
        throw new DomainError(
          "LEAD_ALREADY_CONVERTED",
          "Atualize o cadastro convertido pelo contexto do cliente.",
          409,
        );
      const responsible = input.responsibleUserId
        ? repositoryContext.users.find(
            (user) =>
              user.clinicId === clinicId &&
              user.id === input.responsibleUserId &&
              (user.active || lead.responsibleUserId === user.id),
          )
        : undefined;
      if (input.responsibleUserId && !responsible)
        throw new DomainError(
          "RESPONSIBLE_USER_NOT_FOUND",
          "Responsável não encontrado.",
          404,
        );
      Object.assign(lead, input, { updatedAt: now() });
      if (responsible) lead.responsibleName = responsible.fullName;
      else delete lead.responsibleName;
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "lead.updated",
        "lead",
        {},
        id,
      );
      return structuredClone(lead);
    },
    async moveLead(
      clinicId: string,
      _actorUserId: string,
      leadId: string,
      stage: LeadStage,
      lostReason?: string,
    ) {
      const lead = repositoryContext.leads.find(
        (item) => item.clinicId === clinicId && item.id === leadId,
      );
      if (!lead) return null;
      if (lead.convertedPatientId) {
        throw new DomainError(
          "LEAD_ALREADY_CONVERTED",
          "Este lead já foi convertido em cliente.",
          409,
        );
      }
      if (stage === "won") {
        throw new DomainError(
          "LEAD_CONVERSION_REQUIRED",
          "Use a conversão para marcar o lead como ganho.",
        );
      }
      lead.stage = stage;
      if (stage === "lost" && lostReason) lead.lostReason = lostReason;
      else delete lead.lostReason;
      lead.updatedAt = now();
      return lead;
    },

    async convertLead(
      clinicId: string,
      _actorUserId: string,
      leadId: string,
    ): Promise<LeadConversion | null> {
      const lead = repositoryContext.leads.find(
        (item) => item.clinicId === clinicId && item.id === leadId,
      );
      if (!lead) return null;
      if (lead.convertedPatientId) {
        const converted = repositoryContext.patients.find(
          (patient) =>
            patient.clinicId === clinicId &&
            patient.id === lead.convertedPatientId,
        );
        const canonical = converted?.mergedIntoPatientId
          ? repositoryContext.patients.find(
              (patient) =>
                patient.clinicId === clinicId &&
                patient.id === converted.mergedIntoPatientId,
            )
          : converted;
        return canonical
          ? { lead, patient: canonical, reusedExisting: true }
          : null;
      }
      let patient = repositoryContext.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          (item.phone === lead.phone ||
            Boolean(
              lead.email &&
              item.email?.toLocaleLowerCase() ===
                lead.email.toLocaleLowerCase(),
            ) ||
            Boolean(lead.cpf && item.cpf === lead.cpf)),
      );
      if (patient?.mergedIntoPatientId)
        patient = repositoryContext.patients.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === patient!.mergedIntoPatientId,
        );
      const reusedExisting = Boolean(patient);
      const data = leadConversionData(lead, patient);
      for (const tag of data.tags)
        repositoryContext.ensurePatientTag(clinicId, tag);
      if (patient) Object.assign(patient, data, { updatedAt: now() });
      else
        patient = await repositoryContext.operations.createPatient(
          clinicId,
          data,
        );
      for (const appointment of repositoryContext.appointments) {
        if (appointment.clinicId !== clinicId || appointment.leadId !== lead.id)
          continue;
        appointment.patientId = patient.id;
        appointment.patientName = patient.fullName;
        delete appointment.leadId;
        delete appointment.leadName;
        appointment.updatedAt = now();
      }
      lead.convertedPatientId = patient.id;
      lead.stage = "won";
      delete lead.lostReason;
      lead.updatedAt = now();
      return { lead, patient, reusedExisting };
    },

    async getLeadActivity(
      clinicId: string,
      leadId: string,
    ): Promise<LeadActivity | null> {
      if (
        !repositoryContext.leads.some(
          (item) => item.clinicId === clinicId && item.id === leadId,
        )
      )
        return null;
      return {
        contacts: repositoryContext.leadContacts
          .filter(
            (item) => item.clinicId === clinicId && item.leadId === leadId,
          )
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
        tasks: repositoryContext.leadTasks
          .filter(
            (item) => item.clinicId === clinicId && item.leadId === leadId,
          )
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
      };
    },

    async createLeadContact(
      clinicId: string,
      actorUserId: string,
      leadId: string,
      input: LeadContactInput,
    ) {
      const lead = repositoryContext.leads.find(
        (item) => item.clinicId === clinicId && item.id === leadId,
      );
      if (!lead) return null;
      const actor = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === actorUserId,
      );
      if (!actor)
        throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      const contact: LeadContact = {
        ...input,
        id: uuid(),
        clinicId,
        leadId,
        actorName: actor.fullName,
        occurredAt: input.occurredAt ?? now(),
        createdAt: now(),
      };
      repositoryContext.leadContacts.push(contact);
      lead.updatedAt = now();
      lead.lastContactAt = [lead.lastContactAt ?? "", contact.occurredAt]
        .sort()
        .at(-1)!;
      if (!lead.contactMethod && input.contactMethod)
        lead.contactMethod = input.contactMethod;
      return contact;
    },

    async createLeadTask(
      clinicId: string,
      actorUserId: string,
      leadId: string,
      input: LeadTaskInput,
    ) {
      const lead = repositoryContext.leads.find(
        (item) => item.clinicId === clinicId && item.id === leadId,
      );
      if (!lead) return null;
      const assignedUserId = input.assignedUserId || actorUserId;
      const assigned = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === assignedUserId,
      );
      if (!assigned)
        throw new DomainError(
          "ASSIGNED_USER_NOT_FOUND",
          "Usuário responsável pela tarefa não encontrado.",
          404,
        );
      const timestamp = now();
      const task: LeadTask = {
        ...input,
        assignedUserId,
        id: uuid(),
        clinicId,
        leadId,
        assignedUserName: assigned.fullName,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.leadTasks.push(task);
      lead.updatedAt = timestamp;
      repositoryContext.refreshLeadTaskStats(lead);
      return task;
    },

    async updateLeadTaskStatus(
      clinicId: string,
      taskId: string,
      status: LeadTaskStatus,
    ) {
      const task = repositoryContext.leadTasks.find(
        (item) => item.clinicId === clinicId && item.id === taskId,
      );
      if (!task) return null;
      task.status = status;
      task.updatedAt = now();
      if (status === "completed") task.completedAt = now();
      else delete task.completedAt;
      const lead = repositoryContext.leads.find(
        (item) => item.id === task.leadId,
      );
      if (lead) repositoryContext.refreshLeadTaskStats(lead);
      return task;
    },
  };
}
