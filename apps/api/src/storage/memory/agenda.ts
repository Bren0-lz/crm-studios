import {
  isAppointmentPendingFinalization,
  type Appointment,
  type AppointmentInput,
  type AppointmentRescheduleEvent,
  type AppointmentRescheduleInput,
  type AppointmentStatus,
  type AppointmentUpdateInput,
  type GroupAttendance,
  type GroupAttendanceInput,
  type GroupClass,
  type GroupClassInput,
  groupClassName,
  type GroupClassUpdateInput,
  type GroupEnrollment,
  type GroupEnrollmentInput,
  type GroupWorkspace,
  type Holiday,
  type HolidayInput,
  type LeadAppointmentInput,
  type RecurringAppointmentInput,
  type ReplacementBookingInput,
  type ScheduleBlock,
  type ScheduleBlockInput,
  recurringOccurrenceStarts,
} from "@crm/contracts";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  clampGroupSessionUntil,
  groupSessionHorizon,
  zonedTimeToUtc,
} from "../../modules/groups/group-schedule.js";
import { assertAppointmentStarted } from "../../modules/agenda/appointment-start.js";
import {
  DomainError,
  type AppointmentCreateOptions,
  type AutoCampaignRedemptionWrite,
} from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, today, uuid } from "./helpers.js";

export function createAgendaRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  const clinicDate = (value: string) =>
    clinicDateOf(value, repositoryContext.clinicSettings.timezone);
  /** Sai da lista de espera: começa hoje, salvo se o início escolhido for posterior. */
  const promote = (enrollment: GroupEnrollment) => {
    const timestamp = now();
    enrollment.status = "active";
    delete enrollment.queuePosition;
    enrollment.updatedAt = timestamp;
    if (Date.parse(enrollment.enrolledAt) < Date.parse(timestamp)) {
      enrollment.enrolledAt = timestamp;
      enrollment.startsOn = clinicDate(timestamp);
    }
  };
  const recordRedemption = (
    clinicId: string,
    patientId: string,
    appointmentId: string,
    promotion: AutoCampaignRedemptionWrite,
  ) =>
    repositoryContext.autoCampaignRedemptions.push({
      id: uuid(),
      clinicId,
      ...(promotion.source === "manual" ? { source: "manual" as const } : {}),
      campaignId: promotion.campaignId,
      patientId,
      occurrenceKey: promotion.occurrenceKey,
      appointmentId,
      redeemedOn: promotion.redeemedOn,
      ...(promotion.blockedUntil
        ? { blockedUntil: promotion.blockedUntil }
        : {}),
    });
  return {
    async listHolidays(clinicId: string, from?: string, to?: string) {
      return (repositoryContext.holidays.get(clinicId) ?? [])
        .filter(
          (item) => (!from || item.date >= from) && (!to || item.date <= to),
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => ({ ...item }));
    },

    async createHoliday(clinicId: string, input: HolidayInput) {
      const holidays = repositoryContext.holidays.get(clinicId) ?? [];
      if (holidays.some((item) => item.date === input.date))
        throw new DomainError(
          "HOLIDAY_DUPLICATE",
          "Já existe um feriado nesta data.",
          409,
        );
      const holiday: Holiday = {
        ...input,
        id: uuid(),
        clinicId,
        createdAt: now(),
      };
      repositoryContext.holidays.set(clinicId, [...holidays, holiday]);
      return { ...holiday };
    },

    async deleteHoliday(clinicId: string, holidayId: string) {
      const holidays = repositoryContext.holidays.get(clinicId) ?? [];
      const remaining = holidays.filter((item) => item.id !== holidayId);
      if (remaining.length === holidays.length) return false;
      repositoryContext.holidays.set(clinicId, remaining);
      return true;
    },

    async listSubscriberIdsWithoutGroup(clinicId: string) {
      const currentDate = today();
      const activeGroups = new Map(
        repositoryContext.groupClasses
          .filter((group) => group.clinicId === clinicId && group.active)
          .map((group) => [group.id, group]),
      );
      const ids = new Set<string>();
      for (const plan of repositoryContext.patientPlans) {
        if (
          plan.clinicId !== clinicId ||
          plan.status !== "active" ||
          plan.kind === "single" ||
          (plan.validUntil && plan.validUntil < currentDate)
        )
          continue;
        const enrolled = repositoryContext.groupEnrollments.some(
          (enrollment) =>
            enrollment.clinicId === clinicId &&
            enrollment.patientId === plan.patientId &&
            enrollment.status === "active" &&
            plan.services.some(
              (item) =>
                item.serviceId ===
                activeGroups.get(enrollment.groupId)?.serviceId,
            ),
        );
        if (!enrolled) ids.add(plan.patientId);
      }
      return [...ids];
    },

    async listAppointments(clinicId: string, from: string, to: string) {
      return repositoryContext.appointments
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext.inBranchScope(item) &&
            item.startsAt < to &&
            item.endsAt > from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async listPendingFinalizationAppointments(clinicId: string, now: string) {
      const instant = new Date(now);
      return repositoryContext.appointments
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext.inBranchScope(item) &&
            isAppointmentPendingFinalization(item, instant),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async autoFinalizeAppointments(
      clinicId: string,
      cutoff: string,
      at: string,
    ) {
      const limit = Date.parse(cutoff);
      // Todas as filiais da clínica, independente do escopo da requisição.
      const due = repositoryContext.appointments.filter(
        (item) =>
          item.clinicId === clinicId &&
          (item.status === "scheduled" || item.status === "confirmed") &&
          Date.parse(item.endsAt) <= limit,
      );
      let finalized = 0;
      for (const appointment of due) {
        try {
          repositoryContext.consumeSession(appointment);
        } catch {
          // Sem saldo ou crédito preso a comanda: fica pendente para a equipe resolver.
          continue;
        }
        appointment.status = "completed";
        appointment.autoCompletedAt = at;
        appointment.updatedAt = at;
        finalized += 1;
      }
      return finalized;
    },

    async createAppointment(
      clinicId: string,
      input: AppointmentInput,
      options?: AppointmentCreateOptions,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.id === input.patientId && item.clinicId === clinicId,
      );
      if (!patient)
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Cliente, profissional, sala ou serviço não encontrado.",
          404,
        );
      const appointment = await repositoryContext.insertAppointment(
        clinicId,
        input,
        { patientId: patient.id, patientName: patient.fullName },
      );
      if (options?.promotion)
        recordRedemption(
          clinicId,
          patient.id,
          appointment.id,
          options.promotion,
        );
      return appointment;
    },

    async createLeadAppointment(
      clinicId: string,
      leadId: string,
      input: LeadAppointmentInput,
    ) {
      const lead = repositoryContext.leads.find(
        (item) => item.clinicId === clinicId && item.id === leadId,
      );
      if (!lead) return null;
      if (lead.convertedPatientId)
        throw new DomainError(
          "LEAD_ALREADY_CONVERTED",
          "Este lead já foi convertido em cliente. Agende pelo cliente.",
          409,
        );
      return repositoryContext.insertAppointment(clinicId, input, {
        leadId: lead.id,
        leadName: lead.fullName,
        patientName: lead.fullName,
      });
    },

    async rescheduleAppointment(
      clinicId: string,
      actorUserId: string,
      appointmentId: string,
      input: AppointmentRescheduleInput,
    ) {
      const appointment = repositoryContext.appointments.find(
        (item) => item.clinicId === clinicId && item.id === appointmentId,
      );
      if (!appointment) return null;
      if (!["scheduled", "confirmed"].includes(appointment.status))
        throw new DomainError(
          "APPOINTMENT_RESCHEDULE_FORBIDDEN",
          "Somente atendimentos agendados ou confirmados podem ser reagendados.",
          409,
        );
      const professional = repositoryContext.professionals.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.professionalId &&
          item.active,
      );
      const room = repositoryContext.rooms.find(
        (item) =>
          item.clinicId === clinicId && item.id === input.roomId && item.active,
      );
      const service = repositoryContext.services.find(
        (item) =>
          item.clinicId === clinicId && item.id === appointment.serviceId,
      );
      if (!professional || !room || !service)
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Profissional, sala ou serviço não encontrado.",
          404,
        );
      repositoryContext.resourceBranch(appointment, professional, room);
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(
        startsAt.getTime() + service.durationMinutes * 60_000,
      );
      if (
        appointment.startsAt === startsAt.toISOString() &&
        appointment.professionalId === professional.id &&
        appointment.roomId === room.id
      )
        return appointment;
      const overlaps = (from: string, to: string) =>
        new Date(from) < endsAt && new Date(to) > startsAt;
      const appointmentConflict = repositoryContext.appointments.some(
        (item) =>
          item.clinicId === clinicId &&
          item.id !== appointmentId &&
          item.status !== "cancelled" &&
          (item.professionalId === professional.id ||
            item.roomId === room.id) &&
          overlaps(item.startsAt, item.endsAt),
      );
      const blockConflict = repositoryContext.scheduleBlocks.some(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "active" &&
          (item.professionalId === professional.id ||
            item.roomId === room.id) &&
          overlaps(item.startsAt, item.endsAt),
      );
      const groupConflict =
        repositoryContext.groupSessions.some((session) => {
          const group = repositoryContext.groupClasses.find(
            (item) => item.id === session.groupId,
          );
          return (
            session.clinicId === clinicId &&
            session.status !== "cancelled" &&
            Boolean(group) &&
            (group!.professionalId === professional.id ||
              group!.roomId === room.id) &&
            overlaps(session.startsAt, session.endsAt)
          );
        }) ||
        repositoryContext.hasWeeklyGroupSlotConflict(
          clinicId,
          professional.id,
          room.id,
          startsAt,
          endsAt,
        );
      if (appointmentConflict || blockConflict || groupConflict)
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
          409,
        );
      const actor = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === actorUserId,
      );
      const event: AppointmentRescheduleEvent = {
        id: uuid(),
        appointmentId,
        previousStartsAt: appointment.startsAt,
        previousEndsAt: appointment.endsAt,
        previousProfessionalId: appointment.professionalId,
        previousProfessionalName: appointment.professionalName,
        previousRoomId: appointment.roomId,
        previousRoomName: appointment.roomName,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        professionalId: professional.id,
        professionalName: professional.fullName,
        roomId: room.id,
        roomName: room.name,
        actorName: actor?.fullName ?? "Usuário",
        createdAt: now(),
      };
      Object.assign(appointment, {
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        professionalId: professional.id,
        professionalName: professional.fullName,
        professionalColor: professional.color,
        roomId: room.id,
        roomName: room.name,
        updatedAt: event.createdAt,
      });
      repositoryContext.appointmentReschedules.push(event);
      return appointment;
    },

    async findAppointmentServiceId(clinicId: string, appointmentId: string) {
      return (
        repositoryContext.appointments.find(
          (item) => item.clinicId === clinicId && item.id === appointmentId,
        )?.serviceId ?? null
      );
    },

    async findAppointment(clinicId: string, appointmentId: string) {
      const appointment = repositoryContext.appointments.find(
        (item) => item.clinicId === clinicId && item.id === appointmentId,
      );
      return appointment ? { ...appointment } : null;
    },

    async updateAppointment(
      clinicId: string,
      actorUserId: string,
      appointmentId: string,
      input: AppointmentUpdateInput,
    ) {
      const appointment = repositoryContext.appointments.find(
        (item) => item.clinicId === clinicId && item.id === appointmentId,
      );
      if (!appointment) return null;
      if (!["scheduled", "confirmed"].includes(appointment.status))
        throw new DomainError(
          "APPOINTMENT_UPDATE_FORBIDDEN",
          "Somente atendimentos agendados ou confirmados podem ser editados.",
          409,
        );
      const room = repositoryContext.rooms.find(
        (item) =>
          item.clinicId === clinicId && item.id === input.roomId && item.active,
      );
      const service = repositoryContext.services.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.serviceId &&
          (item.active || item.id === appointment.serviceId),
      );
      if (!room || !service)
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Sala ou serviço não encontrado.",
          404,
        );
      const serviceChanged = service.id !== appointment.serviceId;
      // Crédito da comanda/plano de origem é do serviço original: trocar quebraria o vínculo.
      if (
        serviceChanged &&
        (repositoryContext.patientTabs.some(
          (tab) =>
            tab.clinicId === clinicId &&
            tab.services?.some((item) => item.appointmentId === appointmentId),
        ) ||
          repositoryContext.patientPlans.some(
            (plan) =>
              plan.clinicId === clinicId &&
              plan.sourceAppointmentId === appointmentId,
          ))
      )
        throw new DomainError(
          "APPOINTMENT_SERVICE_LOCKED",
          "Este atendimento está vinculado a uma comanda ou plano: o serviço não pode ser alterado.",
          409,
        );
      const notes = input.notes ?? "";
      const startsAt = new Date(appointment.startsAt);
      const endsAt = new Date(
        startsAt.getTime() + service.durationMinutes * 60_000,
      );
      if (
        !serviceChanged &&
        appointment.roomId === room.id &&
        (appointment.notes ?? "") === notes
      )
        return { ...appointment };
      const overlaps = (from: string, to: string) =>
        new Date(from) < endsAt && new Date(to) > startsAt;
      const professionalId = appointment.professionalId;
      const appointmentConflict = repositoryContext.appointments.some(
        (item) =>
          item.clinicId === clinicId &&
          item.id !== appointmentId &&
          item.status !== "cancelled" &&
          (item.professionalId === professionalId || item.roomId === room.id) &&
          overlaps(item.startsAt, item.endsAt),
      );
      const blockConflict = repositoryContext.scheduleBlocks.some(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "active" &&
          (item.professionalId === professionalId || item.roomId === room.id) &&
          overlaps(item.startsAt, item.endsAt),
      );
      const groupConflict =
        repositoryContext.groupSessions.some((session) => {
          const group = repositoryContext.groupClasses.find(
            (item) => item.id === session.groupId,
          );
          return (
            session.clinicId === clinicId &&
            session.status !== "cancelled" &&
            Boolean(group) &&
            (group!.professionalId === professionalId ||
              group!.roomId === room.id) &&
            overlaps(session.startsAt, session.endsAt)
          );
        }) ||
        repositoryContext.hasWeeklyGroupSlotConflict(
          clinicId,
          professionalId,
          room.id,
          startsAt,
          endsAt,
        );
      if (appointmentConflict || blockConflict || groupConflict)
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
          409,
        );
      const previous = {
        serviceId: appointment.serviceId,
        serviceName: appointment.serviceName,
        roomId: appointment.roomId,
        roomName: appointment.roomName,
        notes: appointment.notes ?? "",
      };
      Object.assign(appointment, {
        serviceId: service.id,
        serviceName: service.name,
        roomId: room.id,
        roomName: room.name,
        endsAt: endsAt.toISOString(),
        updatedAt: now(),
      });
      if (notes) appointment.notes = notes;
      else delete appointment.notes;
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "appointment.updated",
        "appointment",
        {
          previous,
          current: {
            serviceId: service.id,
            serviceName: service.name,
            roomId: room.id,
            roomName: room.name,
            notes,
          },
        },
        appointmentId,
      );
      return { ...appointment };
    },

    async listAppointmentReschedules(clinicId: string, appointmentId: string) {
      if (
        !repositoryContext.appointments.some(
          (item) => item.clinicId === clinicId && item.id === appointmentId,
        )
      )
        return null;
      return repositoryContext.appointmentReschedules
        .filter((item) => item.appointmentId === appointmentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createRecurringAppointments(
      clinicId: string,
      input: RecurringAppointmentInput,
      options?: AppointmentCreateOptions,
    ) {
      const originalLength = repositoryContext.appointments.length;
      const seriesId = uuid();
      const appointments: Appointment[] = [];
      try {
        for (const startsAt of recurringOccurrenceStarts(input)) {
          const appointment =
            await repositoryContext.operations.createAppointment(clinicId, {
              patientId: input.patientId,
              professionalId: input.professionalId,
              roomId: input.roomId,
              serviceId: input.serviceId,
              startsAt,
              notes: input.notes,
              visitType: input.visitType,
            });
          appointment.seriesId = seriesId;
          appointments.push(appointment);
        }
        if (options?.promotion)
          recordRedemption(
            clinicId,
            input.patientId,
            appointments[0]!.id,
            options.promotion,
          );
        return appointments;
      } catch (error) {
        repositoryContext.appointments.splice(originalLength);
        throw error;
      }
    },

    async listScheduleBlocks(clinicId: string, from: string, to: string) {
      return repositoryContext.scheduleBlocks
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            repositoryContext.inBranchScope(item) &&
            item.status === "active" &&
            item.startsAt < to &&
            item.endsAt > from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async createScheduleBlock(clinicId: string, input: ScheduleBlockInput) {
      const professional = input.professionalId
        ? repositoryContext.professionals.find(
            (item) =>
              item.clinicId === clinicId && item.id === input.professionalId,
          )
        : undefined;
      const room = input.roomId
        ? repositoryContext.rooms.find(
            (item) => item.clinicId === clinicId && item.id === input.roomId,
          )
        : undefined;
      if ((input.professionalId && !professional) || (input.roomId && !room))
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Profissional ou sala não encontrado.",
          404,
        );
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      const appointmentConflict = repositoryContext.appointments.some(
        (item) =>
          item.clinicId === clinicId &&
          item.status !== "cancelled" &&
          (item.professionalId === input.professionalId ||
            item.roomId === input.roomId) &&
          new Date(item.startsAt) < endsAt &&
          new Date(item.endsAt) > startsAt,
      );
      const blockConflict = repositoryContext.scheduleBlocks.some(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "active" &&
          (Boolean(
            input.professionalId &&
            item.professionalId === input.professionalId,
          ) ||
            Boolean(input.roomId && item.roomId === input.roomId)) &&
          new Date(item.startsAt) < endsAt &&
          new Date(item.endsAt) > startsAt,
      );
      const groupConflict = repositoryContext.groupSessions.some((session) => {
        const group = repositoryContext.groupClasses.find(
          (item) => item.id === session.groupId,
        );
        return (
          session.clinicId === clinicId &&
          session.status !== "cancelled" &&
          Boolean(group) &&
          (Boolean(
            input.professionalId &&
            group!.professionalId === input.professionalId,
          ) ||
            Boolean(input.roomId && group!.roomId === input.roomId)) &&
          new Date(session.startsAt) < endsAt &&
          new Date(session.endsAt) > startsAt
        );
      });
      if (appointmentConflict || blockConflict || groupConflict)
        throw new DomainError(
          "SCHEDULE_BLOCK_CONFLICT",
          "O bloqueio conflita com um atendimento ou bloqueio existente.",
          409,
        );
      const branchId = repositoryContext.resourceBranch(
        ...[professional, room].filter((item) => item !== undefined),
      );
      const timestamp = now();
      const block: ScheduleBlock = {
        ...input,
        branchId,
        id: uuid(),
        clinicId,
        ...(professional ? { professionalName: professional.fullName } : {}),
        ...(room ? { roomName: room.name } : {}),
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.scheduleBlocks.push(block);
      return block;
    },

    async cancelScheduleBlock(clinicId: string, blockId: string) {
      const block = repositoryContext.scheduleBlocks.find(
        (item) => item.clinicId === clinicId && item.id === blockId,
      );
      if (!block) return null;
      block.status = "cancelled";
      block.updatedAt = now();
      return block;
    },

    async getGroupWorkspace(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<GroupWorkspace> {
      repositoryContext.ensureGroupSessions(clinicId, groupSessionHorizon(), {
        renewBefore: new Date(groupSessionHorizon().getTime() - 7 * 86_400_000),
      });
      const groups = repositoryContext.groupClasses.filter(
        (item) =>
          item.clinicId === clinicId && repositoryContext.inBranchScope(item),
      );
      const groupIds = new Set(groups.map((group) => group.id));
      const sessionIds = new Set(
        repositoryContext.groupSessions
          .filter((session) => groupIds.has(session.groupId))
          .map((session) => session.id),
      );
      return {
        groups,
        enrollments: repositoryContext.groupEnrollments.filter(
          (item) => item.clinicId === clinicId && groupIds.has(item.groupId),
        ),
        sessions: repositoryContext.groupSessions
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              groupIds.has(item.groupId) &&
              item.startsAt < to &&
              item.endsAt > from,
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        attendance: repositoryContext.groupAttendance.filter(
          (item) =>
            item.clinicId === clinicId &&
            sessionIds.has(item.sessionId) &&
            repositoryContext.groupSessions.some(
              (session) =>
                session.id === item.sessionId &&
                session.startsAt < to &&
                session.endsAt > from,
            ),
        ),
        replacementCredits: repositoryContext.replacementCredits.flatMap(
          (item) => {
            if (item.clinicId !== clinicId) return [];
            const source = repositoryContext.groupSessions.find(
              (session) =>
                session.clinicId === clinicId &&
                sessionIds.has(session.id) &&
                session.id === item.sourceSessionId,
            );
            return source ? [{ ...item, sourceGroupId: source.groupId }] : [];
          },
        ),
      };
    },

    async createGroupClass(clinicId: string, input: GroupClassInput) {
      const service = repositoryContext.services.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.serviceId &&
          item.active,
      );
      const professional = repositoryContext.professionals.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.professionalId &&
          item.active,
      );
      const room = repositoryContext.rooms.find(
        (item) =>
          item.clinicId === clinicId && item.id === input.roomId && item.active,
      );
      if (!service || !professional || !room)
        throw new DomainError(
          "GROUP_RELATED_RECORD_NOT_FOUND",
          "Serviço, profissional ou sala não encontrado.",
          404,
        );
      if (input.capacity > room.capacity)
        throw new DomainError(
          "GROUP_EXCEEDS_ROOM_CAPACITY",
          "A capacidade da turma excede a capacidade da sala.",
          409,
        );
      repositoryContext.assertGroupScheduleAvailable(clinicId, input);
      const branchId = repositoryContext.resourceBranch(professional, room);
      const sequence =
        Math.max(
          0,
          ...repositoryContext.groupClasses
            .filter(
              (item) =>
                item.clinicId === clinicId &&
                item.serviceId === input.serviceId,
            )
            .map((item) => item.sequence),
        ) + 1;
      const group: GroupClass = {
        ...input,
        branchId,
        id: uuid(),
        clinicId,
        name: input.name ?? groupClassName(service.name, sequence),
        sequence,
        serviceName: service.name,
        professionalName: professional.fullName,
        roomName: room.name,
        activeEnrollments: 0,
        waitlistCount: 0,
        active: true,
        createdAt: now(),
      };
      repositoryContext.groupClasses.push(group);
      repositoryContext.ensureGroupSessions(clinicId, groupSessionHorizon(), {
        groupId: group.id,
      });
      return group;
    },

    async renameGroupClass(clinicId: string, groupId: string, name: string) {
      const group = repositoryContext.groupClasses.find(
        (item) => item.clinicId === clinicId && item.id === groupId,
      );
      if (!group) return null;
      repositoryContext.resourceBranch(group);
      group.name = name;
      for (const session of repositoryContext.groupSessions) {
        if (session.clinicId === clinicId && session.groupId === groupId)
          session.groupName = name;
      }
      return group;
    },

    async updateGroupClass(
      clinicId: string,
      groupId: string,
      input: GroupClassUpdateInput,
    ) {
      const group = repositoryContext.groupClasses.find(
        (item) => item.clinicId === clinicId && item.id === groupId,
      );
      if (!group) return null;
      const room = repositoryContext.rooms.find(
        (item) => item.clinicId === clinicId && item.id === group.roomId,
      );
      if (room && input.capacity > room.capacity)
        throw new DomainError(
          "GROUP_EXCEEDS_ROOM_CAPACITY",
          "A capacidade da turma excede a capacidade da sala.",
          409,
        );
      const activeCount = repositoryContext.groupEnrollments.filter(
        (item) => item.groupId === groupId && item.status === "active",
      ).length;
      if (input.capacity < activeCount)
        throw new DomainError(
          "GROUP_BELOW_ENROLLMENTS",
          "A capacidade não pode ser menor que o número de matrículas ativas.",
          409,
        );
      repositoryContext.assertGroupScheduleAvailable(clinicId, {
        ...group,
        weeklySlots: input.weeklySlots,
      });
      group.capacity = input.capacity;
      group.weeklySlots = input.weeklySlots;
      const nowDate = new Date();
      for (
        let index = repositoryContext.groupSessions.length - 1;
        index >= 0;
        index -= 1
      ) {
        const session = repositoryContext.groupSessions[index]!;
        const hasRecords =
          repositoryContext.groupAttendance.some(
            (item) => item.sessionId === session.id,
          ) ||
          repositoryContext.replacementCredits.some(
            (item) =>
              item.sourceSessionId === session.id ||
              item.usedSessionId === session.id,
          );
        if (
          session.groupId === groupId &&
          session.status === "scheduled" &&
          new Date(session.startsAt) > nowDate &&
          !hasRecords
        )
          repositoryContext.groupSessions.splice(index, 1);
      }
      repositoryContext.groupSessionsGeneratedUntil.delete(groupId);
      repositoryContext.ensureGroupSessions(clinicId, groupSessionHorizon(), {
        groupId,
      });
      const waitlist = repositoryContext.groupEnrollments
        .filter(
          (item) => item.groupId === groupId && item.status === "waitlisted",
        )
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
      for (
        let index = 0;
        index < Math.min(input.capacity - activeCount, waitlist.length);
        index += 1
      ) {
        promote(waitlist[index]!);
      }
      waitlist
        .filter((item) => item.status === "waitlisted")
        .forEach((item, index) => {
          item.queuePosition = index + 1;
        });
      repositoryContext.refreshGroupCounts(group);
      return group;
    },

    async createGroupEnrollment(clinicId: string, input: GroupEnrollmentInput) {
      const group = repositoryContext.groupClasses.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.groupId &&
          item.active,
      );
      const patient = repositoryContext.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.patientId &&
          item.status === "active",
      );
      if (!group || !patient)
        throw new DomainError(
          "GROUP_OR_PATIENT_NOT_FOUND",
          "Turma ou cliente ativo não encontrado.",
          404,
        );
      if (
        repositoryContext.groupEnrollments.some(
          (item) =>
            item.clinicId === clinicId &&
            item.groupId === input.groupId &&
            item.patientId === input.patientId &&
            item.status !== "cancelled",
        )
      )
        throw new DomainError(
          "GROUP_ENROLLMENT_EXISTS",
          "O cliente já está matriculado ou na lista de espera.",
          409,
        );
      const activeCount = repositoryContext.groupEnrollments.filter(
        (item) => item.groupId === group.id && item.status === "active",
      ).length;
      const waitlist = repositoryContext.groupEnrollments.filter(
        (item) => item.groupId === group.id && item.status === "waitlisted",
      );
      const timestamp = now();
      const startsOn = input.startsOn ?? clinicDate(timestamp);
      // Início em outra data: meia-noite desse dia no fuso da clínica.
      const enrolledAt =
        startsOn === clinicDate(timestamp)
          ? timestamp
          : zonedTimeToUtc(
              startsOn,
              "00:00",
              repositoryContext.clinicSettings.timezone,
            ).toISOString();
      const status = activeCount < group.capacity ? "active" : "waitlisted";
      const enrollment: GroupEnrollment = {
        ...input,
        id: uuid(),
        clinicId,
        patientName: patient.fullName,
        status,
        ...(status === "waitlisted"
          ? {
              queuePosition:
                Math.max(
                  0,
                  ...waitlist.map((item) => item.queuePosition ?? 0),
                ) + 1,
            }
          : {}),
        enrolledAt,
        startsOn,
        updatedAt: timestamp,
      };
      repositoryContext.groupEnrollments.push(enrollment);
      repositoryContext.refreshGroupCounts(group);
      return enrollment;
    },

    async cancelGroupEnrollment(clinicId: string, enrollmentId: string) {
      const enrollment = repositoryContext.groupEnrollments.find(
        (item) => item.clinicId === clinicId && item.id === enrollmentId,
      );
      if (!enrollment) return null;
      const wasActive = enrollment.status === "active";
      enrollment.status = "cancelled";
      delete enrollment.queuePosition;
      enrollment.updatedAt = now();
      // Só a matrícula ativa ganha fim; quem estava na espera nunca participou.
      if (wasActive) enrollment.endedOn = clinicDate(enrollment.updatedAt);
      if (wasActive) {
        const next = repositoryContext.groupEnrollments
          .filter(
            (item) =>
              item.groupId === enrollment.groupId &&
              item.status === "waitlisted",
          )
          .sort(
            (a, b) =>
              (a.queuePosition ?? 0) - (b.queuePosition ?? 0) ||
              a.enrolledAt.localeCompare(b.enrolledAt),
          )[0];
        if (next) promote(next);
      }
      const remaining = repositoryContext.groupEnrollments
        .filter(
          (item) =>
            item.groupId === enrollment.groupId && item.status === "waitlisted",
        )
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
      remaining.forEach((item, index) => {
        item.queuePosition = index + 1;
      });
      const group = repositoryContext.groupClasses.find(
        (item) => item.id === enrollment.groupId,
      );
      if (group) repositoryContext.refreshGroupCounts(group);
      return enrollment;
    },

    async listGroupSessions(clinicId: string, from: string, to: string) {
      const until = clampGroupSessionUntil(new Date(to));
      repositoryContext.ensureGroupSessions(clinicId, until, {
        renewBefore: new Date(until.getTime() - 7 * 86_400_000),
      });
      return repositoryContext.groupSessions
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.status !== "cancelled" &&
            repositoryContext.groupInBranchScope(item.groupId) &&
            item.startsAt < to &&
            item.endsAt > from,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async recordGroupAttendance(
      clinicId: string,
      _actorUserId: string,
      sessionId: string,
      patientId: string,
      input: GroupAttendanceInput,
    ) {
      const session = repositoryContext.groupSessions.find(
        (item) => item.clinicId === clinicId && item.id === sessionId,
      );
      const enrollment = session
        ? repositoryContext.groupEnrollments.find(
            (item) =>
              item.groupId === session.groupId &&
              item.patientId === patientId &&
              item.status === "active",
          )
        : undefined;
      if (!session || session.status === "cancelled" || !enrollment)
        throw new DomainError(
          "GROUP_ATTENDANCE_NOT_ALLOWED",
          "Sessão ou matrícula ativa não encontrada.",
          404,
        );
      let attendance = repositoryContext.groupAttendance.find(
        (item) => item.sessionId === sessionId && item.patientId === patientId,
      );
      const credit = repositoryContext.replacementCredits.find(
        (item) =>
          item.sourceSessionId === sessionId && item.patientId === patientId,
      );
      if (credit?.status === "used" && input.status !== "excused_absence")
        throw new DomainError(
          "REPLACEMENT_ALREADY_USED",
          "A reposição desta falta já foi utilizada.",
          409,
        );
      if (attendance) {
        attendance.status = input.status;
        attendance.recordedAt = now();
        if (input.notes) attendance.notes = input.notes;
        else delete attendance.notes;
      } else {
        attendance = {
          id: uuid(),
          clinicId,
          sessionId,
          patientId,
          patientName: enrollment.patientName,
          status: input.status,
          ...(input.notes ? { notes: input.notes } : {}),
          recordedAt: now(),
        };
        repositoryContext.groupAttendance.push(attendance);
      }
      if (input.status === "excused_absence" && !credit) {
        repositoryContext.replacementCredits.push({
          id: uuid(),
          clinicId,
          patientId,
          patientName: enrollment.patientName,
          sourceSessionId: sessionId,
          status: "available",
          createdAt: now(),
        });
      } else if (
        input.status !== "excused_absence" &&
        credit?.status === "available"
      ) {
        credit.status = "cancelled";
      }
      session.attendanceCount = repositoryContext.groupAttendance.filter(
        (item) => item.sessionId === sessionId,
      ).length;
      return attendance;
    },

    async completeGroupSession(clinicId: string, sessionId: string) {
      const session = repositoryContext.groupSessions.find(
        (item) => item.clinicId === clinicId && item.id === sessionId,
      );
      if (!session) return null;
      if (session.status !== "cancelled") session.status = "completed";
      return session;
    },

    async bookReplacement(
      clinicId: string,
      _actorUserId: string,
      input: ReplacementBookingInput,
    ) {
      const credit = repositoryContext.replacementCredits.find(
        (item) => item.clinicId === clinicId && item.id === input.creditId,
      );
      const session = repositoryContext.groupSessions.find(
        (item) => item.clinicId === clinicId && item.id === input.sessionId,
      );
      const group = session
        ? repositoryContext.groupClasses.find(
            (item) => item.id === session.groupId,
          )
        : undefined;
      if (
        !credit ||
        credit.status !== "available" ||
        !session ||
        !group ||
        session.status !== "scheduled"
      )
        throw new DomainError(
          "REPLACEMENT_NOT_AVAILABLE",
          "Crédito ou sessão de reposição indisponível.",
          409,
        );
      if (
        repositoryContext.groupAttendance.some(
          (item) =>
            item.sessionId === session.id &&
            item.patientId === credit.patientId,
        )
      )
        throw new DomainError(
          "REPLACEMENT_DUPLICATE_ATTENDANCE",
          "O cliente já possui presença registrada nesta sessão.",
          409,
        );
      const regularSeats = repositoryContext.groupEnrollments.filter(
        (item) => item.groupId === group.id && item.status === "active",
      ).length;
      const replacementSeats = repositoryContext.groupAttendance.filter(
        (item) =>
          item.sessionId === session.id && item.status === "replacement",
      ).length;
      const patientIsRegular = repositoryContext.groupEnrollments.some(
        (item) =>
          item.groupId === group.id &&
          item.patientId === credit.patientId &&
          item.status === "active",
      );
      if (
        !patientIsRegular &&
        regularSeats + replacementSeats >= group.capacity
      )
        throw new DomainError(
          "GROUP_SESSION_FULL",
          "A sessão está lotada.",
          409,
        );
      const attendance: GroupAttendance = {
        id: uuid(),
        clinicId,
        sessionId: session.id,
        patientId: credit.patientId,
        patientName: credit.patientName,
        status: "replacement",
        recordedAt: now(),
      };
      repositoryContext.groupAttendance.push(attendance);
      session.attendanceCount += 1;
      credit.status = "used";
      credit.usedSessionId = session.id;
      credit.usedAt = now();
      return { attendance, credit };
    },

    async updateAppointmentStatus(
      clinicId: string,
      appointmentId: string,
      status: AppointmentStatus,
      absenceReason?: string,
    ) {
      const appointment = repositoryContext.appointments.find(
        (item) => item.id === appointmentId && item.clinicId === clinicId,
      );
      if (!appointment) return null;
      const previousStatus = appointment.status;
      if (
        (status === "completed" || status === "no_show") &&
        previousStatus !== status
      )
        assertAppointmentStarted(appointment.startsAt);
      if (previousStatus !== "completed" && status === "completed") {
        repositoryContext.consumeSession(appointment);
      } else if (previousStatus === "completed" && status !== "completed") {
        repositoryContext.restoreSession(appointment);
      }
      appointment.status = status;
      // Desfecho registrado pela equipe substitui o da finalização automática.
      if (previousStatus !== status) delete appointment.autoCompletedAt;
      if (absenceReason !== undefined)
        appointment.absenceReason = absenceReason;
      appointment.updatedAt = now();
      return appointment;
    },
  };
}
