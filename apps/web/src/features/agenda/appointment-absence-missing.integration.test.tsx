import type { Appointment } from "@crm/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppointmentAbsenceModal } from "./AppointmentAbsenceModal";

afterEach(cleanup);

const appointment = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientName: "Helena Almeida",
  serviceName: "Pilates",
} as Appointment;

describe("registering an absence (QM14)", () => {
  it("keeps 'Registrar ausência' disabled listing the missing reason when it is required", () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <AppointmentAbsenceModal
        appointment={appointment}
        status="professional_absence"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar ausência" });
    const confirm = within(dialog).getByRole("button", {
      name: "Registrar ausência",
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription(
      "Falta: Motivo da ausência (pelo menos 2 caracteres).",
    );
    fireEvent.change(within(dialog).getByLabelText("Motivo da ausência"), {
      target: { value: "Curso externo" },
    });
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute("aria-describedby");
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });

  it("lets a no-show be registered without a reason", () => {
    render(
      <AppointmentAbsenceModal
        appointment={appointment}
        status="no_show"
        onClose={() => {}}
        onConfirm={async () => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar ausência" });
    expect(
      within(dialog).getByRole("button", { name: "Registrar ausência" }),
    ).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });
});
