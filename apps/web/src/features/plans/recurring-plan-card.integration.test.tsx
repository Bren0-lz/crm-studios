import type { PatientPlan } from "@crm/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../test-support/legacy-setup";
import { PlanCard } from "./PlanCard";

const base = {
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
      totalSessions: 8,
      remainingSessions: -1,
      totalValueInCents: 32000,
    },
  ],
  name: "Pilates 2x",
  totalSessions: 8,
  remainingSessions: -1,
  validFrom: "2026-11-10",
  validUntil: "2026-12-09",
  totalValueInCents: 32000,
  installments: 1,
  firstDueDate: "2026-11-20",
  status: "active",
  autoRenew: true,
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
} as const;

describe("recurring plan card", () => {
  it("shows the classes done in the cycle, without exhausting past the nominal balance", () => {
    const plan = { ...base, kind: "recurring" } as unknown as PatientPlan;
    render(<PlanCard plan={plan} plans={[plan]} title="Pilates 2x" />);
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.queryByText("Esgotado")).not.toBeInTheDocument();
    expect(
      screen.getByText(/aulas feitas neste ciclo · plano prevê 8/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pilates: 9 de 8 aulas previstas/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sessões restantes/)).not.toBeInTheDocument();
  });

  it("keeps the balance of a fixed package", () => {
    const plan = {
      ...base,
      kind: "fixed_package",
      remainingSessions: 0,
      services: [{ ...base.services[0], remainingSessions: 0 }],
    } as unknown as PatientPlan;
    render(<PlanCard plan={plan} plans={[plan]} title="Pilates 2x" />);
    expect(screen.getByText("Esgotado")).toBeInTheDocument();
    expect(screen.getByText(/de 8 sessões restantes/)).toBeInTheDocument();
  });
});
