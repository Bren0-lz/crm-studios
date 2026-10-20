import {
  formatSequenceNumber,
  type GuidedPatientInput,
  overduePatientIds,
  parseSequenceNumber,
  type GuidedPatientResult,
  type Patient,
  type PatientInput,
  type PatientTagInput,
  patientTagKey,
  type PatientTagUpdate,
} from "@crm/contracts";
import { buildPatientTimeline } from "../../modules/patients/patient-timeline.js";
import {
  DomainError,
  patientTagDuplicateError,
  patientTagInUseError,
} from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { CLINIC_ID, now, uuid } from "./helpers.js";

export function createPatientsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async listPatients(clinicId: string, search = "") {
      // Sem diferenciar maiúsculas nem acentos: "andre" acha "André".
      const fold = (value: string) =>
        value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
      const normalized = fold(search.trim());
      const phoneDigits = /^[\d\s()+-]+$/.test(normalized)
        ? normalized.replace(/\D/g, "")
        : "";
      const cpfDigits = /^[\d\s.-]+$/.test(normalized)
        ? normalized.replace(/\D/g, "")
        : "";
      return repositoryContext.patients
        .filter(
          (item) => item.clinicId === clinicId && !item.mergedIntoPatientId,
        )
        .filter((item) =>
          normalized
            ? [
                item.fullName,
                item.cpf,
                item.email,
                item.phone,
                item.recordNumber,
              ]
                .filter(Boolean)
                .some((value) => fold(value!).includes(normalized)) ||
              Boolean(
                cpfDigits && item.cpf?.replace(/\D/g, "").includes(cpfDigits),
              ) ||
              Boolean(
                phoneDigits &&
                (item.phone.includes(phoneDigits) ||
                  item.whatsapp?.includes(phoneDigits)),
              )
            : true,
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
    },

    async createPatient(clinicId: string, input: PatientInput) {
      const duplicatedCpf = input.cpf
        ? repositoryContext.patients.some(
            (item) => item.clinicId === clinicId && item.cpf === input.cpf,
          )
        : false;
      if (duplicatedCpf)
        throw new DomainError(
          "PATIENT_DUPLICATE",
          "Já existe um cliente com este CPF.",
          409,
        );

      const timestamp = now();
      const patient: Patient = {
        ...input,
        id: uuid(),
        clinicId,
        // Próximo da sequência da clínica (QM15).
        recordNumber: formatSequenceNumber(
          "PAC",
          Math.max(
            0,
            ...repositoryContext.patients
              .filter((item) => item.clinicId === clinicId)
              .map((item) => parseSequenceNumber("PAC", item.recordNumber) ?? 0),
          ) + 1,
        ),
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.patients.push(patient);
      return patient;
    },

    async createPatientWithNextStep(
      clinicId: string,
      actorUserId: string,
      input: GuidedPatientInput,
    ): Promise<GuidedPatientResult> {
      // Tudo ou nada: se um passo falhar, desfaz o que os anteriores gravaram.
      const collections: unknown[][] = [
        repositoryContext.patients,
        repositoryContext.appointments,
        repositoryContext.patientPlans,
        repositoryContext.receivables,
        repositoryContext.sessionMovements,
        repositoryContext.groupEnrollments,
        repositoryContext.adminAuditEvents,
      ];
      const lengths = collections.map((collection) => collection.length);
      try {
        if (input.next === "plan" && input.groupId) {
          const group = repositoryContext.groupClasses.find(
            (item) =>
              item.clinicId === clinicId &&
              item.id === input.groupId &&
              item.active,
          );
          if (!group)
            throw new DomainError(
              "GROUP_OR_PATIENT_NOT_FOUND",
              "Turma ou cliente ativo não encontrado.",
              404,
            );
          if (
            !input.plan.services.some(
              (item) => item.serviceId === group.serviceId,
            )
          )
            throw new DomainError(
              "GROUP_SERVICE_MISMATCH",
              "A turma escolhida não é do serviço do plano.",
              400,
            );
        }
        const patient = await repositoryContext.operations.createPatient(
          clinicId,
          input.patient,
        );
        if (input.next === "demonstration")
          return {
            patient,
            appointment: await repositoryContext.operations.createAppointment(
              clinicId,
              {
                ...input.appointment,
                patientId: patient.id,
                visitType: "trial",
              },
            ),
          };
        if (input.next === "none") return { patient };
        const plan = await repositoryContext.operations.createPatientPlan(
          clinicId,
          actorUserId,
          {
            ...input.plan,
            patientId: patient.id,
            kind: input.next === "plan" ? input.plan.kind : "single",
          },
        );
        if (input.next === "plan" && input.groupId)
          return {
            patient,
            plan,
            enrollment:
              await repositoryContext.operations.createGroupEnrollment(
                clinicId,
                {
                  groupId: input.groupId,
                  patientId: patient.id,
                },
              ),
          };
        return { patient, plan };
      } catch (error) {
        collections.forEach((collection, index) => {
          collection.length = lengths[index]!;
        });
        throw error;
      }
    },

    async importPatients(clinicId: string, inputs: PatientInput[]) {
      const digits = (value: string | undefined) =>
        (value ?? "").replace(/\D/g, "");
      const cpfs = new Set<string>();
      const phones = new Set<string>();
      for (const item of repositoryContext.patients) {
        if (item.clinicId !== clinicId) continue;
        if (digits(item.cpf)) cpfs.add(digits(item.cpf));
        phones.add(digits(item.phone));
      }
      // Decide tudo antes de gravar: a importação é tudo ou nada.
      const accepted: PatientInput[] = [];
      let skipped = 0;
      for (const input of inputs) {
        const cpf = digits(input.cpf);
        const phone = digits(input.phone);
        if ((cpf && cpfs.has(cpf)) || phones.has(phone)) {
          skipped += 1;
          continue;
        }
        if (cpf) cpfs.add(cpf);
        phones.add(phone);
        accepted.push(input);
      }
      for (const input of accepted)
        await repositoryContext.operations.createPatient(clinicId, input);
      return { created: accepted.length, skipped };
    },

    async updatePatient(
      clinicId: string,
      patientId: string,
      input: PatientInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === patientId,
      );
      if (!patient) return null;
      if (
        input.cpf &&
        repositoryContext.patients.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== patientId &&
            item.cpf === input.cpf,
        )
      )
        throw new DomainError(
          "PATIENT_DUPLICATE",
          "Já existe um cliente com este CPF.",
          409,
        );
      Object.assign(patient, input, { updatedAt: now() });
      for (const collection of [
        repositoryContext.appointments,
        repositoryContext.clinicalRecords,
        repositoryContext.patientPlans,
        repositoryContext.receivables,
        repositoryContext.groupEnrollments,
        repositoryContext.groupAttendance,
        repositoryContext.replacementCredits,
        repositoryContext.patientTabs,
      ]) {
        for (const item of collection)
          if (item.patientId === patientId) item.patientName = patient.fullName;
      }
      return patient;
    },

    async listPatientTags(clinicId: string) {
      return repositoryContext.patientTags
        .filter((tag) => tag.clinicId === clinicId)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((tag) => repositoryContext.withPatientCount(tag));
    },

    async listOverduePatientIds(clinicId: string, today: string) {
      return overduePatientIds(
        repositoryContext.receivables.filter(
          (item) => item.clinicId === clinicId,
        ),
        today,
      );
    },

    async createPatientTag(
      clinicId: string,
      actorUserId: string,
      input: PatientTagInput,
    ) {
      const key = patientTagKey(input.name);
      if (
        repositoryContext.patientTags.some(
          (tag) => tag.clinicId === clinicId && patientTagKey(tag.name) === key,
        )
      )
        throw patientTagDuplicateError(input.name);
      const timestamp = now();
      const tag = {
        id: uuid(),
        clinicId,
        name: input.name,
        color: input.color,
        ...(input.category ? { category: input.category } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.patientTags.push(tag);
      if (clinicId === CLINIC_ID)
        repositoryContext.addAdminAudit(
          actorUserId,
          "patient_tag.created",
          "patient_tag",
          tag.id,
          {
            name: tag.name,
            color: tag.color,
          },
          clinicId,
        );
      return repositoryContext.withPatientCount(tag);
    },

    async updatePatientTag(
      clinicId: string,
      actorUserId: string,
      tagId: string,
      input: PatientTagUpdate,
    ) {
      const tag = repositoryContext.patientTags.find(
        (item) => item.clinicId === clinicId && item.id === tagId,
      );
      if (!tag) return null;
      const previousName = tag.name;
      const name = input.name ?? tag.name;
      if (
        input.name !== undefined &&
        repositoryContext.patientTags.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== tagId &&
            patientTagKey(item.name) === patientTagKey(name),
        )
      )
        throw patientTagDuplicateError(name);
      let patientsUpdated = 0;
      if (name !== previousName) {
        for (const patient of repositoryContext.patients) {
          if (
            patient.clinicId !== clinicId ||
            !patient.tags.includes(previousName)
          )
            continue;
          patient.tags = patient.tags.map((item) =>
            item === previousName ? name : item,
          );
          patientsUpdated += 1;
        }
      }
      Object.assign(tag, {
        name,
        color: input.color ?? tag.color,
        updatedAt: now(),
      });
      if (input.category === null) delete tag.category;
      else if (input.category) tag.category = input.category;
      if (clinicId === CLINIC_ID)
        repositoryContext.addAdminAudit(
          actorUserId,
          "patient_tag.updated",
          "patient_tag",
          tag.id,
          {
            name: tag.name,
            color: tag.color,
            ...(name !== previousName ? { previousName, patientsUpdated } : {}),
          },
          clinicId,
        );
      return repositoryContext.withPatientCount(tag);
    },

    async deletePatientTag(
      clinicId: string,
      actorUserId: string,
      tagId: string,
    ) {
      const index = repositoryContext.patientTags.findIndex(
        (item) => item.clinicId === clinicId && item.id === tagId,
      );
      const tag = repositoryContext.patientTags[index];
      if (!tag) return false;
      const { patientCount } = repositoryContext.withPatientCount(tag);
      if (patientCount > 0) throw patientTagInUseError(tag.name, patientCount);
      repositoryContext.patientTags.splice(index, 1);
      if (clinicId === CLINIC_ID)
        repositoryContext.addAdminAudit(
          actorUserId,
          "patient_tag.deleted",
          "patient_tag",
          tag.id,
          {
            name: tag.name,
          },
          clinicId,
        );
      return true;
    },

    async getPatientTimeline(clinicId: string, patientId: string) {
      if (
        !repositoryContext.patients.some(
          (item) => item.clinicId === clinicId && item.id === patientId,
        )
      )
        return null;
      return buildPatientTimeline(patientId, {
        appointments: repositoryContext.appointments.filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        ),
        plans: await repositoryContext.operations.listPatientPlans(
          clinicId,
          patientId,
        ),
        payments: repositoryContext
          .receivedPayments(clinicId)
          .filter((item) => item.patientId === patientId),
        contacts: await repositoryContext.operations.listContactActivities(
          clinicId,
          patientId,
        ),
        messages: repositoryContext.outboundMessages
          .filter(
            (item) =>
              item.clinicId === clinicId && item.patientId === patientId,
          )
          .map((message) => repositoryContext.toOutboundMessage(message)),
        surveys: await repositoryContext.operations.listSatisfactionSurveys(
          clinicId,
          { patientId },
        ),
      });
    },
  };
}
