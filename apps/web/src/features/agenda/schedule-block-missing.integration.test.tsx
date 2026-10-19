import type { Professional, Room } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import "../../test-support/legacy-setup";
import { ScheduleBlockModal } from "./ScheduleBlockModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

describe("schedule block (QM14)", () => {
  it("keeps 'Criar bloqueio' disabled listing the missing fields", () => {
    render(
      <AuthorizationContext.Provider value={authorization}>
        <ScheduleBlockModal
          date={new Date("2040-06-01T12:00:00")}
          professionals={[
            {
              id: "22222222-2222-4222-8222-222222222222",
              fullName: "Dra. Ana Martins",
            } as Professional,
          ]}
          rooms={[] as Room[]}
          onClose={() => undefined}
          onCreated={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Bloquear horário" });
    const create = within(dialog).getByRole("button", {
      name: "Criar bloqueio",
    });
    expect(create).toBeEnabled();
    expect(create).not.toHaveAttribute("aria-describedby");
    fireEvent.change(within(dialog).getByLabelText("Motivo"), {
      target: { value: "  " },
    });
    expect(create).toBeDisabled();
    expect(create).toHaveAccessibleDescription("Falta: Motivo.");
    // Sem salas cadastradas, o bloqueio de sala não tem recurso para escolher.
    fireEvent.change(within(dialog).getByLabelText("Tipo"), {
      target: { value: "room" },
    });
    expect(create).toHaveAccessibleDescription("Falta: Recurso, Motivo.");
    fireEvent.change(within(dialog).getByLabelText("Tipo"), {
      target: { value: "professional" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motivo"), {
      target: { value: "Curso externo" },
    });
    expect(create).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });
});
