import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("grouped suggested contacts", () => {
  it("shows a client in two categories once and records the contact for every reason", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const helena = {
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      phone: "11987654321",
    };
    const suggestions = [
      {
        ...helena,
        reason: "plan_expiring",
        referenceKey: "plan-1:2026-10-05",
        detail: "Plano termina em 3 dias",
        priority: 2,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        reason: "single_no_return",
        referenceKey: "appt-9",
        detail: "Veio uma vez há 70 dias e não voltou",
        priority: 5,
      },
      {
        ...helena,
        reason: "low_balance",
        referenceKey: "plan-1:balance",
        detail: "Restam 1 sessão",
        priority: 6,
      },
    ];
    const activities: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        activities.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: `a${activities.length}`, ...body }),
        } as Response;
      }
      const body = url.includes("/relationship/suggestions")
        ? suggestions
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Bruno Souza");
    expect(screen.getAllByText("Helena Almeida")).toHaveLength(1);
    const card = screen.getByText("Helena Almeida").closest("article")!;
    expect(
      within(card)
        .getAllByText(/Plano acabando|Saldo baixo/, {
          selector: ".status-pill",
        })
        .map((item) => item.textContent),
    ).toEqual(["Plano acabando", "Saldo baixo"]);
    expect(
      within(card).getByText("Plano termina em 3 dias"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Restam 1 sessão")).toBeInTheDocument();
    const filters = screen.getByRole("group", { name: "Situação" });
    expect(
      within(filters).getByRole("button", { name: /Todas\s*2/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole("button", { name: "Registrar contato" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar contato" });
    expect(dialog).toHaveTextContent("vale para os 2 motivos");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar contato" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Helena Almeida")).not.toBeInTheDocument(),
    );
    expect(activities).toEqual([
      expect.objectContaining({
        reason: "plan_expiring",
        referenceKey: "plan-1:2026-10-05",
        outcome: "contacted",
      }),
      expect.objectContaining({
        reason: "low_balance",
        referenceKey: "plan-1:balance",
        outcome: "contacted",
      }),
    ]);
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
  });
});
