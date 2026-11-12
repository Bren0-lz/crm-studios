import {
  leadConversionData,
  withConversionInput,
} from "../../modules/commercial/conversion.js";
import {
  countEventParticipantPlans,
  planEventParticipants,
} from "../../modules/commercial/event-participants.js";
import {
  eventLeadSource,
  buildLeadFilterOptions,
  buildLeadInsights,
  findLeadDuplicates,
  firstOpenLeadStage,
  matchesLead,
  mergeExtraFields,
  resolveLeadStages,
  type LeadDuplicateQuery,
  type LeadFilter,
  type LeadPage,
  type LeadStagesInput,
  type LeadStagePage,
} from "@crm/contracts";
import type {
  Lead,
  LeadActivity,
  LeadContact,
  LeadContactInput,
  LeadConversion,
  LeadConversionInput,
  LeadInput,
  ExtraFields,
  LeadStage,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import {
  planLeadStages,
  stageNotEmptyError,
  stageNotFoundError,
} from "../../modules/commercial/stages.js";
import { assertLeadImportStage } from "../../modules/commercial/lead-import.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createCommercialRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  const filteredLeads = async (
    clinicId: string,
    filter: LeadFilter,
    timezone?: string,
  ) =>
    (await repository.listLeads(clinicId)).filter((lead) =>
      matchesLead(lead, filter, timezone),
    );
  async function createLead(
    clinicId: string,
    input: LeadInput & { extraFields?: ExtraFields },
    /** Etapa de entrada (importação, LI1); sem ela, a primeira aberta. */
    stage?: string,
  ) {
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
    // Participante de evento: origem "Evento: <nome>" e a filial do evento (se tiver).
    const event = input.eventId
      ? repositoryContext.events.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.eventId &&
            (!item.branchId || repositoryContext.inBranchScope(item)),
        )
      : undefined;
    if (input.eventId && !event)
      throw new DomainError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);
    const timestamp = now();
    const responsibleName = input.responsibleUserId
      ? repositoryContext.users.find(
          (user) => user.id === input.responsibleUserId,
        )?.fullName
      : undefined;
    const lead: Lead = {
      ...input,
      ...(event ? { source: eventLeadSource(event.name) } : {}),
      branchId: event?.branchId ?? repositoryContext.writeBranchId(clinicId),
      id: uuid(),
      clinicId,
      stage:
        stage ?? firstOpenLeadStage(await repository.listLeadStages(clinicId)),
      ...(responsibleName ? { responsibleName } : {}),
      openTasks: 0,
      overdueTasks: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    repositoryContext.leads.push(lead);
    return lead;
  }

  const repository = {
    async listLeads(clinicId: string) {
      return repositoryContext.leads
        .filter(
          (lead) =>
            lead.clinicId === clinicId &&
            repositoryContext.inBranchScope(lead) &&
            !repositoryContext.isTrashed("leads", lead.id),
        )
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

    async findLeadDuplicates(clinicId: string, query: LeadDuplicateQuery) {
      return findLeadDuplicates(
        query,
        repositoryContext.patients.filter(
          (patient) =>
            patient.clinicId === clinicId &&
            !patient.mergedIntoPatientId &&
            !repositoryContext.isTrashed("patients", patient.id),
        ),
        repositoryContext.leads.filter(
          (lead) =>
            lead.clinicId === clinicId &&
            !lead.convertedPatientId &&
            !repositoryContext.isTrashed("leads", lead.id),
        ),
      );
    },

    createLead,
    async importEventParticipants(
      clinicId: string,
      eventId: string,
      inputs: (LeadInput & { extraFields?: ExtraFields })[],
    ) {
      const patients = repositoryContext.patients
        .filter((item) => item.clinicId === clinicId)
        .map((item) => ({
          ...item,
          canonicalId: item.mergedIntoPatientId ?? item.id,
        }));
      const participants = repositoryContext.leads.filter(
        (lead) => lead.clinicId === clinicId && lead.eventId === eventId,
      );
      const plans = planEventParticipants(inputs, patients, participants);
      const created: Lead[] = [];
      try {
        for (const plan of plans) {
          if (plan.kind === "skip") continue;
          created.push(await createLead(clinicId, { ...plan.input, eventId }));
        }
      } catch (error) {
        for (const lead of created)
          repositoryContext.leads.splice(
            repositoryContext.leads.indexOf(lead),
            1,
          );
        throw error;
      }
      // Cliente já cadastrado: o participante entra ligado a ele, como um lead convertido.
      const timestamp = now();
      let index = 0;
      for (const plan of plans) {
        if (plan.kind === "skip") continue;
        const lead = created[index++]!;
        if (plan.kind !== "link") continue;
        lead.convertedPatientId = plan.patientId;
        lead.stage = "won";
        repositoryContext.leadConvertedAt.set(lead.id, lead.createdAt);
        const patient = repositoryContext.patients.find(
          (item) => item.clinicId === clinicId && item.id === plan.patientId,
        );
        if (patient && plan.input.extraFields) {
          patient.extraFields = mergeExtraFields(
            patient.extraFields,
            plan.input.extraFields,
          );
          patient.updatedAt = timestamp;
        }
      }
      return countEventParticipantPlans(plans);
    },

    async listContactImportCandidates(clinicId: string) {
      return {
        patients: repositoryContext.patients.filter(
          (patient) =>
            patient.clinicId === clinicId &&
            !patient.mergedIntoPatientId &&
            !repositoryContext.isTrashed("patients", patient.id),
        ),
        leads: repositoryContext.leads.filter(
          (lead) =>
            lead.clinicId === clinicId &&
            !lead.convertedPatientId &&
            !repositoryContext.isTrashed("leads", lead.id),
        ),
      };
    },

    async importLeads(
      clinicId: string,
      stage: string,
      inputs: (LeadInput & { extraFields?: ExtraFields })[],
    ) {
      assertLeadImportStage(await repository.listLeadStages(clinicId), stage);
      const created: Lead[] = [];
      try {
        for (const input of inputs)
          created.push(await createLead(clinicId, input, stage));
      } catch (error) {
        for (const lead of created)
          repositoryContext.leads.splice(
            repositoryContext.leads.indexOf(lead),
            1,
          );
        throw error;
      }
      return { created: created.length };
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
      // O vínculo com o evento é do cadastro; a edição não troca.
      const changes: LeadInput = { ...input };
      delete changes.eventId;
      Object.assign(lead, changes, { updatedAt: now() });
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
      if (
        !(await repository.listLeadStages(clinicId)).some(
          (item) => item.stage === stage,
        )
      )
        throw stageNotFoundError();
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
      input?: LeadConversionInput,
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
      const source = withConversionInput(lead, input);
      let patient = repositoryContext.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          (item.phone === source.phone ||
            Boolean(
              source.email &&
              item.email?.toLocaleLowerCase() ===
                source.email.toLocaleLowerCase(),
            ) ||
            Boolean(source.cpf && item.cpf === source.cpf)),
      );
      if (patient?.mergedIntoPatientId)
        patient = repositoryContext.patients.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === patient!.mergedIntoPatientId,
        );
      const reusedExisting = Boolean(patient);
      const data = leadConversionData(source, patient);
      for (const tag of data.tags)
        repositoryContext.ensurePatientTag(clinicId, tag);
      if (patient) {
        // Entrega 10: o "Outros" do lead é mesclado com o do cliente, sem apagar nada.
        const extraFields = mergeExtraFields(
          patient.extraFields,
          data.extraFields,
        );
        Object.assign(patient, data, { updatedAt: now() });
        if (extraFields) patient.extraFields = extraFields;
      } else
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
      // Campanhas que o lead recebeu passam ao cliente (a promoção vale ao agendar).
      for (const campaign of repositoryContext.whatsappCampaigns) {
        if (campaign.clinicId !== clinicId) continue;
        const own = campaign.recipients.some(
          (item) => item.patientId === patient.id,
        );
        for (const recipient of campaign.recipients)
          if (recipient.leadId === lead.id && !recipient.patientId && !own)
            recipient.patientId = patient.id;
      }
      for (const delivery of repositoryContext.autoCampaignDeliveries)
        if (
          delivery.clinicId === clinicId &&
          delivery.leadId === lead.id &&
          !delivery.patientId
        )
          delivery.patientId = patient.id;
      lead.convertedPatientId = patient.id;
      lead.stage = "won";
      delete lead.lostReason;
      lead.updatedAt = now();
      repositoryContext.leadConvertedAt.set(lead.id, lead.updatedAt);
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
        reached: input.reached ?? true,
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

    async listLeadStagePage(
      clinicId: string,
      stage: LeadStage,
      filter: LeadFilter,
      page: LeadPage,
      timezone?: string,
    ): Promise<LeadStagePage> {
      const leads = (await filteredLeads(clinicId, filter, timezone)).filter(
        (lead) => lead.stage === stage,
      );
      return {
        stage,
        total: leads.length,
        overdue: leads.filter((lead) => lead.overdueTasks > 0).length,
        leads: leads.slice(page.offset, page.offset + page.limit),
      };
    },

    async summarizeLeads(
      clinicId: string,
      filter: LeadFilter,
      timezone?: string,
    ) {
      return buildLeadInsights(await filteredLeads(clinicId, filter, timezone));
    },

    async listLeadFilterOptions(clinicId: string) {
      return buildLeadFilterOptions(await repository.listLeads(clinicId));
    },

    async listLeadStages(clinicId: string) {
      return resolveLeadStages(
        repositoryContext.leadStages.get(clinicId) ?? [],
      );
    },

    async saveLeadStages(clinicId: string, input: LeadStagesInput) {
      const plan = planLeadStages(
        await repository.listLeadStages(clinicId),
        input,
      );
      // Etapas valem para a rede: conta os leads de todas as filiais.
      for (const item of plan.mustBeEmpty) {
        const leads = repositoryContext.leads.filter(
          (lead) => lead.clinicId === clinicId && lead.stage === item.stage,
        ).length;
        if (leads) throw stageNotEmptyError(item, leads);
      }
      repositoryContext.leadStages.set(clinicId, plan.stages);
      return repository.listLeadStages(clinicId);
    },
  };
  return repository;
}
