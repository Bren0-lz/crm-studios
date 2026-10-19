import type { Appointment, AppointmentRescheduleEvent } from "@crm/contracts";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { AppointmentRescheduleHistoryModal } from "./AppointmentRescheduleHistoryModal";
import "../../test-support/legacy-setup";

describe("histórico de reagendamentos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra só os dados do reagendamento, sem texto do Financeiro", async () => {
    const event: AppointmentRescheduleEvent = {
      id: "reschedule-1",
      appointmentId: "appointment-1",
      previousStartsAt: "2026-10-12T12:00:00.000Z",
      previousEndsAt: "2026-10-12T13:00:00.000Z",
      previousProfessionalId: "professional-1",
      previousProfessionalName: "Aryana",
      previousRoomId: "room-1",
      previousRoomName: "Sala 1",
      startsAt: "2026-10-13T14:00:00.000Z",
      endsAt: "2026-10-13T15:00:00.000Z",
      professionalId: "professional-2",
      professionalName: "Bruna",
      roomId: "room-2",
      roomName: "Sala 2",
      actorName: "Recepção Carla",
      createdAt: "2026-10-11T10:00:00.000Z",
    };
    vi.spyOn(api, "appointmentReschedules").mockResolvedValue([event]);
    const appointment = {
      id: "appointment-1",
      patientName: "Ana Cliente",
    } as Appointment;

    render(
      <AppointmentRescheduleHistoryModal
        appointment={appointment}
        onClose={() => undefined}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Histórico de reagendamentos",
    });
    expect(
      await within(dialog).findByText(/Recepção Carla/),
    ).toBeInTheDocument();
    const previous = new Date(event.previousStartsAt).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const next = new Date(event.startsAt).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    expect(within(dialog).getByText(previous)).toBeInTheDocument();
    expect(within(dialog).getByText(next)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Aryana · Sala 1 → Bruna · Sala 2");
    expect(dialog).not.toHaveTextContent(/Receitas e despesas/);
    expect(dialog).not.toHaveTextContent(/conciliação/);
  });
});
