import { z } from "zod";
import {
  appointmentInputSchema,
  appointmentRescheduleInputSchema,
  appointmentStatusSchema,
  appointmentUpdateInputSchema,
  appointmentVisitTypeSchema,
  groupAttendanceInputSchema,
  groupClassInputSchema,
  groupClassUpdateSchema,
  groupEnrollmentInputSchema,
  groupWeeklySlotsSchema,
  holidayInputSchema,
  leadAppointmentInputSchema,
  recurringAppointmentInputSchema,
  replacementBookingInputSchema,
  scheduleBlockInputSchema,
} from "./model.js";

export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export type AppointmentVisitType = z.infer<typeof appointmentVisitTypeSchema>;

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export type AppointmentRescheduleInput = z.infer<
  typeof appointmentRescheduleInputSchema
>;

export type AppointmentUpdateInput = z.infer<
  typeof appointmentUpdateInputSchema
>;

export type RecurringAppointmentInput = z.infer<
  typeof recurringAppointmentInputSchema
>;

export type LeadAppointmentInput = z.infer<typeof leadAppointmentInputSchema>;

export type ScheduleBlockInput = z.infer<typeof scheduleBlockInputSchema>;

export type GroupWeeklySlot = z.infer<typeof groupWeeklySlotsSchema>[number];

export type GroupClassInput = z.infer<typeof groupClassInputSchema>;

export type GroupClassUpdateInput = z.infer<typeof groupClassUpdateSchema>;

export type GroupEnrollmentInput = z.infer<typeof groupEnrollmentInputSchema>;

export type GroupAttendanceInput = z.infer<typeof groupAttendanceInputSchema>;

export type ReplacementBookingInput = z.infer<
  typeof replacementBookingInputSchema
>;

/**
 * Atendimento da agenda. É de um cliente (`patientId`) ou de um lead ainda não
 * convertido (`leadId`), nunca dos dois. Em atendimento de lead, `patientName`
 * repete o nome do lead (`leadName`) para a agenda exibir o nome sem ramificar.
 */
export interface Appointment extends Omit<AppointmentInput, "patientId"> {
  predecessorId?: string;
  absenceReason?: string;
  id: string;
  clinicId: string;
  patientId?: string;
  leadId?: string;
  leadName?: string;
  endsAt: string;
  status: AppointmentStatus;
  patientName: string;
  professionalName: string;
  professionalColor: string;
  roomName: string;
  serviceName: string;
  createdAt: string;
  updatedAt: string;
  seriesId?: string;
}

export interface AppointmentRescheduleEvent {
  id: string;
  appointmentId: string;
  previousStartsAt: string;
  previousEndsAt: string;
  previousProfessionalId: string;
  previousProfessionalName: string;
  previousRoomId: string;
  previousRoomName: string;
  startsAt: string;
  endsAt: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  actorName: string;
  createdAt: string;
}

export interface ScheduleBlock extends ScheduleBlockInput {
  id: string;
  clinicId: string;
  professionalName?: string;
  roomName?: string;
  status: "active" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface GroupClass extends GroupClassInput {
  id: string;
  clinicId: string;
  name: string;
  sequence: number;
  serviceName: string;
  professionalName: string;
  roomName: string;
  activeEnrollments: number;
  waitlistCount: number;
  active: boolean;
  createdAt: string;
}

export interface GroupEnrollment extends GroupEnrollmentInput {
  id: string;
  clinicId: string;
  patientName: string;
  status: "active" | "waitlisted" | "cancelled";
  queuePosition?: number;
  enrolledAt: string;
  /** Início da matrícula (aaaa-mm-dd, fuso da clínica): data de `enrolledAt`. */
  startsOn: string;
  /** Fim (aaaa-mm-dd, fuso da clínica): data do cancelamento da matrícula ativa. */
  endedOn?: string;
  updatedAt: string;
}

export interface GroupSession {
  id: string;
  clinicId: string;
  groupId: string;
  groupName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "completed" | "cancelled";
  attendanceCount: number;
  createdAt: string;
}

export interface GroupAttendance {
  accountingEnabled?: boolean;
  outcome?:
    "scheduled" | "present" | "absent" | "excused_absence" | "cancelled";
  replacementCreditId?: string;
  id: string;
  clinicId: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  status: "present" | "absent" | "excused_absence" | "replacement";
  notes?: string;
  recordedAt: string;
}

export interface ReplacementCredit {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  sourceSessionId: string;
  status: "available" | "used" | "cancelled";
  usedSessionId?: string;
  createdAt: string;
  usedAt?: string;
}

export interface GroupWorkspace {
  groups: GroupClass[];
  enrollments: GroupEnrollment[];
  sessions: GroupSession[];
  attendance: GroupAttendance[];
  replacementCredits: ReplacementCredit[];
}

export type ClinicalAppointmentOption = Pick<
  Appointment,
  "id" | "startsAt" | "patientName" | "professionalName" | "status"
>;

export interface AppointmentReportBreakdown {
  id: string;
  name: string;
  appointments: number;
  completed: number;
  noShows: number;
  attendanceRate: number;
}

export type HolidayInput = z.infer<typeof holidayInputSchema>;

/** Dia sem atendimento; `date` (aaaa-mm-dd) é a data no fuso da clínica. */
export interface Holiday extends HolidayInput {
  id: string;
  clinicId: string;
  createdAt: string;
}
