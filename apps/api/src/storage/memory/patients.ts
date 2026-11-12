import {
  auditChangesOf,
  formatSequenceNumber,
  type GuidedPatientInput,
  overduePatientIds,
  mergeExtraFields,
  parseSequenceNumber,
  type GuidedPatientResult,
  type Patient,
  type PatientImportInput,
  type PatientUpdateInput,
  type PatientTagInput,
  patientTagKey,
  type PatientTagUpdate,
  type WaitlistEntry,
  waitlistDesiredGroupNote,
} from "@crm/contracts";
import {
  guidedPlansResult,
  guidedSales,
  guidedSubscriptions,
  guidedWaitlist,
} from "../../modules/patients/guided-plans.js";
import {
  assertPlanEnrollmentSeat,
  validatePurchaseSchedule,
} from "../../modules/plans/purchase.js";
import { bookPlanAppointments, issuePlanDocument } from "./plan-purchases.js";
import {
  buildPatientTimeline,
  patientEditAction,
} from "../../modules/patients/patient-timeline.js";
import {
  DomainError,
  patientTagDuplicateError,
  patientTagInUseError,
} from "../../repository.js";
import {
  leadPatientExistsError,
  withLeadConversionExtras,
} from "../../modules/commercial/conversion.js";
import { convertibleLead, convertLeadToNewPatient } from "./commercial.js";
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
          (item) =>
            item.clinicId === clinicId &&
            !item.mergedIntoPatientId &&
            !repositoryContext.isTrashed("patients", item.id),
        )
        .filter((item) =>
          normalized
            ? [
                item.fullName,
                item.nickname,
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

    async createPatient(clinicId: string, input: PatientImportInput) {
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
              .map(
                (item) => parseSequenceNumber("PAC", item.recordNumber) ?? 0,
              ),
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
        repositoryContext.waitlistEntries,
        repositoryContext.issuedDocuments,
        repositoryContext.adminAuditEvents,
        repositoryContext.patientTags,
      ];
      const lengths = collections.map((collection) => collection.length);
      try {
        // LC1: cadastro vindo da conversão do lead (o lead só muda no fim, com tudo gravado).
        const lead = input.leadId
          ? convertibleLead(repositoryContext, clinicId, input.leadId)
          : undefined;
        const sameCpf =
          lead && input.patient.cpf
            ? repositoryContext.patients.find(
                (item) =>
                  item.clinicId === clinicId && item.cpf === input.patient.cpf,
              )
            : undefined;
        if (sameCpf) throw leadPatientExistsError(sameCpf.fullName);
        const patientData = lead
          ? withLeadConversionExtras(input.patient, lead)
          : input.patient;
        if (lead)
          for (const tag of patientData.tags)
            repositoryContext.ensurePatientTag(clinicId, tag);
        const subscriptions = guidedSubscriptions(input);
        // Sessões do avulso: serviços e vigência do plano, no máximo as sessões compradas.
        for (const sale of guidedSales(input))
          validatePurchaseSchedule(
            sale,
            repositoryContext.clinicSettings.timezone,
          );
        for (const item of subscriptions) {
          if (!item.groupId) continue;
          const group = repositoryContext.groupClasses.find(
            (entry) =>
              entry.clinicId === clinicId &&
              entry.id === item.groupId &&
              entry.active,
          );
          if (!group)
            throw new DomainError(
              "GROUP_OR_PATIENT_NOT_FOUND",
              "Turma ou cliente ativo não encontrado.",
              404,
            );
          if (
            !item.plan.services.some(
              (entry) => entry.serviceId === group.serviceId,
            )
          )
            throw new DomainError(
              "GROUP_SERVICE_MISMATCH",
              "A turma escolhida não é do serviço do plano.",
              400,
            );
        }
        // Turma cheia (TW3): a turma desejada fica nas observações da Lista de espera.
        const waitlist = guidedWaitlist(input).map((item) => {
          if (!item.groupId) return { serviceId: item.serviceId, notes: "" };
          const group = repositoryContext.groupClasses.find(
            (entry) =>
              entry.clinicId === clinicId &&
              entry.id === item.groupId &&
              entry.serviceId === item.serviceId,
          );
          if (!group)
            throw new DomainError(
              "GROUP_SERVICE_MISMATCH",
              "A turma escolhida não é do serviço da lista de espera.",
              400,
            );
          return {
            serviceId: item.serviceId,
            notes: waitlistDesiredGroupNote(group.name),
          };
        });
        const patient = await repositoryContext.operations.createPatient(
          clinicId,
          patientData,
        );
        /** Último passo: com tudo gravado, o lead (se houver) vira cliente. */
        const finish = (result: GuidedPatientResult): GuidedPatientResult =>
          lead
            ? {
                ...result,
                lead: convertLeadToNewPatient(
                  repositoryContext,
                  clinicId,
                  lead.id,
                  patient,
                ),
              }
            : result;
        const createWaitlist = async () => {
          const entries: WaitlistEntry[] = [];
          for (const item of waitlist)
            entries.push(
              await repositoryContext.operations.createWaitlistEntry(
                clinicId,
                actorUserId,
                {
                  ...item,
                  patientId: patient.id,
                  kind: "service",
                  productId: null,
                },
              ),
            );
          return entries;
        };
        if (input.next === "waitlist")
          return finish({ patient, waitlistEntries: await createWaitlist() });
        if (input.next === "demonstration")
          return finish({
            patient,
            appointment: await repositoryContext.operations.createAppointment(
              clinicId,
              {
                ...input.appointment,
                patientId: patient.id,
                visitType: "trial",
              },
            ),
          });
        if (input.next === "none") return finish({ patient });
        const created: NonNullable<GuidedPatientResult["additionalPlans"]> = [];
        for (const item of guidedSales(input)) {
          const plan = await repositoryContext.operations.createPatientPlan(
            clinicId,
            actorUserId,
            { ...item.plan, patientId: patient.id },
          );
          const enrollment = item.groupId
            ? await repositoryContext.operations.createGroupEnrollment(
                clinicId,
                { groupId: item.groupId, patientId: patient.id },
              )
            : undefined;
          assertPlanEnrollmentSeat(enrollment);
          const appointments = await bookPlanAppointments(
            repositoryContext,
            clinicId,
            plan,
            item.appointments,
          );
          const document = item.document
            ? await issuePlanDocument(
                repositoryContext,
                clinicId,
                actorUserId,
                plan,
                item.document,
              )
            : undefined;
          created.push({
            plan,
            ...(enrollment ? { enrollment } : {}),
            ...(appointments.length ? { appointments } : {}),
            ...(document ? { document } : {}),
          });
        }
        if (input.next === "single") return finish({ patient, ...created[0]! });
        return finish(
          guidedPlansResult(patient, created, input, await createWaitlist()),
        );
      } catch (error) {
        collections.forEach((collection, index) => {
          collection.length = lengths[index]!;
        });
        throw error;
      }
    },

    async importPatients(clinicId: string, inputs: PatientImportInput[]) {
      const digits = (value: string | undefined) =>
        (value ?? "").replace(/\D/g, "");
      const cpfs = new Map<string, Patient>();
      const phones = new Map<string, Patient>();
      const canonical = (patient: Patient) =>
        (patient.mergedIntoPatientId &&
          repositoryContext.patients.find(
            (item) => item.id === patient.mergedIntoPatientId,
          )) ||
        patient;
      for (const item of repositoryContext.patients) {
        if (item.clinicId !== clinicId) continue;
        if (digits(item.cpf) && !cpfs.has(digits(item.cpf)))
          cpfs.set(digits(item.cpf), canonical(item));
        if (!phones.has(digits(item.phone)))
          phones.set(digits(item.phone), canonical(item));
      }
      // Decide tudo antes de gravar: a importação é tudo ou nada.
      const accepted: PatientImportInput[] = [];
      const merges: [Patient, PatientImportInput["extraFields"]][] = [];
      const acceptedKeys = new Set<string>();
      let skipped = 0;
      for (const input of inputs) {
        const cpf = digits(input.cpf);
        const phone = digits(input.phone);
        const existing = (cpf && cpfs.get(cpf)) || phones.get(phone);
        if (existing) {
          // Entrega 10: o cliente já cadastrado recebe o "Outros" da linha (mescla sem apagar).
          if (input.extraFields) merges.push([existing, input.extraFields]);
          else skipped += 1;
          continue;
        }
        if (
          (cpf && acceptedKeys.has(`cpf:${cpf}`)) ||
          acceptedKeys.has(phone)
        ) {
          skipped += 1;
          continue;
        }
        if (cpf) acceptedKeys.add(`cpf:${cpf}`);
        acceptedKeys.add(phone);
        accepted.push(input);
      }
      const timestamp = now();
      for (const [patient, extraFields] of merges) {
        patient.extraFields = mergeExtraFields(
          patient.extraFields,
          extraFields,
        );
        patient.updatedAt = timestamp;
      }
      // CD3: a marca da importação libera as etiquetas "Cadastro incompleto" e "Sem e-mail".
      const importedAt = timestamp;
      for (const { invalidCpf, ...input } of accepted) {
        const patient = await repositoryContext.operations.createPatient(
          clinicId,
          input,
        );
        const stored = repositoryContext.patients.find(
          (item) => item.id === patient.id,
        );
        if (stored) {
          stored.importedAt = importedAt;
          // CPF errado da planilha: o cliente fica com "CPF inválido" até ter um CPF.
          if (invalidCpf) stored.importedInvalidCpf = invalidCpf;
        }
      }
      return { created: accepted.length, skipped, updated: merges.length };
    },

    async updatePatient(
      clinicId: string,
      patientId: string,
      input: PatientUpdateInput,
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
      if (!input.cpf) delete patient.cpf;
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
          (item) =>
            item.clinicId === clinicId &&
            item.patientId === patientId &&
            !repositoryContext.isTrashed("appointments", item.id),
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
        edits: repositoryContext.adminAuditEvents
          .filter(
            (event) =>
              event.clinicId === clinicId &&
              event.action === patientEditAction &&
              event.entityId === patientId,
          )
          .map((event) => ({
            id: event.id,
            occurredAt: event.createdAt,
            actorName: event.actorName,
            changes: auditChangesOf(event.metadata),
            reason:
              typeof event.metadata.reason === "string"
                ? event.metadata.reason
                : undefined,
          })),
        receipts: repositoryContext.receiptSignatures
          .filter(
            (item) =>
              item.clinicId === clinicId && item.patientId === patientId,
          )
          .map((item) => ({
            ...item,
            description:
              repositoryContext.receivables.find(
                (receivable) => receivable.id === item.receivableId,
              )?.description ?? "",
          })),
      });
    },
  };
}
