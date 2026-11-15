import type { PatientPlan, PlanTemplate } from "@crm/contracts";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { PlanCard } from "./PlanCard";

const templateId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const plan = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "11111111-1111-4111-8111-111111111111",
  patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  patientName: "Helena Almeida",
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  serviceName: "Pilates",
  services: [
    {
      serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      serviceName: "Pilates",
      totalSessions: 24,
      remainingSessions: 24,
      totalValueInCents: 90000,
    },
  ],
  planTemplateId: templateId,
  name: "Trimestral 2x",
  // O tipo "quarterly" do catálogo grava o `kind` "fixed_package" (`planTypeKind`).
  kind: "fixed_package",
  totalSessions: 24,
  remainingSessions: 24,
  validFrom: "2026-11-10",
  validUntil: "2027-02-09",
  totalValueInCents: 90000,
  installments: 3,
  firstDueDate: "2026-11-20",
  status: "active",
  autoRenew: false,
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
} as unknown as PatientPlan;

const template = {
  id: templateId,
  clinicId: plan.clinicId,
  name: "Trimestral 2x",
  kind: "fixed_package",
  planType: "quarterly",
  services: [],
  totalValueInCents: 90000,
  active: true,
} as unknown as PlanTemplate;

function head() {
  return document.querySelector(".plan-card-head") as HTMLElement;
}

describe("plan card type", () => {
  it("shows the catalog type when known and the kind label without it", () => {
    const { unmount } = render(
      <PlanCard
        plan={plan}
        plans={[plan]}
        planType="quarterly"
        title="Trimestral 2x"
      />,
    );
    expect(within(head()).getByText("Plano trimestral")).toBeInTheDocument();
    expect(within(head()).queryByText("Pacote fixo")).not.toBeInTheDocument();
    unmount();

    render(<PlanCard plan={plan} plans={[plan]} title="Trimestral 2x" />);
    expect(within(head()).getByText("Pacote fixo")).toBeInTheDocument();
  });

  it("reads the type of the contracted plan from the catalog on the plans page", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () =>
          url.includes("/plan-templates")
            ? [template]
            : url.includes("/plans")
              ? [plan]
              : [],
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Helena Almeida");
    expect(
      await within(head()).findByText("Plano trimestral"),
    ).toBeInTheDocument();
    expect(within(head()).queryByText("Pacote fixo")).not.toBeInTheDocument();
  });
});
