import { appointmentStatusSchema } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

describe("dashboard pending appointments", () => {
  it("updates daily counts after attendance, absences, rescheduling and cancellation", async () => {
    const repository = new MemoryClinicRepository();
    const date = "2099-11-12";
    const appointment = await repository.createAppointment(clinicId, {
      patientId: "99999999-9999-4999-8999-999999999999",
      professionalId: "33333333-3333-4333-8333-333333333333",
      roomId: "55555555-5555-4555-8555-555555555555",
      serviceId: "77777777-7777-4777-8777-777777777777",
      startsAt: `${date}T12:00:00Z`,
      visitType: "regular",
    });
    for (const status of appointmentStatusSchema.options) {
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        status,
      );
      const summary = await repository.getDashboard(clinicId, date);
      expect(summary.nonCancelledAppointmentsToday).toBe(
        status === "cancelled" ? 0 : 1,
      );
      expect(summary.pendingToday).toBe(
        status === "scheduled" || status === "confirmed" ? 1 : 0,
      );
      expect(summary.awaitingConfirmationToday).toBe(
        status === "scheduled" ? 1 : 0,
      );
      expect(summary.completedToday).toBe(status === "completed" ? 1 : 0);
      expect(summary.appointmentsToday).toBe(1);
    }
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "scheduled",
    );
    await repository.rescheduleAppointment(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      appointment.id,
      {
        professionalId: appointment.professionalId,
        roomId: appointment.roomId,
        startsAt: "2099-11-13T12:00:00Z",
      },
    );
    expect(await repository.getDashboard(clinicId, date)).toMatchObject({
      appointmentsToday: 0,
      nonCancelledAppointmentsToday: 0,
      pendingToday: 0,
      awaitingConfirmationToday: 0,
      completedToday: 0,
    });
    expect(await repository.getDashboard(clinicId, "2099-11-13")).toMatchObject(
      {
        appointmentsToday: 1,
        nonCancelledAppointmentsToday: 1,
        pendingToday: 1,
        awaitingConfirmationToday: 1,
        completedToday: 0,
      },
    );
  });

  it.each(["2000-10-12", "2099-10-12"])(
    "lists scheduled and confirmed appointments on %s regardless of their time",
    async (date) => {
      const repository = new MemoryClinicRepository();
      const appointments = [];
      for (const [index, status] of appointmentStatusSchema.options.entries()) {
        const appointment = await repository.createAppointment(clinicId, {
          patientId: "99999999-9999-4999-8999-999999999999",
          professionalId: "33333333-3333-4333-8333-333333333333",
          roomId: "55555555-5555-4555-8555-555555555555",
          serviceId: "77777777-7777-4777-8777-777777777777",
          startsAt: `${date}T${String(12 + index).padStart(2, "0")}:00:00.000Z`,
          visitType: "regular",
        });
        appointments.push(appointment);
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          status,
        );
      }

      const dashboard = await repository.getDashboard(clinicId, date);
      expect(dashboard.appointmentsToday).toBe(7);
      expect(dashboard.nonCancelledAppointmentsToday).toBe(6);
      expect(dashboard.pendingToday).toBe(2);
      expect(dashboard.awaitingConfirmationToday).toBe(1);
      expect(dashboard.completedToday).toBe(1);
      expect(dashboard.nextAppointments.map((item) => item.id)).toEqual(
        appointments.slice(0, 2).map((item) => item.id),
      );
      expect(dashboard.nextAppointments.map((item) => item.status)).toEqual([
        "scheduled",
        "confirmed",
      ]);
    },
  );
});
