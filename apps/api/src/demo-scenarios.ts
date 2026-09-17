import type {
  Appointment,
  GroupAttendance,
  GroupClass,
  GroupEnrollment,
  GroupSession,
  PatientPlan,
  Professional,
  Receivable,
  Room,
  Service,
  SessionMovement,
} from "@crm/contracts";
import { groupClassName } from "@crm/contracts";
import { demoPatients } from "./demo-patients.js";

export const demoClinicId = "11111111-1111-4111-8111-111111111111";
export const demoUserId = "22222222-2222-4222-8222-222222222222";
const id = (type: number, number: number) =>
  `e${type.toString(16).padStart(7, "0")}-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (offset: number) => {
  const result = new Date(`${localToday()}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + offset);
  return result.toISOString().slice(0, 10);
};
const stamp = (offset: number, hour = 12) =>
  `${date(offset)}T${String(hour).padStart(2, "0")}:00:00-03:00`;

export const demoServices: Service[] = [
  {
    id: id(1, 1),
    clinicId: demoClinicId,
    name: "Dançaterapia em grupo",
    durationMinutes: 60,
    priceInCents: 7500,
    color: "#9a6bc4",
    active: true,
  },
  {
    id: id(1, 2),
    clinicId: demoClinicId,
    name: "Pilates individual",
    durationMinutes: 50,
    priceInCents: 15000,
    color: "#6699a1",
    active: true,
  },
  {
    id: id(1, 3),
    clinicId: demoClinicId,
    name: "Depilação pernas",
    durationMinutes: 45,
    priceInCents: 12000,
    color: "#db8290",
    active: true,
  },
  {
    id: id(1, 4),
    clinicId: demoClinicId,
    name: "Depilação axilas",
    durationMinutes: 30,
    priceInCents: 5500,
    color: "#e7a16f",
    active: true,
  },
  {
    id: id(1, 5),
    clinicId: demoClinicId,
    name: "Massoterapia",
    durationMinutes: 60,
    priceInCents: 17000,
    color: "#89a96b",
    active: true,
  },
];
export const demoProfessionals: Professional[] = [
  {
    id: id(2, 1),
    clinicId: demoClinicId,
    fullName: "Clara Mendes",
    crefito: "DEMO-DANCA-01",
    specialty: "Dançaterapia",
    color: "#9a6bc4",
    active: true,
  },
  {
    id: id(2, 2),
    clinicId: demoClinicId,
    fullName: "Beatriz Lima",
    crefito: "DEMO-PILATES-02",
    specialty: "Pilates",
    color: "#6699a1",
    active: true,
  },
  {
    id: id(2, 3),
    clinicId: demoClinicId,
    fullName: "Carolina Rocha",
    crefito: "DEMO-ESTETICA-03",
    specialty: "Estética",
    color: "#db8290",
    active: true,
  },
];
export const demoRooms: Room[] = [
  {
    id: id(3, 1),
    clinicId: demoClinicId,
    name: "Sala de Dança",
    capacity: 12,
    active: true,
  },
  {
    id: id(3, 2),
    clinicId: demoClinicId,
    name: "Sala Pilates",
    capacity: 1,
    active: true,
  },
  {
    id: id(3, 3),
    clinicId: demoClinicId,
    name: "Sala Estética",
    capacity: 1,
    active: true,
  },
];

export type DemoFinancialEvent = {
  id: string;
  receivableId: string;
  kind: "created" | "payment" | "cancellation";
  amountInCents: number;
  createdAt: string;
};
export type DemoData = {
  plans: PatientPlan[];
  appointments: Appointment[];
  movements: SessionMovement[];
  receivables: Receivable[];
  financialEvents: DemoFinancialEvent[];
  groups: GroupClass[];
  enrollments: GroupEnrollment[];
  sessions: GroupSession[];
  attendance: GroupAttendance[];
};

export function buildDemoScenarios(): DemoData {
  const plans: PatientPlan[] = [],
    appointments: Appointment[] = [],
    movements: SessionMovement[] = [];
  const receivables: Receivable[] = [],
    financialEvents: DemoFinancialEvent[] = [];
  const groups: GroupClass[] = [],
    enrollments: GroupEnrollment[] = [];
  const sessions: GroupSession[] = [],
    attendance: GroupAttendance[] = [];
  const groupId = id(8, 1);
  groups.push({
    id: groupId,
    clinicId: demoClinicId,
    name: groupClassName(demoServices[0]!.name, 1),
    sequence: 1,
    serviceId: demoServices[0]!.id,
    serviceName: demoServices[0]!.name,
    professionalId: demoProfessionals[0]!.id,
    professionalName: demoProfessionals[0]!.fullName,
    roomId: demoRooms[0]!.id,
    roomName: demoRooms[0]!.name,
    capacity: 12,
    weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }, { weekday: 4, startTime: "18:00", endTime: "19:00" }],
    activeEnrollments: 8,
    waitlistCount: 0,
    active: true,
    createdAt: stamp(-90),
  });

  // Six weeks of past classes and three upcoming weeks, always on Tuesdays and Thursdays.
  const weekday = new Date(`${localToday()}T12:00:00Z`).getUTCDay();
  const mondayOffset = -((weekday + 6) % 7);
  for (let week = -6; week <= 2; week += 1) {
    for (const weekdayOffset of [1, 3]) {
      const dayOffset = mondayOffset + week * 7 + weekdayOffset;
      const number = (week + 6) * 2 + (weekdayOffset === 1 ? 1 : 2);
      sessions.push({
        id: id(9, number),
        clinicId: demoClinicId,
        groupId,
        groupName: groups[0]!.name,
        startsAt: stamp(dayOffset, 18),
        endsAt: stamp(dayOffset, 19),
        status: dayOffset < 0 ? "completed" : "scheduled",
        attendanceCount: 0,
        createdAt: stamp(-49),
      });
    }
  }

  for (let index = 0; index < 56; index += 1) {
    const patient = demoPatients[index]!;
    const cohort = Math.floor(index / 8);
    // Cohorts: frequent dance, frequent Pilates, active physiotherapy, single depilation,
    // cancelled dance, lapsed physiotherapy, and Pilates with overdue installments.
    const dance = cohort === 0 || cohort === 4;
    const service = dance
      ? demoServices[0]!
      : cohort === 1 || cohort === 6
        ? demoServices[1]!
        : cohort === 3
          ? demoServices[index % 2 ? 3 : 2]!
          : {
              id: "77777777-7777-4777-8777-777777777777",
              name: "Fisioterapia individual",
            };
    const planId = id(4, index + 1);
    const cancelled = cohort === 4,
      lapsed = cohort === 5,
      overdue = cohort === 6;
    const single = cohort === 3;
    const totalSessions = dance
      ? 24
      : single
        ? 1
        : cohort === 2 || lapsed
          ? 10
          : 12;
    const consumed = dance
      ? cancelled
        ? 5
        : 11
      : single
        ? 1
        : lapsed
          ? 4
          : overdue
            ? 3
            : 5;
    const start = cancelled || lapsed ? -100 : single ? -15 : -50;
    const installments = dance ? 3 : single ? 1 : 2;
    const totalValue = dance
      ? 149700
      : single
        ? service.id === demoServices[2]!.id
          ? 12000
          : 5500
        : cohort === 2 || lapsed
          ? 150000
          : 120000;
    const name = dance
      ? "Dançaterapia 2x/semana · trimestre"
      : single
        ? `${service.name} · sessão avulsa`
        : cohort === 2 || lapsed
          ? "Fisioterapia · pacote 10 sessões"
          : "Pilates individual · mensalidade";
    const createdAt = stamp(start - 2 + (index % 5));
    const cancelledAt = cancelled ? stamp(-25) : undefined;
    const plan: PatientPlan = {
      id: planId,
      clinicId: demoClinicId,
      patientId: patient.id,
      patientName: patient.fullName,
      serviceId: service.id,
      serviceName: service.name,
      name,
      kind: single
        ? "single"
        : dance || cohort === 1 || overdue
          ? "recurring"
          : "fixed_package",
      totalSessions,
      remainingSessions: totalSessions - consumed,
      validFrom: date(start),
      validUntil: date(lapsed ? -10 : cancelled ? 0 : 45),
      totalValueInCents: totalValue,
      installments,
      firstDueDate: date(start + 10),
      status: cancelled ? "cancelled" : lapsed ? "expired" : "active",
      ...(cancelledAt ? { cancelledAt, cancelledValueInCents: 99800 } : {}),
      createdAt,
      updatedAt: cancelledAt ?? createdAt,
    };
    plans.push(plan);
    movements.push({
      id: id(6, index * 100 + 1),
      planId,
      kind: "credit",
      quantity: totalSessions,
      reason: "Crédito inicial do plano",
      createdAt,
    });

    const base = Math.floor(totalValue / installments);
    for (let installment = 0; installment < installments; installment += 1) {
      const amount = base + (installment < totalValue % installments ? 1 : 0);
      const number = index * 3 + installment + 1,
        receivableId = id(5, number);
      const dueOffset = start + 10 + installment * 30;
      const paid =
        (single && index % 4 !== 0) ||
        (!single && installment === 0) ||
        (!cancelled && !overdue && !lapsed && installment === 1);
      const status =
        cancelled && installment > 0 ? "cancelled" : paid ? "paid" : "open";
      const paidAt = status === "paid" ? stamp(dueOffset - 2, 14) : undefined;
      receivables.push({
        id: receivableId,
        clinicId: demoClinicId,
        patientId: patient.id,
        planId,
        patientName: patient.fullName,
        description: `${name} · ${installment + 1}/${installments}`,
        installmentNumber: installment + 1,
        installmentCount: installments,
        dueDate: date(dueOffset),
        amountInCents: amount,
        status,
        overdue: status === "open" && dueOffset < 0,
        ...(paidAt
          ? { paidAt, paymentMethod: installment % 2 ? "card" : "pix" }
          : {}),
        createdAt,
        updatedAt: paidAt ?? cancelledAt ?? createdAt,
      });
      financialEvents.push({
        id: id(7, number * 3),
        receivableId,
        kind: "created",
        amountInCents: amount,
        createdAt,
      });
      if (paidAt)
        financialEvents.push({
          id: id(7, number * 3 + 1),
          receivableId,
          kind: "payment",
          amountInCents: amount,
          createdAt: paidAt,
        });
      if (status === "cancelled")
        financialEvents.push({
          id: id(7, number * 3 + 2),
          receivableId,
          kind: "cancellation",
          amountInCents: -amount,
          createdAt: cancelledAt!,
        });
    }

    if (dance) {
      enrollments.push({
        id: id(10, index + 1),
        clinicId: demoClinicId,
        groupId,
        patientId: patient.id,
        patientName: patient.fullName,
        status: cancelled ? "cancelled" : "active",
        enrolledAt: stamp(start),
        updatedAt: cancelledAt ?? stamp(start),
      });
      const pastSessions = sessions.filter(
        (session) => session.status === "completed",
      );
      for (let visit = 0; visit < (cancelled ? 5 : 11); visit += 1) {
        const session =
          pastSessions[visit + (cancelled ? 0 : pastSessions.length - 11)]!;
        attendance.push({
          id: id(11, index * 20 + visit + 1),
          clinicId: demoClinicId,
          sessionId: session.id,
          patientId: patient.id,
          patientName: patient.fullName,
          status: "present",
          recordedAt: session.endsAt,
        });
        movements.push({
          id: id(6, index * 100 + visit + 2),
          planId,
          kind: "consumption",
          quantity: -1,
          reason: "Presença em dançaterapia",
          createdAt: session.endsAt,
        });
      }
      if (!cancelled && index % 4 === 0) {
        const session = pastSessions[0]!;
        attendance.push({
          id: id(11, index * 20 + 19),
          clinicId: demoClinicId,
          sessionId: session.id,
          patientId: patient.id,
          patientName: patient.fullName,
          status: "excused_absence",
          notes: "Avisou com antecedência",
          recordedAt: session.endsAt,
        });
      }
    } else {
      const professional = single
        ? demoProfessionals[2]!
        : cohort === 1 || overdue
          ? demoProfessionals[1]!
          : {
              id: "33333333-3333-4333-8333-333333333333",
              fullName: "Dra. Ana Martins",
            };
      const room = single
        ? demoRooms[2]!
        : cohort === 1 || overdue
          ? demoRooms[1]!
          : {
              id: "55555555-5555-4555-8555-555555555555",
              name: "Sala Movimento",
            };
      for (let visit = 0; visit < consumed; visit += 1) {
        const dayOffset =
          (lapsed ? -95 : overdue ? -44 : single ? -9 : -42) +
          visit * (single ? 1 : 7) +
          (index % 8);
        const hour = 9 + Math.floor(index % 8) * 1;
        const appointmentId = id(12, index * 20 + visit + 1);
        appointments.push({
          id: appointmentId,
          clinicId: demoClinicId,
          patientId: patient.id,
          patientName: patient.fullName,
          professionalId: professional.id,
          professionalName: professional.fullName,
          professionalColor: single
            ? demoProfessionals[2]!.color
            : cohort === 1 || overdue
              ? demoProfessionals[1]!.color
              : "#5c6f68",
          roomId: room.id,
          roomName: room.name,
          serviceId: service.id,
          serviceName: service.name,
          startsAt: stamp(dayOffset, hour),
          endsAt: `${date(dayOffset)}T${String(hour).padStart(2, "0")}:${single && service.id === demoServices[3]!.id ? "30" : "50"}:00-03:00`,
          status:
            visit === consumed - 1 && index % 11 === 0
              ? "no_show"
              : "completed",
          createdAt: stamp(dayOffset - 7),
          updatedAt: stamp(dayOffset, hour + 1),
        });
        if (!(visit === consumed - 1 && index % 11 === 0))
          movements.push({
            id: id(6, index * 100 + visit + 2),
            planId,
            appointmentId,
            kind: "consumption",
            quantity: -1,
            reason: "Atendimento concluído",
            createdAt: stamp(dayOffset, hour + 1),
          });
      }
      if (!single && !lapsed && !overdue) {
        const dayOffset = 3 + (index % 8);
        const hour = 9 + Math.floor(index % 8);
        appointments.push({
          id: id(12, index * 20 + 19),
          clinicId: demoClinicId,
          patientId: patient.id,
          patientName: patient.fullName,
          professionalId: professional.id,
          professionalName: professional.fullName,
          professionalColor:
            cohort === 1 ? demoProfessionals[1]!.color : "#5c6f68",
          roomId: room.id,
          roomName: room.name,
          serviceId: service.id,
          serviceName: service.name,
          startsAt: stamp(dayOffset, hour),
          endsAt: `${date(dayOffset)}T${String(hour).padStart(2, "0")}:50:00-03:00`,
          status: "confirmed",
          createdAt: stamp(-2),
          updatedAt: stamp(-2),
        });
      }
      if (index % 11 === 0) plan.remainingSessions += 1; // The last visit was a no-show.
    }
  }
  for (const session of sessions)
    session.attendanceCount = attendance.filter(
      (item) => item.sessionId === session.id,
    ).length;
  return {
    plans,
    appointments,
    movements,
    receivables,
    financialEvents,
    groups,
    enrollments,
    sessions,
    attendance,
  };
}
