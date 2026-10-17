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

function mount(onUpdated: (updated: Appointment) => void) {
  return render(
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
        />
      </AuthorizationContext.Provider>
    </MemoryRouter>,
  );
}

function patchBody() {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, options]) => options?.method === "PATCH");
  expect(call?.[0]).toContain(`/appointments/${appointment.id}/status`);
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

describe("AppointmentDetailsModal attendance actions", () => {
  it("marks the appointment as completed", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...appointment, status: "completed" }),
    );
    const onUpdated = vi.fn();
    mount(onUpdated);
    expect(
      screen.getByRole("button", { name: "Confirmar presença" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar como realizado" }),
    );
    await vi.waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      ),
    );
    expect(patchBody()).toEqual({ status: "completed" });
  });

  it("records a no-show without a reason", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...appointment, status: "no_show" }),
    );
    const onUpdated = vi.fn();
    mount(onUpdated);
    fireEvent.click(screen.getByRole("button", { name: "Marcar falta" }));
    expect(screen.getByLabelText("Motivo (opcional)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar falta" }));
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(patchBody()).toEqual({ status: "no_show" });
  });

  it("sends the optional no-show reason when informed", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...appointment, status: "no_show" }),
    );
    mount(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Marcar falta" }));
    fireEvent.change(screen.getByLabelText("Motivo (opcional)"), {
      target: { value: "Avisou que estava doente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registrar falta" }));
    await vi.waitFor(() =>
      expect(patchBody()).toEqual({
        status: "no_show",
        absenceReason: "Avisou que estava doente",
      }),
    );
  });
});
