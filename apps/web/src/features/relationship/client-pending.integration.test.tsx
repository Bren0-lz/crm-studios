import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const patientId = "99999999-9999-4999-8999-999999999999";
const otherId = "88888888-8888-4888-8888-888888888888";

function mockApi() {
  const suggestions = [
    {
      patientId,
      patientName: "Helena Almeida",
      phone: "11987654321",
      reason: "overdue_payment",
      referenceKey: "rec-1",
      detail: "1 parcela em atraso desde 01/08",
      dueDate: "2026-08-01",
      priority: 1,
    },
    {
      patientId,
      patientName: "Helena Almeida",
      phone: "11987654321",
      reason: "expired_with_balance",
      referenceKey: "plan-1",
      detail: "Pacote 10 sessões venceu em 20/09 com 6 sessões",
      priority: 2,
    },
  ];
  const receivable = (id: string, extra: Record<string, unknown>) => ({
    id,
    clinicId: "c",
    patientId,
    patientName: "Helena Almeida",
    description: "Pacote 10 sessões",
    installmentNumber: 1,
    installmentCount: 2,
    dueDate: "2026-08-01",
    amountInCents: 25000,
    status: "open",
    overdue: true,
    createdAt: "2026-07-01T12:00:00Z",
    updatedAt: "2026-07-01T12:00:00Z",
    ...extra,
  });
  const receivables = [
    receivable("rec-1", {}),
    receivable("rec-2", {
      installmentNumber: 2,
      dueDate: "2026-11-01",
      overdue: false,
    }),
    receivable("rec-paid", { status: "paid", description: "Avaliação" }),
    receivable("rec-other", { patientId: otherId, description: "Outro" }),
  ];
  const plans = [
    {
      id: "plan-1",
      clinicId: "c",
      patientId,
      patientName: "Helena Almeida",
      name: "Pacote 10 sessões",
      serviceId: "s",
      serviceName: "Fisioterapia",
      services: [],
      status: "expired",
      totalSessions: 10,
      remainingSessions: 6,
      validFrom: "2026-06-20",
      validUntil: "2026-09-20",
      autoRenew: false,
      createdAt: "2026-06-20T12:00:00Z",
      updatedAt: "2026-06-20T12:00:00Z",
    },
    {
      id: "plan-0",
      clinicId: "c",
      patientId,
      patientName: "Helena Almeida",
      name: "Plano usado",
      serviceId: "s",
      serviceName: "Fisioterapia",
      services: [],
      status: "completed",
      totalSessions: 4,
      remainingSessions: 0,
      validFrom: "2026-01-01",
      autoRenew: false,
      createdAt: "2026-01-01T12:00:00Z",
      updatedAt: "2026-01-01T12:00:00Z",
    },
  ];
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/relationship/suggestions")
      ? suggestions
      : url.includes("/relationship/settings")
        ? relationshipSettingsFixture()
        : url.includes("/finance/summary")
          ? {
              openInCents: 50000,
              overdueInCents: 25000,
              paidThisMonthInCents: 0,
              receivables,
            }
          : url.includes("/plans?")
            ? plans
            : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

function login(role: string) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "11111111-1111-4111-8111-111111111111",
      fullName: "Ana Gestora",
      email: "gestora@movimenta.local",
      role,
    }),
  );
}

describe("client pending details from suggested contacts", () => {
  it("opens the client's open installments and plans with balance", async () => {
    login("admin");
    mockApi();
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver pendências de Helena Almeida",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Pendências de Helena",
    });
    const situations = within(dialog).getByRole("region", {
      name: "Situações",
    });
    expect(situations).toHaveTextContent("Pagamento atrasado");
    expect(situations).toHaveTextContent("Vencido com saldo");

    const installments = within(dialog).getByRole("region", {
      name: "Parcelas em aberto",
    });
    expect(
      await within(installments).findByText(/Parcela 1 de 2/),
    ).toBeInTheDocument();
    expect(
      within(installments).getByText(/Parcela 2 de 2/),
    ).toBeInTheDocument();
    expect(within(installments).queryByText("Avaliação")).toBeNull();
    expect(within(installments).queryByText("Outro")).toBeNull();
    expect(installments).toHaveTextContent(/R\$\s*250,00 em atraso/);
    expect(within(installments).getByText("Vencida")).toBeInTheDocument();
    expect(within(installments).getByText("Em aberto")).toBeInTheDocument();

    const plans = within(dialog).getByRole("region", {
      name: "Planos com saldo",
    });
    expect(
      await within(plans).findByText("Pacote 10 sessões"),
    ).toBeInTheDocument();
    expect(plans).toHaveTextContent("6 de 10 sessões restantes");
    expect(within(plans).queryByText("Plano usado")).toBeNull();
    expect(
      within(dialog).getByRole("link", { name: "Abrir ficha do cliente" }),
    ).toHaveAttribute("href", `/clientes/${patientId}`);

    expect(within(dialog).getByRole("link", { name: /WhatsApp/ })).toHaveClass(
      "whatsapp-button",
    );
    expect(
      within(dialog).getByRole("button", { name: "Registrar contato" }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides modules the profile cannot see", async () => {
    login("reception");
    mockApi();
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Helena Almeida");
    const card = screen.getByText("Helena Almeida").closest("article")!;
    expect(
      within(card).queryByRole("button", { name: "Pendências" }),
    ).not.toBeInTheDocument();
    fireEvent.click(card);
    const dialog = screen.getByRole("dialog", {
      name: "Pendências de Helena",
    });
    expect(
      within(dialog).getByRole("region", { name: "Situações" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("region", { name: "Parcelas em aberto" }),
    ).toBeNull();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("/finance/summary")]),
    );
  });
});
