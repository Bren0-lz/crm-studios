import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("shows monthly sales and patients without return directly on the manager dashboard", async () => {
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
      const body = String(input).includes("/reports/sales?")
        ? {
            month: "2026-09",
            current: {
              to: "2026-09-15",
              netSalesInCents: 120000,
              receivedInCents: 90000,
              attendedPatients: 14,
            },
            changePercent: 20,
            patientsWithoutReturn: [
              {
                patientId: "99999999-9999-4999-8999-999999999999",
                patientName: "Helena Almeida",
                lastCompletedAt: "2026-08-20T15:00:00Z",
              },
            ],
          }
        : {
            appointmentsToday: 3,
            completedToday: 1,
            patientsActive: 40,
            noShowsThisMonth: 1,
            nextAppointments: [],
          };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Vendas e retorno dos clientes",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1\.200,00/)).toBeInTheDocument();
    expect(
      screen.getByText("+20% vs. mês anterior comparável"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Clientes sem retorno" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Helena Almeida")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todos (1)" })).toHaveAttribute(
      "href",
      "/relatorios?secao=sem-retorno",
    );
    expect(screen.queryByText("Cadastros incompletos")).not.toBeInTheDocument();
    expect(
      screen.getByText("Studios Aryana", { selector: ".clinic-label" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aryana Dutra")).toBeInTheDocument();
    expect(screen.queryByText(/Movimenta/i)).not.toBeInTheDocument();
  });

  it("opens a plan sale with patient and service data", async () => {
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
      const body = url.includes("/patients")
        ? [
            {
              id: "99999999-9999-4999-8999-999999999999",
              fullName: "Helena Almeida",
            },
          ]
        : url.includes("/services")
          ? [
              {
                id: "77777777-7777-4777-8777-777777777777",
                name: "Fisioterapia individual",
              },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    const action = await screen.findByRole("button", { name: "Novo plano" });
    // Os clientes do seletor chegam junto com a lista de planos.
    await screen.findByText("Nenhum plano cadastrado");
    fireEvent.click(action);
    expect(
      screen.getByRole("heading", { name: "Novo plano" }),
    ).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Cliente" });
    expect(picker).toHaveValue("");
    fireEvent.focus(picker);
    fireEvent.click(screen.getByRole("option", { name: "Helena Almeida" }));
    expect(picker).toHaveValue("Helena Almeida");
  });

  it("renews a plan with the next period already filled in", async () => {
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
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
          remainingSessions: 2,
          serviceName: "Pilates",
        },
      ],
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: "11111111-1111-4111-8111-111111111111",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      remainingSessions: 2,
      validFrom: "2026-09-01",
      validUntil: "2026-09-30",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      status: "active",
      autoRenew: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    let renewalBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes(`/plans/${plan.id}/renew`)) {
        renewalBody = JSON.parse(String(init?.body));
        const renewed = {
          ...plan,
          ...renewalBody,
          id: "66666666-6666-4666-8666-666666666666",
          remainingSessions: 8,
          renewedFromPlanId: plan.id,
        };
        return { ok: true, status: 201, json: async () => renewed } as Response;
      }
      const body = url.includes("/plans") ? [plan] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/^Automática em 01 de out/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renovar" }));
    expect(
      screen.getByRole("heading", { name: "Renovar plano" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Fim da validade")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Primeiro vencimento")).toHaveValue(
      "2026-10-05",
    );
    fireEvent.change(screen.getByLabelText("Valor do serviço 1"), {
      target: { value: "420" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Renovar plano e gerar parcelas" }),
    );
    expect(
      await screen.findByText(/^Renovado a partir de 01 de out/),
    ).toBeInTheDocument();
    expect(renewalBody).toMatchObject({
      validFrom: "2026-10-01",
      totalValueInCents: 42000,
      autoRenew: true,
    });
    expect(renewalBody).not.toHaveProperty("patientId");
  });
});
