import { describe, expect, it } from "vitest";
import { appointmentStatusSchema } from "@crm/contracts";
import { MemoryClinicRepository } from "./memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

describe("dashboard pending appointments", () => {
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
        await repository.updateAppointmentStatus(clinicId, appointment.id, status);
      }

      const dashboard = await repository.getDashboard(clinicId, date);
      expect(dashboard.appointmentsToday).toBe(7);
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
