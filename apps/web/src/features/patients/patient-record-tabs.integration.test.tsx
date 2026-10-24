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
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("client record", () => {
  it("shows the summary on top and the client's plans inside the record", async () => {
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
      email: "helena@example.com",
      birthDate: "1950-01-01",
      tags: ["VIP"],
      status: "active",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const plan = {
      id: "p1",
      patientId: patient.id,
      name: "Pilates 2x",
      kind: "fixed_package",
      status: "active",
      remainingSessions: 5,
      totalSessions: 8,
      validFrom: "2026-01-01",
      services: [],
    };
    const next = new Date(Date.now() + 2 * 86_400_000);
    next.setHours(15, 0, 0, 0);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plans?patientId=")
          ? [plan]
          : url.includes("/appointments?")
            ? [
                {
                  id: "a1",
                  patientId: patient.id,
                  patientName: patient.fullName,
                  serviceName: "Pilates",
                  professionalName: "Ana Martins",
                  startsAt: next.toISOString(),
                  endsAt: next.toISOString(),
                  status: "scheduled",
                },
              ]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={[`/clientes/${patient.id}`]}>
        <App />
      </MemoryRouter>,
    );
    const overview = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    expect(overview).toHaveTextContent("(11) 98765-4321");
    expect(overview).toHaveTextContent("helena@example.com");
    expect(overview).toHaveTextContent("Nascimento01/01/1950");
    expect(screen.queryByText("Ver também")).toBeNull();
    expect(overview).toHaveTextContent("VIP");
    expect(await within(overview).findByText("Pilates 2x")).toBeInTheDocument();
    expect(overview).toHaveTextContent("5 sessões restantes de 8");
    const day = new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(next);
    const year =
      next.getFullYear() === new Date().getFullYear()
        ? ""
        : ` de ${next.getFullYear()}`;
    expect(
      within(overview).getByText(`${day}${year} · 15:00`),
    ).toBeInTheDocument();
    expect(overview).toHaveTextContent("Pilates · Ana Martins");
    fireEvent.click(screen.getByRole("tab", { name: "Planos" }));
    const panel = screen.getByRole("tabpanel");
    expect(await within(panel).findByText("Pilates 2x")).toBeInTheDocument();
    // Cartão completo, como na página de Planos: tipo, saldo, validade e extrato.
    expect(panel).toHaveTextContent("Pacote fixo");
    expect(panel).toHaveTextContent("de 8 sessões restantes");
    expect(panel).toHaveTextContent("Validade");
    expect(
      within(panel).getByRole("button", { name: "Extrato" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "Abrir em Planos" }),
    ).toHaveAttribute("href", `/planos?patientId=${patient.id}`);
  });

  it("links the client to a recurring or single plan from the Plans tab", async () => {
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
      tags: [],
      status: "active",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const serviceId = "88888888-8888-4888-8888-888888888888";
    const templates = [
      {
        id: "aa000000-0000-4000-8000-000000000001",
        name: "Pilates mensal",
        kind: "recurring",
        totalValueInCents: 45000,
        services: [{ serviceId, totalSessions: 8, totalValueInCents: 45000 }],
        active: true,
      },
      {
        id: "aa000000-0000-4000-8000-000000000002",
        name: "Sessão avulsa",
        kind: "single",
        totalValueInCents: 12000,
        services: [{ serviceId, totalSessions: 1, totalValueInCents: 12000 }],
        active: true,
      },
    ];
    const writes: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/plans")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...body,
            id: "p1",
            patientName: patient.fullName,
            remainingSessions: 1,
            totalSessions: 1,
            status: "active",
          }),
        } as Response;
      }
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plan-templates")
          ? templates
          : url.includes("/services")
            ? [{ id: serviceId, name: "Pilates", active: true }]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={[`/clientes/${patient.id}`]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
    const panel = screen.getByRole("tabpanel");
    await within(panel).findByText("Nenhum plano contratado.");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Plano recorrente" }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Novo plano recorrente",
    });
    const recurring = await within(dialog).findByRole("option", {
      name: /Pilates mensal/,
    });
    expect(recurring).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: /Sessão avulsa/ }),
    ).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Helena Almeida");
    // O tipo vem do botão: não há como trocar o modelo e fugir do filtro.
    expect(within(dialog).queryByLabelText("Modelo")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    fireEvent.click(
      within(panel).getByRole("button", { name: "Plano avulso" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Novo plano avulso" });
    expect(within(dialog).queryByLabelText("Modelo")).not.toBeInTheDocument();
    await within(dialog).findByRole("option", { name: /Sessão avulsa/ });
    expect(
      within(dialog).queryByRole("option", { name: /Pilates mensal/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: templates[1]!.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      patientId: patient.id,
      planTemplateId: templates[1]!.id,
      kind: "single",
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
