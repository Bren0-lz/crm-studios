import type {
  AgendaNote,
  AgendaNoteInput,
  AgendaNoteUpdate,
  AgendaNoteScope,
} from "@crm/contracts";
import type {
  GroupAttendance,
  GroupAttendanceInput,
  ReplacementCredit,
  ReplacementBookingInput,
} from "@crm/contracts";
import type {
  Appointment,
  AppointmentInput,
  AppointmentRescheduleEvent,
  AppointmentRescheduleInput,
  AppointmentStatus,
  AppointmentUpdateInput,
  AutoFinalizationSettings,
  AutoFinalizationSettingsInput,
  ClinicalAppointmentOption,
  GroupClass,
  GroupClassInput,
  GroupClassRenameInput,
  GroupClassUpdateInput,
  GroupEnrollment,
  GroupEnrollmentInput,
  GroupSession,
  GroupWorkspace,
  Holiday,
  HolidayInput,
  LeadAppointmentInput,
  RecurringAppointmentInput,
  ScheduleBlock,
  ScheduleBlockInput,
} from "@crm/contracts";
import { request } from "../transport";

export const agendaApi = {
  agendaNotes: (from: string, to: string) =>
    request<AgendaNote[]>(
      `/agenda-notes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createAgendaNotes: (input: AgendaNoteInput) =>
    request<AgendaNote[]>("/agenda-notes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAgendaNote: (
    id: string,
    input: AgendaNoteUpdate,
    scope: AgendaNoteScope,
  ) =>
    request<AgendaNote[]>(`/agenda-notes/${id}?scope=${scope}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteAgendaNote: (id: string, scope: AgendaNoteScope) =>
    request<void>(`/agenda-notes/${id}?scope=${scope}`, { method: "DELETE" }),
  createAbsenceSuccessor: (id: string, input: AppointmentRescheduleInput) =>
    request<Appointment>(`/appointments/${id}/successor`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recordGroupAttendance: (
    sessionId: string,
    patientId: string,
    input: GroupAttendanceInput,
  ) =>
    request<GroupAttendance>(
      `/group-sessions/${sessionId}/attendance/${patientId}`,
      { method: "PUT", body: JSON.stringify(input) },
    ),
  bookReplacement: (input: ReplacementBookingInput) =>
    request<{ attendance: GroupAttendance; credit: ReplacementCredit }>(
      "/group-replacements/book",
      { method: "POST", body: JSON.stringify(input) },
    ),
  recordReplacementAttendance: (
    id: string,
    status: Exclude<GroupAttendance["outcome"], undefined | "scheduled">,
  ) =>
    request<GroupAttendance>(`/group-replacements/${id}/attendance`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  updateGroupSessionProfessional: (id: string, professionalId: string) =>
    request<GroupSession>(`/group-sessions/${id}/professional`, {
      method: "PUT",
      body: JSON.stringify({ professionalId }),
    }),
  completeGroupSession: (id: string) =>
    request<GroupSession>(`/group-sessions/${id}/complete`, { method: "POST" }),
  clinicalAppointmentOptions: (from: string, to: string) =>
    request<ClinicalAppointmentOption[]>(
      `/appointments/options?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  /** `options`: `allBranches` na ficha do cliente (atendimentos de todas as filiais). */
  appointments: (from: string, to: string, options?: RequestInit) =>
    request<Appointment[]>(
      `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      options,
    ),
  /** Atendimentos passados ainda agendados/confirmados, de qualquer data (QC2). */
  pendingFinalizationAppointments: () =>
    request<Appointment[]>("/appointments/pending-finalization"),
  /** Realizados que começaram no período (pela equipe ou pela finalização automática). */
  completedAppointments: (from: string, to: string) =>
    request<Appointment[]>(
      `/appointments/completed?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  autoFinalizationSettings: () =>
    request<AutoFinalizationSettings>("/clinic/auto-finalization"),
  saveAutoFinalizationSettings: (input: AutoFinalizationSettingsInput) =>
    request<AutoFinalizationSettings>("/admin/auto-finalization", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createAppointment: (input: AppointmentInput) =>
    request<Appointment>("/appointments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  rescheduleAppointment: (id: string, input: AppointmentRescheduleInput) =>
    request<Appointment>(`/appointments/${id}/schedule`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** Edita serviço, sala e observação (QM6); data/horário/profissional são da remarcação. */
  updateAppointment: (id: string, input: AppointmentUpdateInput) =>
    request<Appointment>(`/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  appointmentReschedules: (id: string) =>
    request<AppointmentRescheduleEvent[]>(`/appointments/${id}/reschedules`),
  createRecurringAppointments: (input: RecurringAppointmentInput) =>
    request<Appointment[]>("/appointments/recurring", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  groupSessions: (from: string, to: string) =>
    request<GroupSession[]>(
      `/group-sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  scheduleBlocks: (from: string, to: string) =>
    request<ScheduleBlock[]>(
      `/schedule-blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createScheduleBlock: (input: ScheduleBlockInput) =>
    request<ScheduleBlock>("/schedule-blocks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelScheduleBlock: (id: string) =>
    request<ScheduleBlock>(`/schedule-blocks/${id}/cancel`, {
      method: "POST",
    }),
  holidays: (from = "", to = "") => {
    const query = [
      from && `from=${encodeURIComponent(from)}`,
      to && `to=${encodeURIComponent(to)}`,
    ]
      .filter(Boolean)
      .join("&");
    return request<Holiday[]>(`/holidays${query ? `?${query}` : ""}`);
  },
  createHoliday: (input: HolidayInput) =>
    request<Holiday>("/holidays", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteHoliday: (id: string) =>
    request<void>(`/holidays/${id}`, { method: "DELETE" }),
  groupWorkspace: (from: string, to: string) =>
    request<GroupWorkspace>(
      `/groups/workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createGroupClass: (input: GroupClassInput) =>
    request<GroupClass>("/groups", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateGroupClass: (id: string, input: GroupClassUpdateInput) =>
    request<GroupClass>(`/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  renameGroupClass: (id: string, input: GroupClassRenameInput) =>
    request<GroupClass>(`/groups/${id}/name`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  createGroupEnrollment: (input: GroupEnrollmentInput) =>
    request<GroupEnrollment>("/group-enrollments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancelGroupEnrollment: (id: string) =>
    request<GroupEnrollment>(`/group-enrollments/${id}/cancel`, {
      method: "POST",
    }),
  updateAppointmentStatus: (
    id: string,
    status: AppointmentStatus,
    absenceReason?: string,
  ) =>
    request<Appointment>(`/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, absenceReason }),
    }),
  createLeadAppointment: (id: string, input: LeadAppointmentInput) =>
    request<Appointment>(`/leads/${id}/appointments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
