import {
  planHasSessionBalance,
  groupEnrollmentCoversSession,
  type GroupAttendance,
  type GroupAttendanceInput,
  type ReplacementBookingInput,
  type GroupSession,
} from "@crm/contracts";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import { DomainError } from "../../repository.js";
import { assertReplacementTarget } from "../../modules/groups/replacement-target.js";
import { assertProfessionalServesGroup } from "../../modules/groups/service-professional.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createGroupOperationsRepository(
  context: MemoryRepositoryContext,
) {
  const session = (clinicId: string, id: string) => {
    const result = context.groupSessions.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === id &&
        item.status !== "cancelled",
    );
    if (!result)
      throw new DomainError(
        "GROUP_SESSION_NOT_FOUND",
        "Encontro não encontrado.",
        404,
      );
    return result;
  };
  const group = (clinicId: string, id: string) =>
    context.groupClasses.find(
      (item) => item.clinicId === clinicId && item.id === id,
    )!;
  /** Matrículas que participam do encontro (período da matrícula cobre a data). */
  const participants = (clinicId: string, meeting: GroupSession) =>
    context.groupEnrollments.filter(
      (item) =>
        item.clinicId === clinicId &&
        item.groupId === meeting.groupId &&
        groupEnrollmentCoversSession(
          item,
          meeting,
          context.clinicSettings.timezone,
        ),
    );
  function movement(
    attendance: GroupAttendance,
    meeting: GroupSession,
    present: boolean,
  ) {
    if (!attendance.accountingEnabled) return;
    const ledger = context.sessionMovements.filter(
      (item) => item.groupAttendanceId === attendance.id,
    );
    const balance = ledger.reduce((total, item) => total + item.quantity, 0);
    if ((present && balance < 0) || (!present && balance >= 0)) return;
    const previous = ledger.find(
      (item) =>
        item.quantity < 0 &&
        ledger
          .filter(
            (entry) =>
              entry.planId === item.planId &&
              entry.serviceId === item.serviceId,
          )
          .reduce((total, entry) => total + entry.quantity, 0) < 0,
    );
    const date = clinicDateOf(
      new Date(meeting.startsAt),
      context.clinicSettings.timezone,
    );
    const serviceId = group(attendance.clinicId, meeting.groupId).serviceId;
    const plan = present
      ? context.patientPlans
          .filter(
            (item) =>
              item.clinicId === attendance.clinicId &&
              item.patientId === attendance.patientId &&
              !item.sourceTabId &&
              item.status === "active" &&
              item.validFrom <= date &&
              (!item.validUntil || item.validUntil >= date) &&
              item.services.some(
                (entry) =>
                  entry.serviceId === serviceId &&
                  // Recorrente: a frequência semanal vale, sem bloquear pelo saldo nominal.
                  (entry.remainingSessions > 0 || !planHasSessionBalance(item)),
              ),
          )
          .sort(
            (a, b) =>
              (a.validUntil ?? "9999-12-31").localeCompare(
                b.validUntil ?? "9999-12-31",
              ) || a.createdAt.localeCompare(b.createdAt),
          )[0]
      : context.patientPlans.find(
          (item) =>
            item.clinicId === attendance.clinicId &&
            item.id === previous?.planId,
        );
    const entry = plan?.services.find(
      (item) => item.serviceId === (present ? serviceId : previous?.serviceId),
    );
    if (
      !plan ||
      !entry ||
      (present && entry.remainingSessions < 1 && planHasSessionBalance(plan))
    )
      throw new DomainError(
        "NO_SESSION_BALANCE",
        "O cliente não possui plano vigente com saldo para este serviço.",
        409,
      );
    const quantity = present ? -1 : 1;
    entry.remainingSessions += quantity;
    plan.remainingSessions = plan.services.reduce(
      (total, item) => total + item.remainingSessions,
      0,
    );
    plan.updatedAt = now();
    context.sessionMovements.push({
      id: uuid(),
      planId: plan.id,
      groupAttendanceId: attendance.id,
      serviceId: entry.serviceId,
      serviceName: entry.serviceName,
      kind: present
        ? ledger.some((item) => item.kind === "consumption")
          ? "adjustment"
          : "consumption"
        : ledger.some((item) => item.kind === "reversal")
          ? "adjustment"
          : "reversal",
      quantity,
      reason: present ? "Presença em turma" : "Correção da presença em turma",
      createdAt: now(),
    });
  }
  const count = (meeting: GroupSession) => {
    meeting.attendanceCount = context.groupAttendance.filter(
      (item) =>
        item.clinicId === meeting.clinicId &&
        item.sessionId === meeting.id &&
        !["cancelled", "excused_absence"].includes(item.outcome ?? ""),
    ).length;
  };
  return {
    async recordGroupAttendance(
      clinicId: string,
      actorUserId: string,
      sessionId: string,
      patientId: string,
      input: GroupAttendanceInput,
    ) {
      const meeting = session(clinicId, sessionId);
      const enrolled = participants(clinicId, meeting).find(
        (item) => item.patientId === patientId,
      );
      if (!enrolled)
        throw new DomainError(
          "GROUP_ATTENDANCE_NOT_ALLOWED",
          "Matrícula ativa não encontrada.",
          404,
        );
      const existing = context.groupAttendance.find(
        (item) =>
          item.clinicId === clinicId &&
          item.sessionId === sessionId &&
          item.patientId === patientId,
      );
      if (existing?.status === "replacement")
        throw new DomainError(
          "REPLACEMENT_ATTENDANCE_REQUIRED",
          "Registre a presença pela reposição.",
          409,
        );
      const credit = context.replacementCredits.find(
        (item) =>
          item.clinicId === clinicId &&
          item.sourceSessionId === sessionId &&
          item.patientId === patientId,
      );
      if (credit?.status === "used" && input.status !== "excused_absence")
        throw new DomainError(
          "REPLACEMENT_ALREADY_USED",
          "A reposição desta falta já foi utilizada.",
          409,
        );
      const attendance: GroupAttendance = existing ?? {
        id: uuid(),
        clinicId,
        sessionId,
        patientId,
        patientName: enrolled.patientName,
        status: input.status,
        accountingEnabled: true,
        recordedAt: now(),
      };
      movement(attendance, meeting, input.status === "present");
      Object.assign(attendance, input, { recordedAt: now() });
      if (!existing) context.groupAttendance.push(attendance);
      if (input.status === "excused_absence") {
        if (!credit)
          context.replacementCredits.push({
            id: uuid(),
            clinicId,
            patientId,
            patientName: enrolled.patientName,
            sourceSessionId: sessionId,
            status: "available",
            createdAt: now(),
          });
        else if (credit.status === "cancelled") credit.status = "available";
      } else if (credit?.status === "available") credit.status = "cancelled";
      count(meeting);
      context.recordAudit(
        clinicId,
        actorUserId,
        "group.attendance",
        "group_session",
        { patientId, status: input.status },
        sessionId,
      );
      return { ...attendance };
    },
    async bookReplacement(
      clinicId: string,
      actorUserId: string,
      input: ReplacementBookingInput,
    ) {
      const credit = context.replacementCredits.find(
        (item) => item.clinicId === clinicId && item.id === input.creditId,
      );
      if (!credit || credit.status !== "available")
        throw new DomainError(
          "REPLACEMENT_NOT_AVAILABLE",
          "Crédito de reposição indisponível.",
          409,
        );
      const meeting = session(clinicId, input.sessionId),
        destination = group(clinicId, meeting.groupId),
        original = session(clinicId, credit.sourceSessionId);
      assertReplacementTarget(
        meeting.id,
        credit.sourceSessionId,
        meeting.startsAt,
      );
      if (
        meeting.status !== "scheduled" ||
        group(clinicId, original.groupId).serviceId !== destination.serviceId
      )
        throw new DomainError(
          "REPLACEMENT_NOT_AVAILABLE",
          "Encontro incompatível ou indisponível.",
          409,
        );
      const existing = context.groupAttendance.find(
        (item) =>
          item.clinicId === clinicId &&
          item.sessionId === meeting.id &&
          item.patientId === credit.patientId,
      );
      if (
        existing &&
        !(
          existing.replacementCreditId === credit.id &&
          ["cancelled", "excused_absence"].includes(existing.outcome ?? "")
        )
      )
        throw new DomainError(
          "REPLACEMENT_DUPLICATE_ATTENDANCE",
          "O cliente já possui presença registrada nesta sessão.",
          409,
        );
      const regular = new Set(
        participants(clinicId, meeting).map((item) => item.patientId),
      );
      const replacements = context.groupAttendance.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.sessionId === meeting.id &&
          item.status === "replacement" &&
          !["cancelled", "excused_absence"].includes(item.outcome ?? ""),
      );
      if (
        !regular.has(credit.patientId) &&
        regular.size + replacements.length >= destination.capacity
      )
        throw new DomainError(
          "GROUP_SESSION_FULL",
          "A sessão está lotada.",
          409,
        );
      const attendance: GroupAttendance = existing ?? {
        id: uuid(),
        clinicId,
        sessionId: meeting.id,
        patientId: credit.patientId,
        patientName: credit.patientName,
        status: "replacement",
        recordedAt: now(),
        accountingEnabled: true,
        replacementCreditId: credit.id,
      };
      attendance.outcome = "scheduled";
      attendance.recordedAt = now();
      if (!existing) context.groupAttendance.push(attendance);
      credit.status = "used";
      credit.usedSessionId = meeting.id;
      credit.usedAt = now();
      count(meeting);
      context.recordAudit(
        clinicId,
        actorUserId,
        "group.replacement",
        "group_session",
        { creditId: credit.id },
        meeting.id,
      );
      return { attendance: { ...attendance }, credit: { ...credit } };
    },
    async recordReplacementAttendance(
      clinicId: string,
      actorUserId: string,
      attendanceId: string,
      status: Exclude<GroupAttendance["outcome"], undefined | "scheduled">,
    ) {
      const attendance = context.groupAttendance.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === attendanceId &&
          item.status === "replacement",
      );
      if (!attendance)
        throw new DomainError(
          "REPLACEMENT_NOT_AVAILABLE",
          "Reposição não encontrada.",
          404,
        );
      const meeting = session(clinicId, attendance.sessionId),
        credit = context.replacementCredits.find(
          (item) =>
            item.clinicId === clinicId &&
            (item.id === attendance.replacementCreditId ||
              (item.patientId === attendance.patientId &&
                item.usedSessionId === meeting.id)),
        );
      if (
        !credit ||
        credit.status !== "used" ||
        credit.usedSessionId !== meeting.id
      )
        throw new DomainError(
          "REPLACEMENT_NOT_AVAILABLE",
          "Este crédito não está reservado neste encontro.",
          409,
        );
      movement(attendance, meeting, status === "present");
      attendance.outcome = status;
      attendance.recordedAt = now();
      if (status === "cancelled" || status === "excused_absence") {
        credit.status = "available";
        delete credit.usedAt;
        delete credit.usedSessionId;
      }
      count(meeting);
      context.recordAudit(
        clinicId,
        actorUserId,
        "group.replacement_attendance",
        "group_session",
        { patientId: attendance.patientId, status },
        meeting.id,
      );
      return { ...attendance };
    },
    async updateGroupSessionProfessional(
      clinicId: string,
      actorUserId: string,
      sessionId: string,
      professionalId: string,
    ) {
      const meeting = session(clinicId, sessionId),
        professional = context.professionals.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === professionalId &&
            item.active,
        );
      if (!professional)
        throw new DomainError(
          "PROFESSIONAL_NOT_FOUND",
          "Profissional não encontrado.",
          404,
        );
      const group = context.groupClasses.find(
        (item) => item.id === meeting.groupId,
      );
      if (group) {
        assertProfessionalServesGroup(
          context.services.find(
            (item) =>
              item.clinicId === clinicId && item.id === group.serviceId,
          ),
          professionalId,
        );
        context.resourceBranch(group, professional);
      }
      const overlap = (start: string, end: string) =>
        start < meeting.endsAt && end > meeting.startsAt;
      if (
        context.appointments.some(
          (item) =>
            item.clinicId === clinicId &&
            !context.isTrashed("appointments", item.id) &&
            item.professionalId === professionalId &&
            item.status !== "cancelled" &&
            overlap(item.startsAt, item.endsAt),
        ) ||
        context.groupSessions.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== meeting.id &&
            item.professionalId === professionalId &&
            item.status !== "cancelled" &&
            overlap(item.startsAt, item.endsAt),
        ) ||
        context.scheduleBlocks.some(
          (item) =>
            item.clinicId === clinicId &&
            item.professionalId === professionalId &&
            item.status === "active" &&
            overlap(item.startsAt, item.endsAt),
        )
      )
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional está ocupado ou bloqueado nesse horário.",
          409,
        );
      meeting.professionalId = professional.id;
      meeting.professionalName = professional.fullName;
      context.recordAudit(
        clinicId,
        actorUserId,
        "group.professional",
        "group_session",
        { professionalId },
        sessionId,
      );
      return { ...meeting };
    },
  };
}
