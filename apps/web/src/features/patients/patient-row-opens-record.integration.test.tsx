import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("patient list rows", () => {
  it("opens the client record on row click and edits only from the Edit action", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      clinicId: "11111111-1111-4111-8111-111111111111",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["Pilates", "VIP", "Pós-operatório", "Recorrente"],
      status: "active",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes(`/patients/${patient.id}`)
        ? url.endsWith(patient.id)
          ? patient
          : []
        : url.includes("/patients?search=")
          ? [patient]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    const row = await screen.findByRole("button", {
      name: "Abrir ficha de Helena Almeida",
    });
    expect(row).toHaveTextContent("+2");
    fireEvent.click(row);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
