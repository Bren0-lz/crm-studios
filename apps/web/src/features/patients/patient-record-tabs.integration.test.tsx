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
    expect(overview).toHaveTextContent(
      `Idade${new Date().getFullYear() - 1950} anos`,
    );
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

  it("cancels a running plan from the Plans tab registering the refund", async () => {
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
    const plan = {
      id: "p1",
      patientId: patient.id,
      patientName: patient.fullName,
      name: "Pilates 2x",
      kind: "fixed_package",
      status: "active",
      remainingSessions: 5,
      totalSessions: 8,
      totalValueInCents: 40000,
      validFrom: "2026-01-01",
      services: [],
    };
    const patches: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...plan, status: "cancelled" }),
        } as Response;
      }
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plans?patientId=")
          ? [plan]
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
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Cancelar plano" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Cancelar plano" });
    fireEvent.click(
      within(dialog).getByLabelText("Houve estorno de valor ao cliente"),
    );
    fireEvent.change(
      within(dialog).getByLabelText("Valor estornado ao cliente (R$)"),
      { target: { value: "12000" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(patches).toEqual([
      {
        status: "cancelled",
        cancellation: { refundedInCents: 12000, refundPaymentMethod: "pix" },
      },
    ]);
  });

  it("lists every current plan in the summary, the one expiring first on top", async () => {
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
    const basePlan = {
      patientId: patient.id,
      kind: "fixed_package",
      status: "active",
      validFrom: "2026-01-01",
      services: [],
    };
    const plans = [
      {
        ...basePlan,
        id: "p1",
        name: "Pilates 2x",
        remainingSessions: 5,
        totalSessions: 8,
      },
      {
        ...basePlan,
        id: "p2",
        name: "Dançaterapia 1x",
        remainingSessions: 3,
        totalSessions: 4,
        validUntil: "2099-03-10",
      },
      {
        ...basePlan,
        id: "p3",
        name: "Plano encerrado",
        status: "cancelled",
        remainingSessions: 0,
        totalSessions: 4,
      },
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plans?patientId=")
          ? plans
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
    expect(
      await within(overview).findByText("Planos ativos (2)"),
    ).toBeInTheDocument();
    const items = within(overview).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Dançaterapia 1x");
    expect(items[0]).toHaveTextContent("3 sessões restantes de 4 · até");
    expect(items[1]).toHaveTextContent("Pilates 2x");
    expect(items[1]).toHaveTextContent("5 sessões restantes de 8");
    expect(overview).not.toHaveTextContent("Plano encerrado");
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

  it("requires the class when the recurring plan from the Plans tab is a group class plan", async () => {
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
    const template = {
      id: "aa000000-0000-4000-8000-000000000001",
      name: "Pilates mensal",
      kind: "recurring",
      totalValueInCents: 45000,
      services: [{ serviceId, totalSessions: 8, totalValueInCents: 45000 }],
      active: true,
    };
    const group = {
      id: "cc000000-0000-4000-8000-000000000001",
      clinicId: patient.clinicId,
      name: "Pilates 01",
      sequence: 1,
      serviceId,
      serviceName: "Pilates",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana",
      roomId: "55555555-5555-4555-8555-555555555555",
      roomName: "Sala Movimento",
      weeklySlots: [{ weekday: 1, startTime: "08:00", endTime: "09:00" }],
      capacity: 4,
      activeEnrollments: 1,
      waitlistCount: 0,
      active: true,
      createdAt: "2026-01-01T12:00:00.000Z",
    };
    const purchases: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/plans/purchases")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        purchases.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            plan: {
              ...(body.plan as object),
              id: "p1",
              patientName: patient.fullName,
              remainingSessions: 8,
              totalSessions: 8,
              status: "active",
            },
            appointments: [],
          }),
        } as Response;
      }
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plan-templates")
          ? [template]
          : url.includes("/services")
            ? [{ id: serviceId, name: "Pilates", active: true }]
            : url.includes("/groups/workspace")
              ? { groups: [group], enrollments: [], sessions: [] }
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
    const dialog = await screen.findByRole("dialog", {
      name: "Novo plano recorrente",
    });
    await within(dialog).findByRole("option", { name: /Pilates mensal/ });
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: template.id },
    });
    const turma = await within(dialog).findByLabelText("Turma");
    await within(turma).findByRole("option", { name: /^Pilates 01/ });
    expect(turma).toBeRequired();
    const save = within(dialog).getByRole("button", {
      name: "Criar plano e parcelas",
    });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText(/^Falta:/)).toHaveTextContent("Turma");
    fireEvent.change(turma, { target: { value: group.id } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(purchases).toHaveLength(1));
    // Plano e matrícula na turma entram na mesma contratação.
    expect(purchases[0]).toMatchObject({
      groupId: group.id,
      appointments: [],
      plan: { patientId: patient.id, planTemplateId: template.id },
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("warns when the plan's group is full and the client went to the waitlist", async () => {
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
    const template = {
      id: "aa000000-0000-4000-8000-000000000001",
      name: "Pilates mensal",
      kind: "recurring",
      totalValueInCents: 45000,
      services: [{ serviceId, totalSessions: 8, totalValueInCents: 45000 }],
      active: true,
    };
    const group = {
      id: "cc000000-0000-4000-8000-000000000001",
      clinicId: patient.clinicId,
      name: "Pilates 01",
      sequence: 1,
      serviceId,
      serviceName: "Pilates",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana",
      roomId: "55555555-5555-4555-8555-555555555555",
      roomName: "Sala Movimento",
      weeklySlots: [{ weekday: 1, startTime: "08:00", endTime: "09:00" }],
      capacity: 4,
      activeEnrollments: 4,
      waitlistCount: 0,
      active: true,
      createdAt: "2026-01-01T12:00:00.000Z",
    };
    const purchases: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/plans/purchases")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        purchases.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            plan: {
              ...(body.plan as object),
              id: "p1",
              patientName: patient.fullName,
              remainingSessions: 8,
              totalSessions: 8,
              status: "active",
            },
            appointments: [],
            enrollment: {
              id: "ee000000-0000-4000-8000-000000000001",
              groupId: group.id,
              patientId: patient.id,
              patientName: patient.fullName,
              status: "waitlisted",
              queuePosition: 2,
              startsOn: "2026-10-01",
              enrolledAt: "2026-10-01T12:00:00.000Z",
            },
          }),
        } as Response;
      }
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plan-templates")
          ? [template]
          : url.includes("/services")
            ? [{ id: serviceId, name: "Pilates", active: true }]
            : url.includes("/groups/workspace")
              ? { groups: [group], enrollments: [], sessions: [] }
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
    const dialog = await screen.findByRole("dialog", {
      name: "Novo plano recorrente",
    });
    await within(dialog).findByRole("option", { name: /Pilates mensal/ });
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: template.id },
    });
    const turma = await within(dialog).findByLabelText("Turma");
    // O seletor avisa que a turma está cheia, como no cadastro guiado.
    expect(
      await within(turma).findByRole("option", {
        name: /^Pilates 01 · .* · turma cheia \(lista de espera\)$/,
      }),
    ).toBeInTheDocument();
    fireEvent.change(turma, { target: { value: group.id } });
    fireEvent.click(
      screen.getByRole("button", { name: "Sim, colocar na lista de espera" }),
    );
    expect(
      within(dialog).getByText(
        "Esta turma está cheia. O cliente será incluído na lista de espera.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() => expect(purchases).toHaveLength(1));
    const toast = await screen.findByText(
      "Plano Pilates mensal vinculado. Turma cheia: Helena entrou na lista de espera de Pilates 01 (posição 2).",
    );
    expect(toast.closest(".toast")).toHaveClass("toast-success");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
