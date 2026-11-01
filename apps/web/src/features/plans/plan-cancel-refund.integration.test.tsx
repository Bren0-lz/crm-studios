import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("plan cancellation with refund", () => {
  it("cancels an active plan registering the amount refunded to the client", async () => {
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
            status: "cancelled",
            cancelledAt: "2026-10-16T12:00:00.000Z",
            cancelledValueInCents: 0,
            refundedInCents: 15000,
            refundPaymentMethod: "cash",
            refundNote: "Pix",
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
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelar plano" });
    expect(
      within(dialog).queryByLabelText("Valor estornado ao cliente (R$)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByLabelText("Houve estorno de valor ao cliente"),
    );
    const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeDisabled();
    expect(dialog).toHaveTextContent("Falta: valor estornado ao cliente.");

    const amount = within(dialog).getByLabelText(
      "Valor estornado ao cliente (R$)",
    );
    fireEvent.change(amount, { target: { value: "50000" } });
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByText(
        /O valor estornado não pode passar do valor do plano/,
      ),
    ).toBeInTheDocument();
    expect(patches).toHaveLength(0);

    fireEvent.change(amount, { target: { value: "15000" } });
    fireEvent.change(
      within(dialog).getByLabelText("Forma de pagamento do estorno"),
      { target: { value: "cash" } },
    );
    fireEvent.change(
      within(dialog).getByLabelText("Observação do estorno (opcional)"),
      { target: { value: "Pix" } },
    );
    fireEvent.click(confirm);
    expect(
      await screen.findByText(
        /estornado ao cliente R\$\s150,00 \(Dinheiro\) · Pix/,
      ),
    ).toBeInTheDocument();

    // O extrato do plano também mostra o estorno.
    fireEvent.click(screen.getByRole("button", { name: "Extrato" }));
    const statement = await screen.findByRole("dialog", {
      name: /Extrato · Helena Almeida/,
    });
    expect(statement).toHaveTextContent(
      /Valor estornado ao cliente: R\$\s150,00 · Dinheiro · Pix/,
    );
    expect(patches).toEqual([
      {
        status: "cancelled",
        cancellation: {
          refundedInCents: 15000,
          refundPaymentMethod: "cash",
          refundNote: "Pix",
        },
      },
    ]);
  });
});
