import type { PatientPlan } from "@crm/contracts";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { planBadgeLabel } from "./model";

function plan(overrides: Partial<PatientPlan>): PatientPlan {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clinicId: "11111111-1111-4111-8111-111111111111",
    patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    patientName: "Helena Almeida",
    serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    serviceName: "Pilates",
    services: [],
    name: "Pilates 2x",
    kind: "fixed_package",
    totalSessions: 8,
    remainingSessions: 5,
    validFrom: "2026-01-01",
    validUntil: "2099-12-31",
    totalValueInCents: 40000,
    installments: 1,
    firstDueDate: "2026-01-05",
    status: "active",
    autoRenew: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  } as PatientPlan;
}

const tabCredit = plan({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  patientName: "Joana Prado",
  serviceName: "Pilates individual",
  name: "Pilates individual · pago na comanda",
  kind: "single",
  totalSessions: 1,
  remainingSessions: 1,
  validUntil: undefined,
  sourceTabId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  sourceAppointmentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
});

describe("crédito do serviço pago na comanda", () => {
  it("mostra 'Aguarda atendimento' até o consumo e 'Utilizado' depois", () => {
    expect(planBadgeLabel(tabCredit)).toBe("Aguarda atendimento");
    expect(
      planBadgeLabel({ ...tabCredit, remainingSessions: 0, status: "expired" }),
    ).toBe("Utilizado");
    expect(planBadgeLabel(plan({}))).toBe("Ativo");
  });

  it("fica fora dos planos ativos e do saldo da tela Planos", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const plans = [plan({}), tabCredit];
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () => (String(input).includes("/plans") ? plans : []),
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Pilates individual · pago na comanda"),
    ).toBeInTheDocument();
    expect(screen.getByText("Aguarda atendimento")).toBeInTheDocument();
    expect(screen.queryByText(/Comanda [A-F0-9]{8}/)).not.toBeInTheDocument();
    const metric = (label: string) =>
      screen.getByText(label).previousElementSibling?.textContent;
    expect(metric("planos ativos")).toBe("1");
    expect(metric("sessões disponíveis")).toBe("5");
    expect(metric("saldos baixos")).toBe("0");
  });
});
