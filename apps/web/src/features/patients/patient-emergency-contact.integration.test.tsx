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
  whatsapp: "11987654321",
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
      emergencyContactWhatsapp: "11944443333",
    });
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    const value = within(summary).getByText(
      "Maria Souza (mãe) · (11) 95555-6666 · WhatsApp (11) 94444-3333",
    );
    expect(value.closest(".emergency-contact")).not.toHaveClass("is-missing");
    expect(within(summary).queryByText(/Cadastro incompleto/)).toBeNull();
  });

  it("accepts the client's own name and phone as the emergency contact", async () => {
    renderRecord({
      ...base,
      emergencyContactName: "Helena Almeida",
      emergencyContactPhone: "11987654321",
    });
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    expect(
      within(summary).getByText("Helena Almeida · (11) 98765-4321"),
    ).toBeVisible();
    expect(within(summary).queryByText(/Cadastro incompleto/)).toBeNull();
  });

  it("flags an old registration without WhatsApp or emergency contact as incomplete", async () => {
    renderRecord({ ...base, whatsapp: undefined });
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    expect(
      within(summary).getByText(
        "Cadastro incompleto: falta WhatsApp e contato de emergência.",
      ),
    ).toBeVisible();
  });

  it("names only the missing field in the incomplete registration notice", async () => {
    renderRecord({ ...base, emergencyContactName: "Maria Souza (mãe)" });
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    expect(
      within(summary).getByText(
        "Cadastro incompleto: falta contato de emergência.",
      ),
    ).toBeVisible();
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
