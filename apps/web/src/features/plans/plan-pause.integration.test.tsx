import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("plan pause", () => {
  it("asks for reason and expected return before pausing and explains the validity", async () => {
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
    const plan = {
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
      validFrom: "2026-10-01",
      validUntil: "2099-10-31",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-10-05",
      status: "active",
      autoRenew: false,
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z",
    };
    const patches: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (options?.method === "PATCH") {
        patches.push(JSON.parse(String(options.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...plan,
            status: "paused",
            pausedAt: "2026-10-16T12:00:00.000Z",
            pauseReason: "Viagem",
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => (String(input).includes("/plans") ? [plan] : []),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pausar" }));
    const dialog = screen.getByRole("dialog", { name: "Pausar plano" });
    expect(dialog).toHaveTextContent(
      "Ao reativar, a validade (hoje até 31/10/2099) avança os dias em que ficou pausado.",
    );
    expect(patches).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), {
      target: { value: "Viagem" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Pausar plano" }),
    );
    expect(await screen.findByText(/Desde .* · Viagem/)).toBeInTheDocument();
    expect(patches).toEqual([
      { status: "paused", pause: { reason: "Viagem" } },
    ]);
  });
});
