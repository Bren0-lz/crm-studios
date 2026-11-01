import type { Appointment, Service } from "@crm/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { AppointmentRescheduleModal } from "./AppointmentRescheduleModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const carolina = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const beatriz = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pilatesRoom = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const aestheticsRoom = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const depilation = {
  id: "s1",
  name: "Depilação pernas",
  durationMinutes: 45,
  priceInCents: 12000,
  professionalIds: [carolina],
  roomIds: [aestheticsRoom],
} as Service;
const appointment = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  patientName: "Ana Gomes",
  serviceId: depilation.id,
  serviceName: depilation.name,
  professionalId: carolina,
  roomId: aestheticsRoom,
  startsAt: "2031-05-12T13:00:00.000Z",
  endsAt: "2031-05-12T13:45:00.000Z",
  status: "scheduled",
} as Appointment;

describe("reschedule keeps the service with whoever attends it (QM3)", () => {
  it("offers only the professionals and rooms of the appointment's service", () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    render(
      <AuthorizationContext.Provider value={authorization}>
        <AppointmentRescheduleModal
          appointment={appointment}
          service={depilation}
          professionals={[
            { id: carolina, fullName: "Carolina Rocha" },
            { id: beatriz, fullName: "Beatriz Lima" },
          ].map((item) => ({ ...item, color: "#db8290" }) as never)}
          rooms={[
            { id: pilatesRoom, name: "Sala Pilates", capacity: 1 },
            { id: aestheticsRoom, name: "Sala Estética", capacity: 1 },
          ].map((item) => item as never)}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    const dialog = screen.getByRole("dialog");
    const room = within(dialog).getByLabelText("Sala");
    expect(
      within(room).queryByRole("option", { name: "Sala Pilates" }),
    ).not.toBeInTheDocument();
    expect(room).toHaveValue(aestheticsRoom);
    const professional = within(dialog).getByLabelText("Profissional");
    expect(
      within(professional).queryByRole("option", { name: "Beatriz Lima" }),
    ).not.toBeInTheDocument();
    expect(professional).toHaveValue(carolina);
  });
});
