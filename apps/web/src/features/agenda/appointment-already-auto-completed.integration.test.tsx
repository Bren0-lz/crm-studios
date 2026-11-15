import type { Appointment } from "@crm/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { AppointmentDetailsModal } from "./AppointmentDetailsModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

const appointment: Appointment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientId: "11111111-1111-4111-8111-111111111111",
  professionalId: "22222222-2222-4222-8222-222222222222",
  roomId: "33333333-3333-4333-8333-333333333333",
  serviceId: "44444444-4444-4444-8444-444444444444",
  startsAt: "2026-10-12T13:00:00.000Z",
  endsAt: "2026-10-12T14:00:00.000Z",
  visitType: "regular",
  status: "scheduled",
  patientName: "Ana Gomes",
  professionalName: "Dra. Ana Martins",
  professionalColor: "#2f7d6d",
  roomName: "Sala 1",
  serviceName: "Pilates",
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};

describe("AppointmentDetailsModal after the automatic finalization (RE8)", () => {
  it("shows the message and reloads the appointment with the automatic badge", async () => {
    const current: Appointment = {
      ...appointment,
      status: "completed",
      autoCompletedAt: "2026-10-12T15:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      init?.method === "PATCH"
        ? jsonResponse(
            {
              code: "APPOINTMENT_ALREADY_AUTO_COMPLETED",
              message: "Este atendimento já foi finalizado automaticamente.",
              details: { appointment: current },
            },
            409,
          )
        : String(input).includes("/satisfaction")
          ? jsonResponse({ surveys: [] })
          : jsonResponse({}),
    );
    const onUpdated = vi.fn();
    const onRefreshed = vi.fn();
    render(
      <MemoryRouter>
        <AuthorizationContext.Provider value={authorization}>
          <AppointmentDetailsModal
            appointment={appointment}
            patient={undefined}
            service={undefined}
            editable
            onClose={() => undefined}
            onReschedule={() => undefined}
            onUpdated={onUpdated}
            onRefreshed={onRefreshed}
            onEdited={() => undefined}
          />
        </AuthorizationContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Finalização automática")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar como realizado" }),
    );
    expect(
      await screen.findByText(
        "Este atendimento já foi finalizado automaticamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Finalização automática")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Marcar como realizado" }),
    ).toBeNull();
    expect(onRefreshed).toHaveBeenCalledWith(current);
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
