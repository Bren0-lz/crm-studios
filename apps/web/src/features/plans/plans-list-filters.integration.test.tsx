import type { PatientPlan } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { clinicIsoDate } from "../../shared/lib/formatting";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { planSubtitle } from "./model";

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

function inDays(days: number) {
  const date = new Date(`${clinicIsoDate(new Date())}T12:00:00`);
  date.setDate(date.getDate() + days);
  return clinicIsoDate(date.toISOString().slice(0, 10));
}

describe("plans list", () => {
  it("does not repeat the service already in the plan name", () => {
    expect(
      planSubtitle(
        plan({ name: "Dançaterapia 2x", serviceName: "Dançaterapia" }),
      ),
    ).toBe("Dançaterapia 2x");
    expect(
      planSubtitle(plan({ name: "Plano mensal", serviceName: "Pilates" })),
    ).toBe("Plano mensal · Pilates");
    expect(
      planSubtitle(
        plan({
          name: "Combo",
          services: [
            { serviceId: "s1", serviceName: "Pilates" },
            { serviceId: "s2", serviceName: "Dançaterapia" },
          ] as PatientPlan["services"],
        }),
      ),
    ).toBe("Combo · Pilates, Dançaterapia");
  });

  it("combines the client search (without accents) with the status filters and counts", async () => {
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
    const plans = [
      plan({
        id: "p1",
        patientName: "Viviane Araújo",
        name: "Dançaterapia 2x",
        serviceName: "Dançaterapia",
        validUntil: inDays(10),
      }),
      plan({ id: "p2", patientName: "Helena Almeida", remainingSessions: 0 }),
      plan({ id: "p3", patientName: "Joana Prado", status: "paused" }),
      plan({ id: "p4", patientName: "Ana Lima", validUntil: inDays(40) }),
      plan({ id: "p5", patientName: "Maria Souza", status: "cancelled" }),
      plan({ id: "p6", patientName: "Bia Torres", status: "expired" }),
      plan({
        id: "p7",
        patientName: "Caio Reis",
        name: "Pilates · pago na comanda",
        kind: "single",
        totalSessions: 1,
        remainingSessions: 1,
        sourceTabId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      }),
    ];
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
    const group = await screen.findByRole("group", { name: "Situação" });
    const count = (label: string) =>
      within(group).getByRole("button", { name: new RegExp(`^${label}`) })
        .textContent;
    expect(count("Todos")).toBe("Todos7");
    expect(count("Ativo")).toBe("Ativo2");
    expect(count("Pausado")).toBe("Pausado1");
    expect(count("Esgotado")).toBe("Esgotado1");
    expect(count("Expirado")).toBe("Expirado1");
    expect(count("Cancelado")).toBe("Cancelado1");
    expect(count("Pago na comanda")).toBe("Pago na comanda1");
    expect(count("Vencendo")).toBe("Vencendo1");
    // A soma dos filtros (exceto "Vencendo", recorte sinalizado de Ativo) é igual a "Todos".
    const total = (label: string) =>
      Number(
        within(group)
          .getByRole("button", { name: new RegExp(`^${label}`) })
          .querySelector("small")?.textContent,
      );
    expect(
      [
        "Ativo",
        "Pausado",
        "Esgotado",
        "Expirado",
        "Cancelado",
        "Pago na comanda",
      ].reduce((sum, label) => sum + total(label), 0),
    ).toBe(total("Todos"));
    expect(
      within(group).getByRole("button", { name: /^Vencendo/ }),
    ).toHaveAccessibleDescription("Recorte de Ativo (fora da soma)");
    // O card "planos ativos" usa o mesmo critério do filtro "Ativo".
    expect(
      screen.getByText("planos ativos").previousElementSibling?.textContent,
    ).toBe(String(total("Ativo")));
    expect(screen.getByText("Dançaterapia 2x")).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: /^Vencendo/ }));
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Viviane Araújo"]);

    fireEvent.click(within(group).getByRole("button", { name: /^Esgotado/ }));
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Helena Almeida"]);

    fireEvent.change(screen.getByLabelText("Buscar plano por cliente"), {
      target: { value: "viviane araujo" },
    });
    expect(count("Todos")).toBe("Todos1");
    expect(count("Esgotado")).toBe("Esgotado0");
    expect(screen.getByText("Nenhum plano encontrado")).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: /^Todos/ }));
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Viviane Araújo"]);
  });
});
