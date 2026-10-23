import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { AppointmentPatientWarnings } from "./AppointmentPatientWarnings";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const patient = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana Gomes",
  tags: ["PAGAMENTO ATRASADO", "Pilates"],
};

function mount(checkPlan: boolean) {
  render(
    <AuthorizationContext.Provider value={authorization}>
      <AppointmentPatientWarnings patient={patient} checkPlan={checkPlan} />
    </AuthorizationContext.Provider>,
  );
}

describe("AppointmentPatientWarnings", () => {
  it("warns about attention tags and a missing current plan", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([
        {
          id: "p1",
          patientId: patient.id,
          status: "active",
          remainingSessions: 0,
          validFrom: "2026-01-01",
        },
      ]),
    );
    mount(true);
    expect(
      await screen.findByText(
        "Cliente sem plano com sessões disponíveis",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cliente com a etiqueta “Pagamento atrasado”"),
    ).toBeInTheDocument();
  });

  it("does not ask for a plan on trial or evaluation visits", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    mount(false);
    expect(
      await screen.findByText("Cliente com a etiqueta “Pagamento atrasado”"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sem plano com sessões/)).not.toBeInTheDocument();
  });
});
