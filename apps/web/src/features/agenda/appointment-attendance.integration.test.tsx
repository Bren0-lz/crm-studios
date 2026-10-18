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
import { AgendaCard } from "./AgendaCard";
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

function mount(
  onUpdated: (updated: Appointment) => void,
  shown: Appointment = appointment,
) {
  return render(
    <MemoryRouter>
      <AuthorizationContext.Provider value={authorization}>
        <AppointmentDetailsModal
          appointment={shown}
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

describe("AppointmentDetailsModal cancellation", () => {
  it("requires a reason to cancel and sends it with the optional details", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...appointment, status: "cancelled" }),
    );
    render(
      <MemoryRouter>
        <AuthorizationContext.Provider value={authorization}>
          <AppointmentDetailsModal
            appointment={appointment}
            patient={undefined}
            service={undefined}
            editable
            initialCancelConfirmation
            onClose={() => undefined}
            onReschedule={() => undefined}
            onUpdated={() => undefined}
          />
        </AuthorizationContext.Provider>
      </MemoryRouter>,
    );
    const confirm = screen.getByRole("button", {
      name: "Confirmar cancelamento",
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
      target: { value: "Profissional indisponível" },
    });
    fireEvent.change(screen.getByLabelText("Detalhes (opcional)"), {
      target: { value: "Curso externo" },
    });
    fireEvent.click(confirm);
    await vi.waitFor(() =>
      expect(patchBody()).toEqual({
        status: "cancelled",
        absenceReason: "Profissional indisponível: Curso externo",
      }),
    );
  });

  it("disables completion and no-show before 15 minutes ahead of the start (QC3)", () => {
    // 10:00 em São Paulo amanhã: libera às 09:45.
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setUTCHours(13, 0, 0, 0);
    const future = {
      ...appointment,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    };
    const day = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
    }).format(start);
    const hint = `Disponível a partir de ${day} às 09:45`;
    mount(vi.fn(), future);
    for (const name of ["Marcar como realizado", "Marcar falta"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(hint);
    }
    expect(screen.getByText(hint)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirmar presença" }),
    ).toBeEnabled();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/status"),
      expect.anything(),
    );
  });

  it("shows the API refusal when the appointment has not started", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          code: "APPOINTMENT_NOT_STARTED",
          message: "Disponível a partir de 12/10 às 09:45.",
        },
        409,
      ),
    );
    const onUpdated = vi.fn();
    mount(onUpdated);
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar como realizado" }),
    );
    expect(
      await screen.findByText("Disponível a partir de 12/10 às 09:45."),
    ).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("keeps finished and no-show unavailable in the agenda card status before the start (QC3)", () => {
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const future = {
      ...appointment,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    };
    render(
      <AuthorizationContext.Provider value={authorization}>
        <AgendaCard
          appointment={future}
          onOpen={() => undefined}
          onStatus={() => undefined}
          onHistory={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    expect(screen.getByRole("option", { name: "Finalizado" })).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Não compareceu" }),
    ).toBeDisabled();
    expect(screen.getByRole("option", { name: "Confirmado" })).toBeEnabled();
  });
});
