import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.stubGlobal("fetch", vi.fn());
afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
});

describe("application shell", () => {
  it("edits group capacity and weekly hours in a drawer", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const group = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Pilates Turma A",
      sequence: 1,
      serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      capacity: 4,
      activeEnrollments: 2,
      waitlistCount: 0,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
      active: true,
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body = options?.method === "PUT" ? { ...group, capacity: 5 }
        : url.includes("/groups/workspace?") ? { groups: [group], enrollments: [], sessions: [], attendance: [], replacementCredits: [] }
          : url.includes("/rooms") ? [{ id: group.roomId, name: group.roomName, capacity: 8 }]
            : url.includes("/services") ? [{ id: group.serviceId, name: group.serviceName }]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/turmas"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Serviço"), { target: { value: group.serviceId } });
    expect(screen.getByText("Pilates Turma B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar gaveta" }));
    expect(screen.getByText("Turma de terça da noite")).toBeInTheDocument();
    expect(screen.getByText("Terça · 18:00–19:00")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    expect(screen.getByRole("dialog", { name: "Pilates Turma A" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Máximo de pessoas"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar horário" }));
    fireEvent.change(screen.getAllByLabelText("Dia")[1]!, { target: { value: "4" } });
    fireEvent.change(screen.getAllByLabelText("Término")[1]!, { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
      expect(call?.[0]).toContain(`/groups/${group.id}`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ capacity: 5, weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }, { weekday: 4, startTime: "09:00", endTime: "10:30" }] });
    });
  });

  it("shows appointments in the monthly agenda and opens a selected day", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const groupStartsAt = new Date(startsAt);
    groupStartsAt.setHours(18, 0, 0, 0);
    const groupSession = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      groupId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      groupName: "Pilates Turma A",
      professionalName: "Dra. Ana Martins",
      roomName: "Estúdio 1",
      startsAt: groupStartsAt.toISOString(),
      endsAt: new Date(groupStartsAt.getTime() + 60 * 60_000).toISOString(),
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/appointments?") ? [appointment]
        : String(input).includes("/group-sessions?") ? [groupSession] : [],
    }) as Response);

    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    const day = await screen.findByRole("button", { name: /1 atendimentos, 1 aulas de turma, 0 bloqueios/ });
    expect(screen.getByText("Pilates Turma A")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ turmas?$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }));
    expect(screen.getByRole("heading", { name: "Detalhes do atendimento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day);
    const dayDialog = screen.getByRole("dialog");
    expect(dayDialog).toHaveTextContent("2 eventos neste dia.");
    expect(dayDialog).toHaveTextContent("Pilates Turma ADra. Ana Martins · Estúdio 1");
    expect(dayDialog.textContent!.indexOf("Helena Almeida")).toBeLessThan(dayDialog.textContent!.indexOf("Pilates Turma A"));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day.closest(".month-day")!);
    fireEvent.click(screen.getByRole("button", { name: "Abrir dia na agenda" }));
    expect(await screen.findByRole("heading", { name: "Helena Almeida" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Pilates Turma A" })).toHaveTextContent("Dra. Ana Martins · Estúdio 1");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(await screen.findByText("10:00–10:50")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
  });

  it("lists appointments and group classes in chronological order", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const at = (hours: number) => {
      const value = new Date();
      value.setHours(hours, 0, 0, 0);
      return value;
    };
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: at(10).toISOString(),
      endsAt: at(11).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const session = (id: string, groupName: string, hours: number) => ({
      id,
      groupId: id,
      groupName,
      professionalName: "Dr. Paulo Nunes",
      roomName: "Estúdio 1",
      startsAt: at(hours).toISOString(),
      endsAt: at(hours + 1).toISOString(),
      status: "scheduled",
    });
    const sessions = [session("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Pilates Turma B", 18), session("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "Dançaterapia Turma A", 8)];
    vi.mocked(fetch).mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/appointments?") ? [appointment]
        : String(input).includes("/group-sessions?") ? sessions : [],
    }) as Response);
    const order = (container: Element) => {
      const text = container.textContent ?? "";
      return ["Dançaterapia Turma A", "Helena Almeida", "Pilates Turma B"].map((name) => text.indexOf(name));
    };
    const isAscending = (positions: number[]) => positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1]!));

    const { container } = render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    await screen.findByText("Helena Almeida");
    expect(isAscending(order(container.querySelector(".day-agenda")!))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findByText("Helena Almeida");
    expect(isAscending(order(container.querySelector(".week-agenda")!))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    const today = await screen.findByRole("button", { name: /1 atendimentos, 2 aulas de turma/ });
    const cell = today.closest(".month-day")!;
    expect(cell).toHaveTextContent("Dançaterapia Turma A");
    expect(cell.textContent!.indexOf("Dançaterapia Turma A")).toBeLessThan(cell.textContent!.indexOf("Helena Almeida"));
    expect(cell).toHaveTextContent("+1 evento");
  });

  it("shows patient and booking details before cancelling an appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
    }));
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      notes: "Primeira consulta",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body = options?.method === "PATCH"
        ? { ...appointment, status: "cancelled" }
        : url.includes("/appointments?") ? [appointment]
          : url.includes("/patients") ? [{
            id: appointment.patientId,
            fullName: appointment.patientName,
            recordNumber: "PAC-00001",
            phone: "11987654321",
            email: "helena@example.com",
            cpf: "12345678901",
            status: "active",
            tags: ["Retorno"],
          }]
            : url.includes("/services") ? [{ id: appointment.serviceId, durationMinutes: 50, priceInCents: 12000 }]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }));
    expect(screen.getByText("helena@example.com")).toBeInTheDocument();
    expect(screen.getByText("Primeira consulta")).toBeInTheDocument();
    expect(screen.getByText(/50 min/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar atendimento" }));
    expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await vi.waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PATCH");
      expect(call?.[0]).toContain(`/appointments/${appointment.id}/status`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ status: "cancelled" });
    });
    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Detalhes do atendimento" })).not.toBeInTheDocument());
  });

  it("keeps the monthly summary readable and opens detailed lists on demand", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const month = new Date().toLocaleDateString("sv-SE").slice(0, 7);
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (!String(input).includes("/reports/sales?")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          current: {
            from: `${month}-01`,
            to: `${month}-15`,
            netSalesInCents: 120000,
            grossSalesInCents: 130000,
            cancelledSalesInCents: 10000,
            receivedInCents: 90000,
            attendedPatients: 14,
          },
          previousComparable: { from: "2026-08-01", to: "2026-08-15" },
          changePercent: 20,
          sales: [
            {
              id: "sale-1",
              occurredAt: `${month}-10T12:00:00Z`,
              itemName: "Plano de fisioterapia",
              patientName: "Helena Almeida",
              kind: "sale",
              amountInCents: 120000,
            },
          ],
          patientsWithoutReturn: [
            {
              patientId: "patient-1",
              patientName: "Helena Almeida",
              lastCompletedAt: "2026-08-20T15:00:00Z",
            },
          ],
        }),
      } as Response;
    });

    render(<MemoryRouter initialEntries={["/relatorios"]}><App /></MemoryRouter>);
    expect(await screen.findByText("Vendido no mês")).toBeInTheDocument();
    expect(screen.getByText("Dinheiro recebido")).toBeInTheDocument();
    expect(screen.getAllByText("Clientes sem retorno")).toHaveLength(2);
    const details = screen.getByText("Ver vendas e clientes do mês")
      .parentElement as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Ver vendas e clientes do mês"));
    expect(details.open).toBe(true);
    expect(screen.getByText("Helena Almeida")).toBeInTheDocument();
    expect(
      (screen.getByText("Ver outros indicadores da clínica")
        .parentElement as HTMLDetailsElement).open,
    ).toBe(false);
  });

  it("shows monthly sales and patients without return directly on the manager dashboard", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/reports/sales?")
        ? {
            month: "2026-09",
            current: { to: "2026-09-15", netSalesInCents: 120000, receivedInCents: 90000, attendedPatients: 14 },
            changePercent: 20,
            patientsWithoutReturn: [{ patientId: "99999999-9999-4999-8999-999999999999", patientName: "Helena Almeida", lastCompletedAt: "2026-08-20T15:00:00Z" }],
          }
        : { appointmentsToday: 3, completedToday: 1, patientsActive: 40, noShowsThisMonth: 1, nextAppointments: [] };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Vendas e retorno dos clientes" })).toBeInTheDocument();
    expect(screen.getByText(/1\.200,00/)).toBeInTheDocument();
    expect(screen.getByText("+20% vs. mês anterior comparável")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clientes sem retorno" })).toBeInTheDocument();
    expect(screen.getByText("Helena Almeida")).toBeInTheDocument();
    expect(screen.queryByText("Cadastros incompletos")).not.toBeInTheDocument();
  });

  it("shows the login when there is no session", () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Acesse sua clínica" }),
    ).toBeInTheDocument();
  });

  it("opens the SOAP editor for an authenticated clinical user", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const patient = {
        id: "99999999-9999-4999-8999-999999999999",
        fullName: "Helena Almeida",
      };
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
          }
        : url.includes("/clinical-records")
          ? []
          : url.includes("/patients")
            ? [patient]
            : [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  patientId: patient.id,
                  patientName: "Helena Almeida",
                  professionalName: "Dra. Ana Martins",
                  startsAt: new Date().toISOString(),
                  status: "completed",
                },
              ];
      return { ok: true, status: 200, json: async () => body } as Response;
    });

    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Prontuários" }),
    ).toBeInTheDocument();
    const newRecord = await screen.findByRole("button", {
      name: "Nova evolução",
    });
    fireEvent.click(newRecord);
    expect(
      screen.getByRole("heading", { name: "Nova evolução clínica" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/S — Subjetivo/)).toBeInTheDocument();
  });

  it("opens a plan sale with patient and service data", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
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
    fireEvent.click(action);
    expect(
      screen.getByRole("heading", { name: "Novo plano" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cliente")).toHaveValue(
      "99999999-9999-4999-8999-999999999999",
    );
  });

  it("renews a plan with the next period already filled in", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const plan = {
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
    expect(await screen.findByText(/^Automática em 01 de out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renovar" }));
    expect(screen.getByRole("heading", { name: "Renovar plano" })).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Fim da validade")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Primeiro vencimento")).toHaveValue("2026-10-05");
    fireEvent.change(screen.getByLabelText("Valor total"), {
      target: { value: "420" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Renovar plano e gerar parcelas" }),
    );
    expect(await screen.findByText(/^Renovado a partir de 01 de out/)).toBeInTheDocument();
    expect(renewalBody).toMatchObject({
      validFrom: "2026-10-01",
      totalValueInCents: 42000,
      autoRenew: true,
    });
    expect(renewalBody).not.toHaveProperty("patientId");
  });

  it("filters patients by status, tags and record data", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const otherMonth = String((new Date().getMonth() + 1) % 12 + 1).padStart(2, "0");
    const patient = (id: string, fullName: string, extra: Record<string, unknown>) => ({
      id,
      clinicId: "11111111-1111-4111-8111-111111111111",
      recordNumber: `PAC-${id.slice(-3)}`,
      fullName,
      phone: "11987654321",
      tags: [],
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...extra,
    });
    const patients = [
      patient("a0000000-0000-4000-8000-000000000001", "Ana Lima", { tags: ["Pilates"], email: "ana@example.com", birthDate: `1990-${month}-10`, createdAt: "2026-03-01T00:00:00.000Z" }),
      patient("a0000000-0000-4000-8000-000000000002", "Bruno Souza", { tags: ["Fisioterapia"], status: "inactive", birthDate: `1985-${otherMonth}-02` }),
      patient("a0000000-0000-4000-8000-000000000003", "Carla Dias", { tags: ["Pilates", "Frequente"], email: "carla@example.com", createdAt: "2026-02-01T00:00:00.000Z" }),
    ];
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => patients }) as Response);
    // O endereço antigo redireciona para /clientes.
    render(<MemoryRouter initialEntries={["/pacientes"]}><App /></MemoryRouter>);
    const names = () => screen.queryAllByRole("button", { name: /^Editar / }).map((row) => row.getAttribute("aria-label"));
    await screen.findByRole("button", { name: "Editar Ana Lima" });
    expect(names()).toEqual(["Editar Ana Lima", "Editar Bruno Souza", "Editar Carla Dias"]);
    expect(within(screen.getByRole("button", { name: "Editar Bruno Souza" })).getByText("Inativo")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Filtros/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Inativos" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
    expect(names()).toEqual(["Editar Bruno Souza"]);
    expect(screen.getByText("de 3 clientes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pilates/ }));
    expect(names()).toEqual(["Editar Ana Lima", "Editar Carla Dias"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "oldest" } });
    expect(names()).toEqual(["Editar Carla Dias", "Editar Ana Lima"]);
    fireEvent.change(screen.getByLabelText("Cadastro"), { target: { value: "birthday_month" } });
    expect(names()).toEqual(["Editar Ana Lima"]);
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent("2");

    fireEvent.change(screen.getByLabelText("Cadastro"), { target: { value: "without_email" } });
    expect(screen.getByText("Nenhum cliente com esses filtros")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" })[0]!);
    // Limpar mantém a ordenação escolhida (cadastro mais antigo primeiro).
    expect(names()).toEqual(["Editar Bruno Souza", "Editar Carla Dias", "Editar Ana Lima"]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Editar Carla Dias" }), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Editar cliente" })).toBeInTheDocument();
  });

  it("opens a patient record for correction and saves the changed name", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["Retorno"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const body = options?.method === "PUT"
        ? { ...patient, fullName: "Helena Pereira" }
        : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Editar Helena Almeida" }));
    expect(screen.getByRole("heading", { name: "Editar cliente" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Helena Pereira" },
    });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11 90000-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Helena Pereira")).toBeInTheDocument();
    const updateCall = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
    expect(updateCall?.[0]).toContain(`/patients/${patient.id}`);
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      fullName: "Helena Pereira",
      whatsapp: "11900001234",
      tags: ["Retorno"],
    });
  });

  it("lets reception reschedule a visible appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "reception",
      }),
    );
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const next = new Date(start);
    next.setHours(11, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana Martins",
      professionalColor: "#5c6f68",
      roomId: "55555555-5555-4555-8555-555555555555",
      roomName: "Sala Movimento",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 50 * 60_000).toISOString(),
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body = options?.method === "PUT"
        ? { ...appointment, startsAt: next.toISOString() }
        : url.includes("/appointments?")
          ? [appointment]
          : url.includes("/professionals")
            ? [{ id: appointment.professionalId, fullName: appointment.professionalName, color: appointment.professionalColor }]
            : url.includes("/rooms")
              ? [{ id: appointment.roomId, name: appointment.roomName }]
              : url.includes("/services")
                ? [{ id: appointment.serviceId, name: appointment.serviceName }]
                : url.includes("/patients")
                  ? [{ id: appointment.patientId, fullName: appointment.patientName }]
                  : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }));
    fireEvent.click(screen.getByRole("button", { name: "Remarcar atendimento" }));
    expect(screen.getByRole("heading", { name: "Reagendar atendimento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reagendamento" }));
    const updateCall = await vi.waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
      expect(call).toBeDefined();
      return call;
    });
    expect(updateCall?.[0]).toContain(`/appointments/${appointment.id}/schedule`);
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      professionalId: appointment.professionalId,
      roomId: appointment.roomId,
    });
  });

  it("lists suggested contacts, opens WhatsApp and records a contact", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const suggestions = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        reason: "plan_expiring",
        referenceKey: "plan-1:2026-10-05",
        detail: "Plano termina em 3 dias",
        dueDate: "2026-10-05",
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
    ];
    const settings = {
      birthdayDaysAhead: 7,
      singleNoReturnDays: 60,
      planExpiringDays: 7,
      lowBalanceSessions: 2,
      expiredWithBalanceDays: 60,
      treatmentPausedDays: 30,
      repeatedNoShowCount: 2,
      repeatedNoShowWindowDays: 30,
      formerClientMinDays: 30,
      formerClientMaxDays: 90,
      messages: {
        birthday: "Parabéns, {{nome}}!",
        single_no_return: "Oi {{nome}}, sentimos sua falta.",
        plan_expiring: "Oi {{nome}}, seu plano está acabando.",
        low_balance: "x",
        expired_with_balance: "x",
        treatment_paused: "x",
        repeated_no_show: "x",
        former_client: "x",
        overdue_payment: "x",
        nps_detractor: "x",
      },
    };
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => ({ id: "a1", clinicId: "c1", actorUserId: "u1", createdAt: "2026-09-29T12:00:00.000Z", ...activityBody }) } as Response;
      }
      const body = url.includes("/relationship/suggestions") ? suggestions
        : url.includes("/relationship/settings") ? settings
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/relacionamento"]}><App /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Contatos sugeridos/ })).toBeInTheDocument();
    const helenaCard = (await screen.findByText("Helena Almeida")).closest("article")!;
    expect(within(helenaCard).getByText("Plano termina em 3 dias")).toBeInTheDocument();
    expect(within(helenaCard).getByText("(11) 98765-4321")).toBeInTheDocument();
    const whatsapp = within(helenaCard).getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp).toHaveAttribute("href", `https://wa.me/5511911112222?text=${encodeURIComponent("Oi Helena, seu plano está acabando.")}`);
    expect(whatsapp).toHaveAttribute("target", "_blank");
    const brunoCard = screen.getByText("Bruno Souza").closest("article")!;
    expect(within(brunoCard).getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", `https://wa.me/5511955556666?text=${encodeURIComponent("Oi Bruno, sentimos sua falta.")}`);

    const filters = screen.getByRole("group", { name: "Situação" });
    expect(within(filters).getByRole("button", { name: /Todas\s*2/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(filters).getByRole("button", { name: /Plano acabando\s*1/ }));
    expect(screen.queryByText("Bruno Souza")).not.toBeInTheDocument();
    fireEvent.click(within(filters).getByRole("button", { name: /Todas/ }));

    fireEvent.click(within(helenaCard).getByRole("button", { name: "Registrar contato" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar contato" });
    expect(within(dialog).queryByLabelText("Adiar até")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Resultado"), { target: { value: "snoozed" } });
    fireEvent.change(within(dialog).getByLabelText("Adiar até"), { target: { value: "2099-01-10" } });
    fireEvent.change(within(dialog).getByLabelText("Observação"), { target: { value: "Pediu para ligar depois" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar contato" }));
    await vi.waitFor(() => expect(screen.queryByText("Helena Almeida")).not.toBeInTheDocument());
    expect(activityBody).toEqual({
      patientId: suggestions[0]!.patientId,
      reason: "plan_expiring",
      referenceKey: "plan-1:2026-10-05",
      outcome: "snoozed",
      notes: "Pediu para ligar depois",
      snoozeUntil: "2099-01-10",
    });
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /Todas\s*1/ })).toBeInTheDocument();
  });

  it("shows upcoming birthdays on the dashboard with congratulations and a sent marker", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const suggestions = [
      { patientId: "99999999-9999-4999-8999-999999999999", patientName: "Helena Almeida", phone: "11987654321", whatsapp: "11911112222", reason: "birthday", referenceKey: "99999999-9999-4999-8999-999999999999:2026", detail: "Aniversário hoje", dueDate: "2026-10-10", priority: 1 },
      { patientId: "77777777-7777-4777-8777-777777777777", patientName: "Carla Dias", phone: "11933334444", reason: "birthday", referenceKey: "77777777-7777-4777-8777-777777777777:2026", detail: "Aniversário em 3 dias (13/10)", dueDate: "2026-10-13", priority: 2 },
      { patientId: "88888888-8888-4888-8888-888888888888", patientName: "Bruno Souza", phone: "11955556666", reason: "single_no_return", referenceKey: "appt-9", detail: "Veio uma vez", priority: 3 },
    ];
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => ({ id: "a1", ...activityBody }) } as Response;
      }
      const body = url.includes("/relationship/suggestions") ? suggestions
        : url.includes("/relationship/settings") ? relationshipSettingsFixture()
          : url.includes("/dashboard") ? { appointmentsToday: 0, completedToday: 0, patientsActive: 3, noShowsThisMonth: 0, nextAppointments: [] }
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    const card = (await screen.findByRole("heading", { name: "Aniversariantes" })).closest("section")!;
    expect(card).toHaveTextContent("Hoje e próximos 7 dias");
    const helena = (await within(card).findByText("Helena Almeida")).closest(".attention-item") as HTMLElement;
    expect(within(helena).getByText("Aniversário hoje")).toBeInTheDocument();
    const congratulate = within(helena).getByRole("link", { name: /Dar parabéns/ });
    expect(congratulate).toHaveAttribute("href", `https://wa.me/5511911112222?text=${encodeURIComponent("Parabéns, Helena!")}`);
    expect(congratulate).toHaveAttribute("target", "_blank");
    const carla = within(card).getByText("Carla Dias").closest(".attention-item") as HTMLElement;
    expect(within(carla).getByRole("link", { name: /Dar parabéns/ })).toHaveAttribute("href", `https://wa.me/5511933334444?text=${encodeURIComponent("Parabéns, Carla!")}`);
    expect(within(card).queryByText("Bruno Souza")).not.toBeInTheDocument();
    fireEvent.click(within(helena).getByRole("button", { name: "Marcar como enviado" }));
    await vi.waitFor(() => expect(within(card).queryByText("Helena Almeida")).not.toBeInTheDocument());
    expect(activityBody).toEqual({
      patientId: "99999999-9999-4999-8999-999999999999",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      outcome: "contacted",
    });
    expect(within(card).getByText("Carla Dias")).toBeInTheDocument();
  });

  it("does not load birthdays on the dashboard for physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Ana Martins", email: "fisio@movimenta.local", role: "physiotherapist" }));
    vi.mocked(fetch).mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes("/dashboard") ? { appointmentsToday: 0, completedToday: 0, patientsActive: 3, noShowsThisMonth: 0, nextAppointments: [] } : [],
    }) as Response);
    render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
    expect(await screen.findByText("Atendimentos hoje")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aniversariantes" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/relationship/"))).toBe(false);
  });

  it("lists the month's birthdays in the relationship page with a month picker", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 7);
    const entries = [
      { patientId: "99999999-9999-4999-8999-999999999999", patientName: "Helena Almeida", phone: "11987654321", whatsapp: "11911112222", birthDate: "1990-02-03", date: "2027-02-03", day: 3, ageTurning: 37, referenceKey: "99999999-9999-4999-8999-999999999999:2027", congratulated: false },
      { patientId: "88888888-8888-4888-8888-888888888888", patientName: "Bruno Souza", phone: "11955556666", birthDate: "2000-02-29", date: "2027-02-28", day: 28, ageTurning: 27, referenceKey: "88888888-8888-4888-8888-888888888888:2027", congratulated: true },
    ];
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => ({ id: "a1", ...activityBody }) } as Response;
      }
      const body = url.includes("/relationship/birthdays?month=2027-02") ? entries
        : url.includes("/relationship/settings") ? relationshipSettingsFixture()
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/relacionamento"]}><App /></MemoryRouter>);
    const tabs = await screen.findByRole("group", { name: "Visão" });
    expect(within(tabs).getByRole("button", { name: "Contatos sugeridos" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(tabs).getByRole("button", { name: "Aniversários do mês" }));
    const monthInput = await screen.findByLabelText("Mês");
    expect(monthInput).toHaveValue(currentMonth);
    await vi.waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes(`/relationship/birthdays?month=${currentMonth}`))).toBe(true));
    expect(await screen.findByText("Nenhum aniversariante neste mês")).toBeInTheDocument();
    fireEvent.change(monthInput, { target: { value: "2027-02" } });
    const helena = (await screen.findByText("Helena Almeida")).closest("article")!;
    expect(helena).toHaveTextContent("03 de fev.");
    expect(helena).toHaveTextContent("Completa 37 anos");
    expect(within(helena).getByRole("link", { name: /Dar parabéns/ })).toHaveAttribute("href", `https://wa.me/5511911112222?text=${encodeURIComponent("Parabéns, Helena!")}`);
    const bruno = screen.getByText("Bruno Souza").closest("article")!;
    expect(bruno).toHaveTextContent("28 de fev.");
    expect(within(bruno).getByText("Parabéns enviado")).toBeInTheDocument();
    expect(within(bruno).queryByRole("button", { name: "Marcar como enviado" })).not.toBeInTheDocument();
    fireEvent.click(within(helena).getByRole("button", { name: "Marcar como enviado" }));
    expect(await within(helena).findByText("Parabéns enviado")).toBeInTheDocument();
    expect(activityBody).toEqual({
      patientId: "99999999-9999-4999-8999-999999999999",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2027",
      outcome: "contacted",
    });
  });

  it("hides suggested contacts from physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Ana Martins", email: "fisio@movimenta.local", role: "physiotherapist" }));
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response);
    render(<MemoryRouter initialEntries={["/relacionamento"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: /Contatos sugeridos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contatos sugeridos" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/relationship/"))).toBe(false);
  });
  it("lets the owner edit relationship deadlines and messages in settings", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const settings = relationshipSettingsFixture();
    let putBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/settings") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return { ok: true, status: 200, json: async () => putBody } as Response;
      }
      const body = url.includes("/relationship/settings") ? settings
        : url.includes("/admin/clinic-settings") ? null
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/configuracoes"]}><App /></MemoryRouter>);
    const section = (await screen.findByRole("heading", { name: "Prazos e mensagens" })).closest("section")!;
    expect(within(section).getByText("{{nome}}")).toBeInTheDocument();
    expect(section).toHaveTextContent("primeiro nome do cliente");
    const planDays = await within(section).findByLabelText("Plano acabando: avisar quantos dias antes do fim");
    expect(planDays).toHaveValue(7);
    fireEvent.change(planDays, { target: { value: "10" } });
    fireEvent.change(within(section).getByLabelText("Mensagem: Aniversário"), { target: { value: "Feliz aniversário, {{nome}}!" } });
    fireEvent.click(within(section).getByRole("button", { name: "Salvar prazos e mensagens" }));
    await vi.waitFor(() => expect(putBody).toBeDefined());
    expect(putBody).toEqual({
      ...settings,
      planExpiringDays: 10,
      messages: { ...settings.messages, birthday: "Feliz aniversário, {{nome}}!" },
    });
    expect(await within(section).findByText("Prazos e mensagens salvos.")).toBeInTheDocument();
  });

  it("shows relationship settings read-only to reception", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const settings = relationshipSettingsFixture();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/settings") ? settings : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/configuracoes"]}><App /></MemoryRouter>);
    const section = (await screen.findByRole("heading", { name: "Prazos e mensagens" })).closest("section")!;
    const planDays = await within(section).findByLabelText("Plano acabando: avisar quantos dias antes do fim");
    expect(planDays).toHaveValue(7);
    expect(planDays).toHaveAttribute("readonly");
    expect(within(section).getByLabelText("Mensagem: Veio uma vez")).toHaveValue("Oi {{nome}}, sentimos sua falta.");
    expect(within(section).getByLabelText("Mensagem: Veio uma vez")).toHaveAttribute("readonly");
    expect(within(section).queryByRole("button", { name: "Salvar prazos e mensagens" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usuários" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/admin/"))).toBe(false);
  });

  it("does not show relationship settings to physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Ana Martins", email: "fisio@movimenta.local", role: "physiotherapist" }));
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response);
    render(<MemoryRouter initialEntries={["/configuracoes"]}><App /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Prazos e mensagens" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/relationship/"))).toBe(false);
  });

  it("shows the professional CREFITO in the clinical list and print summary", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const patient = { id: "99999999-9999-4999-8999-999999999999", fullName: "Helena Almeida", recordNumber: 12 };
    const record = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: patient.id,
      professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "finalized",
      version: 2,
      authorName: "Mariana Costa",
      patientName: "Helena Almeida",
      professionalName: "Dra. Ana Martins",
      professionalCrefito: "CREFITO-3 123456-F",
      appointmentStartsAt: new Date().toISOString(),
      subjective: "Relato",
      objective: "Exame",
      assessment: "Evolução positiva",
      plan: "Manter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-workspace/")
        ? { patient, records: [record], templates: [], assessments: [], goals: [], measurements: [], closures: [], attachments: [], addenda: [] }
        : url.includes("/clinical-records") ? [record]
          : url.includes("/patients") ? [patient]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/prontuarios"]}><App /></MemoryRouter>);
    expect(await screen.findByText("Dra. Ana Martins · CREFITO-3 123456-F · versão 2")).toBeInTheDocument();
    const summary = (await screen.findByText("Prontuário longitudinal")).closest(".clinical-print-summary")!;
    expect(summary).toHaveTextContent("Dra. Ana Martins · CREFITO-3 123456-F");
  });

  it("issues a document with an optional professional", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const template = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Declaração", kind: "attendance_declaration", version: 1, body: "Declaração", active: true, createdAt: new Date().toISOString() };
    const patient = { id: "99999999-9999-4999-8999-999999999999", fullName: "Helena Almeida" };
    const professional = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", fullName: "Dra. Ana Martins", crefito: "CREFITO-3 123456-F", active: true };
    const posted: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/documents") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { ok: true, status: 201, json: async () => ({ id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0" }) } as Response;
      }
      const body = url.includes("/document-templates") ? [template]
        : url.includes("/patients") ? [patient]
          : url.includes("/professionals") ? [professional]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/documentos"]}><App /></MemoryRouter>);
    expect(await screen.findByText(/\{\{profissional_nome\}\}/)).toBeInTheDocument();
    expect(screen.getByText(/\{\{profissional_crefito\}\}/)).toBeInTheDocument();
    const select = await screen.findByLabelText("Profissional (opcional)");
    expect(within(select).getByRole("option", { name: "Dra. Ana Martins · CREFITO-3 123456-F" })).toBeInTheDocument();
    const issue = screen.getByRole("button", { name: "Criar rascunho" });
    fireEvent.click(issue);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty("professionalId");
    fireEvent.change(select, { target: { value: professional.id } });
    fireEvent.click(issue);
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({ templateId: template.id, patientId: patient.id, professionalId: professional.id });
  });

  it("records patient satisfaction on a completed appointment and hides the button afterwards", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "reception",
    }));
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.includes("/satisfaction") && options?.method === "POST") {
        const payload = JSON.parse(String(options.body)) as Record<string, unknown>;
        return { ok: true, status: 201, json: async () => ({ id: "s-1", clinicId: "c-1", patientName: appointment.patientName, actorUserId: "u-1", createdAt: new Date().toISOString(), ...payload }) } as Response;
      }
      const body = url.includes("/satisfaction?")
        ? { from: "2026-09-01", to: "2026-09-30", surveys: [{ id: "s-0", appointmentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", patientId: appointment.patientId, score: 10 }], summary: { total: 1, promoters: 1, passives: 0, detractors: 0, nps: 100 } }
        : url.includes("/appointments?") ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }));
    expect(screen.queryByRole("button", { name: "Cancelar atendimento" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Registrar satisfação" }));
    expect(screen.getByRole("heading", { name: "Registrar satisfação" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Salvar avaliação" });
    expect(save).toBeDisabled();
    for (let score = 0; score <= 10; score += 1) {
      expect(screen.getByRole("button", { name: `Nota ${score}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Nota 9" }));
    expect(screen.getByRole("button", { name: "Nota 9" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), { target: { value: "Ótimo atendimento" } });
    fireEvent.click(save);
    await vi.waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST");
      expect(call?.[0]).toContain("/satisfaction");
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        score: 9,
        comment: "Ótimo atendimento",
      });
    });
    expect(await screen.findByRole("heading", { name: "Detalhes do atendimento" })).toBeInTheDocument();
    expect(screen.getByText("Satisfação registrada: nota 9")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar satisfação" })).not.toBeInTheDocument();
  });

  it("hides the satisfaction button when the appointment already has a survey", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
    }));
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/satisfaction?")
        ? { from: "2026-09-01", to: "2026-09-30", surveys: [{ id: "s-0", appointmentId: appointment.id, patientId: appointment.patientId, score: 6 }], summary: { total: 1, promoters: 0, passives: 0, detractors: 1, nps: -100 } }
        : url.includes("/appointments?") ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }));
    expect(await screen.findByText("Satisfação registrada: nota 6")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar satisfação" })).not.toBeInTheDocument();
    const call = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes("/satisfaction?"));
    expect(String(call?.[0])).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });

  it("does not offer satisfaction on appointments that are not completed", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
    }));
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments?") ? [appointment] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }));
    expect(screen.getByRole("button", { name: "Cancelar atendimento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar satisfação" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/satisfaction"))).toBe(false);
  });

  it("shows the NPS card on the reports page for the filtered period", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
    }));
    const today = new Date().toLocaleDateString("sv-SE");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("/satisfaction?")) {
        return { ok: false, status: 503, json: async () => ({ message: "Dados indisponíveis" }) } as Response;
      }
      const body = url.includes("from=2026-01-01")
        ? { from: "2026-01-01", to: "2026-01-31", surveys: [], summary: { total: 0, promoters: 0, passives: 0, detractors: 0, nps: null } }
        : { from: `${today.slice(0, 8)}01`, to: today, surveys: [], summary: { total: 4, promoters: 2, passives: 1, detractors: 1, nps: 25 } };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/relatorios"]}><App /></MemoryRouter>);
    expect(await screen.findByText("4 respostas · 2 promotores · 1 neutros · 1 detratores")).toBeInTheDocument();
    const card = screen.getByText("Satisfação (NPS)").closest("article") as HTMLElement;
    expect(within(card).getByText("25")).toBeInTheDocument();
    const first = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes("/satisfaction?"));
    expect(String(first?.[0])).toContain(`from=${today.slice(0, 8)}01&to=${today}`);
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(await screen.findByText("0 respostas · 0 promotores · 0 neutros · 0 detratores")).toBeInTheDocument();
    const updated = screen.getByText("Satisfação (NPS)").closest("article") as HTMLElement;
    expect(within(updated).getByText("—")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/satisfaction?from=2026-01-01&to=2026-01-31"))).toBe(true);
  });
});

function relationshipSettingsFixture() {
  return {
    birthdayDaysAhead: 7,
    singleNoReturnDays: 60,
    planExpiringDays: 7,
    lowBalanceSessions: 2,
    expiredWithBalanceDays: 60,
    treatmentPausedDays: 30,
    repeatedNoShowCount: 2,
    repeatedNoShowWindowDays: 30,
    formerClientMinDays: 30,
    formerClientMaxDays: 90,
    messages: {
      birthday: "Parabéns, {{nome}}!",
      single_no_return: "Oi {{nome}}, sentimos sua falta.",
      plan_expiring: "Oi {{nome}}, seu plano está acabando.",
      low_balance: "x",
      expired_with_balance: "x",
      treatment_paused: "x",
      repeated_no_show: "x",
      former_client: "x",
      overdue_payment: "x",
      nps_detractor: "x",
    },
  };
}
