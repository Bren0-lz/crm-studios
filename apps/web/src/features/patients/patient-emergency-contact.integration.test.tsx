import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function renderRecord(patient: Record<string, unknown>) {
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
    const body = url.endsWith(`/patients/${String(patient.id)}`) ? patient : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={[`/clientes/${String(patient.id)}`]}>
      <App />
    </MemoryRouter>,
  );
}

const base = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId: "11111111-1111-4111-8111-111111111111",
  recordNumber: "PAC-00001",
  fullName: "Helena Almeida",
  phone: "11987654321",
  tags: [],
  status: "active",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

describe("emergency contact on the client record", () => {
  it("shows a filled contact in the neutral style", async () => {
    renderRecord({
      ...base,
      emergencyContactName: "Maria Souza (mãe)",
      emergencyContactPhone: "11955556666",
    });
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    const value = within(summary).getByText(
      "Maria Souza (mãe) · (11) 95555-6666",
    );
    expect(value.closest(".emergency-contact")).not.toHaveClass("is-missing");
  });

  it("highlights in red only when the contact is missing", async () => {
    renderRecord(base);
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    const item = within(summary)
      .getByText("Contato de emergência")
      .closest(".emergency-contact");
    expect(item).toHaveClass("is-missing");
    expect(item).toHaveTextContent("Não informado");
  });
});
