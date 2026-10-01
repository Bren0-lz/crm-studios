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

  it("shows the patient history with values and a filter by type", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Paula Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const patient = { id: "99999999-9999-4999-8999-999999999999", recordNumber: "PAC-00001", fullName: "Helena Almeida", phone: "11987654321", tags: [], status: "active" };
    const timeline = [
      { id: "appointment:1", kind: "appointment", occurredAt: "2026-09-20T13:00:00.000Z", title: "Atendimento de Pilates", detail: "Com Dra. Ana Martins", status: "completed" },
      { id: "payment_reversal:2", kind: "payment_reversal", occurredAt: "2026-09-12T13:00:00.000Z", title: "Pagamento estornado", amountInCents: -18000 },
      { id: "payment:3", kind: "payment", occurredAt: "2026-09-10T13:00:00.000Z", title: "Pagamento recebido", detail: "Pix", amountInCents: 18000 },
      { id: "satisfaction:4", kind: "satisfaction", occurredAt: "2026-09-05T13:00:00.000Z", title: "Avaliação de satisfação", score: 9 },
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/timeline") ? timeline : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Editar Helena Almeida" }));
    const history = await screen.findByRole("region", { name: "Histórico" });
    expect(await within(history).findByText("Atendimento de Pilates")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes(`/patients/${patient.id}/timeline`))).toBe(true);
    expect(within(history).getByText("Com Dra. Ana Martins")).toBeInTheDocument();
    expect(within(history).getByText(/^R\$\s*180,00$/)).toBeInTheDocument();
    expect(within(history).getByText(/^-\s*R\$\s*180,00$/)).toBeInTheDocument();
    expect(within(history).getByText("Nota 9")).toBeInTheDocument();
    expect(within(history).getByText(/20 de set\./)).toBeInTheDocument();
    fireEvent.click(within(history).getByRole("button", { name: "Pagamentos" }));
    expect(within(history).getByText("Pagamento recebido")).toBeInTheDocument();
    expect(within(history).getByText("Pagamento estornado")).toBeInTheDocument();
    expect(within(history).queryByText("Atendimento de Pilates")).not.toBeInTheDocument();
    expect(within(history).queryByText("Avaliação de satisfação")).not.toBeInTheDocument();
    fireEvent.click(within(history).getByRole("button", { name: "Todos" }));
    expect(within(history).getByText("Atendimento de Pilates")).toBeInTheDocument();
  });

  it("does not load the patient history for physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Ana Martins", email: "fisio@movimenta.local", role: "physiotherapist" }));
    const patient = { id: "99999999-9999-4999-8999-999999999999", recordNumber: "PAC-00001", fullName: "Helena Almeida", phone: "11987654321", tags: [], status: "active" };
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [patient] }) as Response);
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Editar Helena Almeida" }));
    expect(screen.getByRole("heading", { name: "Editar cliente" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Histórico" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/timeline"))).toBe(false);
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

  it("no longer offers the documents page", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [] }) as Response);
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Comunicações" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Documentos" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/document"))).toBe(false);
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

  it("shows the trials card with the conversion of the filtered period", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
    }));
    const report = (trials: { scheduled: number; completed: number; converted: number; conversionRate: number }) => ({
      from: "2026-01-01",
      to: "2026-01-31",
      generatedAt: "2026-01-31T12:00:00.000Z",
      appointments: { total: 0, completed: 0, noShows: 0, cancelled: 0, attendanceRate: 0, byVisitType: { regular: 0, trial: 0, evaluation: 0 } },
      trials,
      plans: { active: 0, availableSessions: 0, consumedInPeriod: 0 },
      finance: { openInCents: 0, overdueInCents: 0, paidInPeriodInCents: 0 },
      commercial: { leadsCreated: 0, won: 0, lost: 0, conversionRate: 0, averageFirstResponseMinutes: 0 },
      byProfessional: [],
      byService: [],
      bySource: [],
      profitability: {
        dre: { serviceRevenueInCents: 0, productRevenueInCents: 0, grossRevenueInCents: 0, productCostInCents: 0, grossProfitInCents: 0, operatingExpensesInCents: 0, commissionsInCents: 0, netResultInCents: 0, netMargin: 0 },
        byService: [],
        byProduct: [],
        operational: { groupOccupancyRate: 0, activeGroupSeats: 0, totalGroupCapacity: 0, waitlistCount: 0, lowStockCount: 0, productUnitsSold: 0, averageReceiptInCents: 0 },
      },
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/reports/management?from=2026-01-01")) {
        return { ok: true, status: 200, json: async () => report({ scheduled: 2, completed: 0, converted: 0, conversionRate: 0 }) } as Response;
      }
      if (url.includes("/reports/management?")) {
        return { ok: true, status: 200, json: async () => report({ scheduled: 6, completed: 4, converted: 3, conversionRate: 75 }) } as Response;
      }
      return { ok: false, status: 503, json: async () => ({ message: "Dados indisponíveis" }) } as Response;
    });
    render(<MemoryRouter initialEntries={["/relatorios"]}><App /></MemoryRouter>);
    expect(
      await screen.findByText("6 agendadas · 4 concluídas · 3 viraram plano em até 30 dias"),
    ).toBeInTheDocument();
    const card = screen.getByText("Experimentais").closest("article") as HTMLElement;
    expect(within(card).getByText("75%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(
      await screen.findByText("2 agendadas · nenhuma concluída no período"),
    ).toBeInTheDocument();
    const updated = screen.getByText("Experimentais").closest("article") as HTMLElement;
    expect(within(updated).getByText("—")).toBeInTheDocument();
  });

  it("tells when the trials card could not be loaded", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Mariana Costa",
      email: "admin@movimenta.local",
      role: "owner",
    }));
    vi.mocked(fetch).mockImplementation(async () =>
      ({ ok: false, status: 503, json: async () => ({ message: "Dados indisponíveis" }) }) as Response,
    );
    render(<MemoryRouter initialEntries={["/relatorios"]}><App /></MemoryRouter>);
    expect(
      await screen.findByText("Não foi possível carregar as experimentais."),
    ).toBeInTheDocument();
  });

  it("previews a patient spreadsheet, imports the same file and reloads the list", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Paula Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const existing = { id: "99999999-9999-4999-8999-999999999999", recordNumber: "PAC-00001", fullName: "Helena Almeida", phone: "11987654321", tags: [], status: "active" };
    const imported = { ...existing, id: "88888888-8888-4888-8888-888888888888", recordNumber: "PAC-00002", fullName: "Ana Lima", phone: "11999990000" };
    let patients = [existing];
    const analysis = {
      rows: [
        { line: 2, status: "valid", fullName: "Ana Lima", phone: "11999990000", input: { fullName: "Ana Lima", phone: "11999990000", tags: [], status: "active" } },
        { line: 3, status: "error", fullName: "", phone: "123", errors: ["Informe o nome.", "Telefone inválido."] },
        { line: 4, status: "duplicate", fullName: "Helena A.", phone: "11987654321", duplicateOf: { kind: "existing", field: "phone", patientId: existing.id, fullName: "Helena Almeida" } },
        { line: 5, status: "duplicate", fullName: "Ana Lima", phone: "11999990000", duplicateOf: { kind: "row", field: "phone", line: 2 } },
      ],
      errors: [],
      totals: { valid: 1, error: 1, duplicate: 2 },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/patients/import/preview") ? analysis
        : url.endsWith("/patients/import") ? (patients = [existing, imported], { created: 1, skipped: 2, errors: 1 })
          : patients;
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    const template = within(dialog).getByRole("link", { name: /Baixar modelo/ });
    expect(template).toHaveAttribute("download", "modelo-clientes.csv");
    const templateText = decodeURIComponent(template.getAttribute("href")!.split(",").slice(1).join(","));
    expect(templateText.startsWith("\uFEFFnome;cpf;telefone;whatsapp;email;nascimento;etiquetas;observações")).toBe(true);
    expect(within(dialog).getByRole("button", { name: /Importar \d+ cliente/ })).toBeDisabled();

    const content = "nome;telefone\nAna Lima;11999990000\n;123\nHelena A.;11987654321\nAna Lima;11999990000\n";
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: { files: [new File([content], "clientes.csv", { type: "text/csv" })] },
    });
    expect(await within(dialog).findByText("1 válido")).toBeInTheDocument();
    expect(within(dialog).getByText("1 com erro")).toBeInTheDocument();
    expect(within(dialog).getByText("2 duplicados")).toBeInTheDocument();
    expect(within(dialog).getByText("Informe o nome. Telefone inválido.")).toBeInTheDocument();
    expect(within(dialog).getByText("Já cadastrado: Helena Almeida (mesmo telefone)")).toBeInTheDocument();
    expect(within(dialog).getByText("Repete a linha 2 (mesmo telefone)")).toBeInTheDocument();
    const previewCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/patients/import/preview"));
    const expectedFile = { fileName: "clientes.csv", contentBase64: btoa(content) };
    expect(previewCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(previewCall?.[1]?.body))).toEqual(expectedFile);

    fireEvent.click(within(dialog).getByRole("button", { name: "Importar 1 cliente" }));
    expect(await screen.findByText("1 cliente importado, 2 ignorados por duplicidade e 1 com erro.")).toBeInTheDocument();
    const importCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/patients/import"));
    expect(importCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual(expectedFile);
    expect(await screen.findByRole("button", { name: "Editar Ana Lima" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/patients?search=")).length).toBe(2);
  });

  it("shows general spreadsheet errors and keeps import disabled", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).endsWith("/patients/import/preview")
        ? { rows: [], errors: ["A planilha precisa de uma coluna de nome."], totals: { valid: 0, error: 0, duplicate: 0 } }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Importar" }));
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: { files: [new File(["telefone\n11999990000\n"], "clientes.csv", { type: "text/csv" })] },
    });
    expect(await within(dialog).findByText("A planilha precisa de uma coluna de nome.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Importar 0 clientes" })).toBeDisabled();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/patients/import"))).toBe(false);
  });

  it("does not offer patient import to physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Ana Martins", email: "fisio@movimenta.local", role: "physiotherapist" }));
    const patient = { id: "99999999-9999-4999-8999-999999999999", recordNumber: "PAC-00001", fullName: "Helena Almeida", phone: "11987654321", tags: [], status: "active" };
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [patient] }) as Response);
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    expect(screen.getByRole("button", { name: /Novo cliente/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/patients/import"))).toBe(false);
  });

  it("lets the owner list, create and delete holidays in settings", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const existing = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", clinicId: "11111111-1111-4111-8111-111111111111", date: "2026-12-25", name: "Natal", createdAt: "2026-09-01T12:00:00.000Z" };
    const created = { ...existing, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", date: "2026-11-15", name: "Proclamação da República" };
    let postBody: Record<string, unknown> | undefined;
    let duplicate = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/holidays") && init?.method === "POST") {
        if (duplicate) {
          return { ok: false, status: 409, json: async () => ({ code: "HOLIDAY_DUPLICATE", message: "Já existe um feriado cadastrado nesta data." }) } as Response;
        }
        postBody = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      if (url.includes("/holidays/") && init?.method === "DELETE") {
        // 204 sem corpo: ler JSON aqui falharia, como no navegador.
        return { ok: true, status: 204, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } } as unknown as Response;
      }
      const body = url.includes("/holidays") ? [existing]
        : url.includes("/relationship/settings") ? relationshipSettingsFixture()
          : url.includes("/admin/clinic-settings") ? null
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemoryRouter initialEntries={["/configuracoes"]}><App /></MemoryRouter>);
    const section = (await screen.findByRole("heading", { name: "Feriados" })).closest("section")!;
    expect(await within(section).findByText("Natal")).toBeInTheDocument();
    expect(within(section).getByText("25/12/2026")).toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText("Data"), { target: { value: "2026-11-15" } });
    fireEvent.change(within(section).getByLabelText("Nome do feriado"), { target: { value: "Proclamação da República" } });
    fireEvent.click(within(section).getByRole("button", { name: "Adicionar feriado" }));
    expect(await within(section).findByText("Proclamação da República")).toBeInTheDocument();
    expect(postBody).toEqual({ date: "2026-11-15", name: "Proclamação da República" });
    // Lista em ordem crescente de data e formulário limpo para o próximo cadastro.
    expect(section.textContent!.indexOf("15/11/2026")).toBeLessThan(section.textContent!.indexOf("25/12/2026"));
    expect(within(section).getByLabelText("Nome do feriado")).toHaveValue("");

    duplicate = true;
    fireEvent.change(within(section).getByLabelText("Data"), { target: { value: "2026-12-25" } });
    fireEvent.change(within(section).getByLabelText("Nome do feriado"), { target: { value: "Natal de novo" } });
    fireEvent.click(within(section).getByRole("button", { name: "Adicionar feriado" }));
    expect(await within(section).findByText("Já existe um feriado cadastrado nesta data.")).toBeInTheDocument();

    fireEvent.click(within(section).getByRole("button", { name: "Excluir feriado Natal" }));
    expect(confirm).toHaveBeenCalled();
    await vi.waitFor(() => expect(within(section).queryByText("Natal")).not.toBeInTheDocument());
    const deleteCall = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "DELETE");
    expect(deleteCall?.[0]).toContain(`/holidays/${existing.id}`);
    expect(within(section).getByText("Proclamação da República")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("shows an empty state when there are no holidays", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/settings") ? relationshipSettingsFixture()
        : url.includes("/admin/clinic-settings") ? null
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/configuracoes"]}><App /></MemoryRouter>);
    const section = (await screen.findByRole("heading", { name: "Feriados" })).closest("section")!;
    expect(await within(section).findByText("Nenhum feriado cadastrado")).toBeInTheDocument();
  });

  it("does not show the holidays section to reception", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/relationship/settings") ? relationshipSettingsFixture() : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/configuracoes"]}><App /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Prazos e mensagens" });
    expect(screen.queryByRole("heading", { name: "Feriados" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/holidays"))).toBe(false);
  });

  it("marks holidays in the day, week and month agenda and shows the API error when booking on one", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const holiday = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", clinicId: "11111111-1111-4111-8111-111111111111", date: today, name: "Aniversário da cidade", createdAt: "2026-09-01T12:00:00.000Z" };
    const message = "Não é possível agendar em 01/01/2027: é feriado (Aniversário da cidade).";
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        return { ok: false, status: 409, json: async () => ({ code: "HOLIDAY", message }) } as Response;
      }
      const body = url.includes("/holidays") ? [holiday]
        : url.includes("/professionals") ? [{ id: "33333333-3333-4333-8333-333333333333", fullName: "Dra. Ana Martins", color: "#5c6f68" }]
          : url.includes("/rooms") ? [{ id: "55555555-5555-4555-8555-555555555555", name: "Sala Movimento" }]
            : url.includes("/services") ? [{ id: "77777777-7777-4777-8777-777777777777", name: "Fisioterapia individual", priceInCents: 12000 }]
              : url.includes("/patients") ? [{ id: "99999999-9999-4999-8999-999999999999", fullName: "Helena Almeida" }]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);

    // Dia: aviso com o nome, mesmo sem atendimentos.
    expect(await screen.findByText("Feriado: Aniversário da cidade")).toBeInTheDocument();
    const holidayCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/holidays"));
    expect(String(holidayCall?.[0])).toContain(`/holidays?from=${today}&to=${today}`);

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await vi.waitFor(() => expect(container.querySelector(".week-agenda")).toHaveTextContent("Feriado: Aniversário da cidade"));
    expect(container.querySelectorAll(".week-agenda .week-holiday")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    const day = await screen.findByRole("button", { name: /feriado: Aniversário da cidade/ });
    expect(day.closest(".month-day")).toHaveTextContent("Aniversário da cidade");
    expect(container.querySelectorAll(".month-grid .month-holiday")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar atendimento" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Novo atendimento" })).toBeInTheDocument();
  });

  it("shows trial and evaluation badges in the agenda and hides client actions on lead appointments", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const base = {
      professionalColor: "#5c6f68",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
    };
    const leadAppointment = { ...base, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", leadId: "44444444-4444-4444-8444-444444444444", leadName: "Bruna Lead", patientName: "Bruna Lead", visitType: "trial", startsAt: startsAt.toISOString() };
    const later = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const clientAppointment = { ...base, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", patientId: "99999999-9999-4999-8999-999999999999", patientName: "Helena Almeida", visitType: "evaluation", status: "scheduled", startsAt: later.toISOString(), endsAt: new Date(later.getTime() + 50 * 60_000).toISOString() };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments?") ? [leadAppointment, clientAppointment] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    const leadCard = await screen.findByRole("button", { name: "Detalhes de Bruna Lead" });
    expect(within(leadCard).getByText("Experimental · lead")).toBeInTheDocument();
    const clientCard = screen.getByRole("button", { name: "Detalhes de Helena Almeida" });
    expect(within(clientCard).getByText("Avaliação")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await vi.waitFor(() => expect(container.querySelector(".week-agenda")).toHaveTextContent("Experimental · lead"));
    expect(container.querySelector(".week-agenda")).toHaveTextContent("Avaliação");

    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Bruna Lead" }));
    const dialog = screen.getByRole("dialog", { name: "Detalhes do atendimento" });
    expect(within(dialog).getByText("Experimental · lead")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Lead" })).toBeInTheDocument();
    expect(within(dialog).getByText("Bruna Lead", { selector: "strong" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: "Dados do cliente" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Prontuário")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Registrar satisfação" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Histórico/ })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/satisfaction"))).toBe(false);
    expect(within(dialog).queryByRole("button", { name: "SOS" })).not.toBeInTheDocument();
  });

  it("opens the SOS panel with the emergency contact from a client appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Ana Martins", email: "fisio@movimenta.local", role: "physiotherapist" }));
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
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const patient = {
      id: appointment.patientId,
      fullName: "Helena Almeida",
      recordNumber: "PAC-00001",
      phone: "11987654321",
      emergencyContactName: "Maria Souza (mãe)",
      emergencyContactPhone: "11955556666",
      status: "active",
      tags: [],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/appointments?") ? [appointment] : url.includes("/patients") ? [patient] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }));
    const dialog = screen.getByRole("dialog", { name: "Detalhes do atendimento" });
    expect(within(dialog).queryByRole("region", { name: "SOS" })).not.toBeInTheDocument();
    const sosButton = within(dialog).getByRole("button", { name: "SOS" });
    expect(sosButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(sosButton);
    expect(sosButton).toHaveAttribute("aria-expanded", "true");
    const sos = within(dialog).getByRole("region", { name: "SOS" });
    expect(within(sos).getByText("Maria Souza (mãe)")).toBeInTheDocument();
    expect(within(sos).getByText("(11) 95555-6666")).toBeInTheDocument();
    expect(within(sos).getByRole("link", { name: /Ligar/ })).toHaveAttribute("href", "tel:11955556666");
    const whatsapp = within(sos).getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5511955556666/);
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(within(sos).getByRole("link", { name: /190/ })).toHaveAttribute("href", "tel:190");
    expect(within(sos).getByRole("link", { name: /192/ })).toHaveAttribute("href", "tel:192");
    expect(within(sos).getByRole("link", { name: /193/ })).toHaveAttribute("href", "tel:193");
    expect(within(sos).queryByText("Contato de emergência não cadastrado")).not.toBeInTheDocument();
    fireEvent.click(sosButton);
    expect(within(dialog).queryByRole("region", { name: "SOS" })).not.toBeInTheDocument();
  });

  it("shows the SOS shortcuts in the client record even without an emergency contact", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Paula Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const patient = { id: "99999999-9999-4999-8999-999999999999", recordNumber: "PAC-00001", fullName: "Helena Almeida", phone: "11987654321", emergencyContactName: "", tags: [], status: "active" };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/timeline") ? [] : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Editar Helena Almeida" }));
    const dialog = screen.getByRole("dialog", { name: "Editar cliente" });
    fireEvent.click(within(dialog).getByRole("button", { name: "SOS" }));
    const sos = within(dialog).getByRole("region", { name: "SOS" });
    expect(within(sos).getByText("Contato de emergência não cadastrado")).toBeInTheDocument();
    expect(within(sos).queryByRole("link", { name: /Ligar/ })).not.toBeInTheDocument();
    expect(within(sos).queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(within(sos).getByRole("link", { name: /190/ })).toHaveAttribute("href", "tel:190");
    expect(within(sos).getByRole("link", { name: /192/ })).toHaveAttribute("href", "tel:192");
    expect(within(sos).getByRole("link", { name: /193/ })).toHaveAttribute("href", "tel:193");
  });

  it("does not show the SOS button when creating a new client", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Paula Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [] }) as Response);
    render(<MemoryRouter initialEntries={["/clientes"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Novo cliente/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    expect(within(dialog).queryByRole("button", { name: "SOS" })).not.toBeInTheDocument();
  });

  it("sends the chosen visit type when booking a new appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    let posted: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return { ok: false, status: 409, json: async () => ({ code: "APPOINTMENT_CONFLICT", message: "Horário ocupado." }) } as Response;
      }
      const body = url.includes("/professionals") ? [{ id: "33333333-3333-4333-8333-333333333333", fullName: "Dra. Ana Martins", color: "#5c6f68" }]
        : url.includes("/rooms") ? [{ id: "55555555-5555-4555-8555-555555555555", name: "Sala Movimento" }]
          : url.includes("/services") ? [{ id: "77777777-7777-4777-8777-777777777777", name: "Fisioterapia individual", priceInCents: 12000 }]
            : url.includes("/patients") ? [{ id: "99999999-9999-4999-8999-999999999999", fullName: "Helena Almeida" }]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/agenda"]}><App /></MemoryRouter>);
    await screen.findByText("Dia disponível");
    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    const type = screen.getByLabelText("Tipo");
    expect(type).toHaveValue("regular");
    expect(within(type).getAllByRole("option").map((item) => item.textContent)).toEqual(["Atendimento", "Experimental", "Avaliação"]);
    fireEvent.change(type, { target: { value: "evaluation" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar atendimento" }));
    expect(await screen.findByText("Horário ocupado.")).toBeInTheDocument();
    expect(posted).toMatchObject({ patientId: "99999999-9999-4999-8999-999999999999", visitType: "evaluation" });
  });

  it("books a trial class for a lead from the CRM card", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Joana Recepção", email: "recepcao@movimenta.local", role: "reception" }));
    const leadBase = { clinicId: "11111111-1111-4111-8111-111111111111", phone: "11987654321", source: "Instagram", interest: "Pilates", tags: [], openTasks: 0, overdueTasks: 0, createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z" };
    const lead = { ...leadBase, id: "44444444-4444-4444-8444-444444444444", fullName: "Bruna Lead", stage: "contacted" };
    const converted = { ...leadBase, id: "45454545-4545-4545-8545-454545454545", fullName: "Carla Convertida", stage: "won", convertedPatientId: "99999999-9999-4999-8999-999999999999" };
    let posted: { url: string; body: Record<string, unknown> } | undefined;
    let conflict = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted = { url, body: JSON.parse(String(init.body)) };
        if (conflict) return { ok: false, status: 409, json: async () => ({ code: "APPOINTMENT_CONFLICT", message: "Profissional já tem atendimento neste horário." }) } as Response;
        return { ok: true, status: 201, json: async () => ({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", leadId: lead.id, leadName: lead.fullName, patientName: lead.fullName, ...posted!.body, endsAt: posted!.body.startsAt, status: "scheduled", serviceName: "Pilates", professionalName: "Dra. Ana Martins", roomName: "Sala Movimento", professionalColor: "#5c6f68" }) } as Response;
      }
      const body = url.endsWith("/leads") ? [lead, converted]
        : url.includes("/professionals") ? [{ id: "33333333-3333-4333-8333-333333333333", fullName: "Dra. Ana Martins", color: "#5c6f68" }]
          : url.includes("/rooms") ? [{ id: "55555555-5555-4555-8555-555555555555", name: "Sala Movimento" }]
            : url.includes("/services") ? [{ id: "77777777-7777-4777-8777-777777777777", name: "Pilates", priceInCents: 9000 }]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/comercial"]}><App /></MemoryRouter>);
    const card = (await screen.findByRole("heading", { name: "Bruna Lead" })).closest("article") as HTMLElement;
    const convertedCard = screen.getByRole("heading", { name: "Carla Convertida" }).closest("article") as HTMLElement;
    expect(within(convertedCard).queryByRole("button", { name: "Agendar experimental" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Agendar experimental" }));
    const dialog = await screen.findByRole("dialog", { name: "Agendar experimental" });
    const service = await within(dialog).findByLabelText("Serviço");
    expect(service).toHaveValue("77777777-7777-4777-8777-777777777777");
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue("33333333-3333-4333-8333-333333333333");
    expect(within(dialog).getByLabelText("Sala")).toHaveValue("55555555-5555-4555-8555-555555555555");
    const type = within(dialog).getByLabelText("Tipo");
    expect(type).toHaveValue("trial");
    expect(within(type).getAllByRole("option").map((item) => item.textContent)).toEqual(["Experimental", "Avaliação"]);
    fireEvent.change(type, { target: { value: "evaluation" } });
    fireEvent.change(within(dialog).getByLabelText("Data e horário"), { target: { value: "2026-10-05T09:00" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar agendamento" }));
    expect(await within(dialog).findByText("Profissional já tem atendimento neste horário.")).toBeInTheDocument();
    expect(posted?.url).toContain(`/leads/${lead.id}/appointments`);
    expect(posted?.body).toEqual({
      professionalId: "33333333-3333-4333-8333-333333333333",
      roomId: "55555555-5555-4555-8555-555555555555",
      serviceId: "77777777-7777-4777-8777-777777777777",
      startsAt: new Date("2026-10-05T09:00").toISOString(),
      notes: "",
      visitType: "evaluation",
    });
    conflict = false;
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar agendamento" }));
    expect(await screen.findByText(/Avaliação agendada para Bruna Lead/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Agendar experimental" })).not.toBeInTheDocument();
  });

  it("lists, creates, pauses, reactivates and ends fixed expenses in accounts payable", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const clinicId = "11111111-1111-4111-8111-111111111111";
    const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    const category = { id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", clinicId, name: "Aluguel e condomínio", kind: "expense", active: true };
    const center = { id: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1", clinicId, name: "Administrativo", active: true };
    const base = { clinicId, categoryId: category.id, costCenterId: center.id, categoryName: category.name, costCenterName: center.name, createdAt: "2026-01-01T12:00:00.000Z", updatedAt: "2026-01-01T12:00:00.000Z" };
    let recurring: Record<string, unknown>[] = [
      { ...base, id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", description: "Aluguel da sala", supplier: "Imobiliária Centro", amountInCents: 250000, dayOfMonth: 10, startMonth: "2026-01", active: true, lastCompetence: "2026-09" },
      { ...base, id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2", description: "Internet", amountInCents: 12990, dayOfMonth: 5, startMonth: "2026-02", active: false, resumedFromMonth: "2026-05", lastCompetence: "2026-07" },
      { ...base, id: "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3", description: "Software antigo", amountInCents: 9900, dayOfMonth: 15, startMonth: "2019-01", endMonth: "2020-01", active: true, lastCompetence: "2020-01" },
      { ...base, id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5", description: "Seguro do estúdio", amountInCents: 8000, dayOfMonth: 20, startMonth: "2019-01", endMonth: currentMonth, active: true },
    ];
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [category, { ...category, id: "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2", name: "Mensalidades", kind: "income" }],
      costCenters: [center],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    const bodies: { method: string; url: string; body: Record<string, unknown> }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/finance/recurring-payables") && method === "POST") {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        bodies.push({ method, url, body });
        const created = { ...base, ...body, id: "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4" };
        recurring = [...recurring, created];
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      if (url.includes("/finance/recurring-payables/") && method === "PUT") {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        bodies.push({ method, url, body });
        const id = url.split("/").pop();
        const current = recurring.find((item) => item.id === id)!;
        const updated = { ...base, id, lastCompetence: current.lastCompetence, ...body };
        recurring = recurring.map((item) => (item.id === id ? updated : item));
        return { ok: true, status: 200, json: async () => updated } as Response;
      }
      const body = url.includes("/finance/recurring-payables") ? recurring
        : url.includes("/finance/workspace") ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const workspaceLoads = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/finance/workspace")).length;
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Contas a pagar (0)" }));
    const section = (await screen.findByRole("heading", { name: "Despesas fixas" })).closest("section")!;
    expect(await within(section).findByText("Aluguel da sala")).toBeInTheDocument();
    expect(within(section).getByText("Imobiliária Centro · Administrativo")).toBeInTheDocument();
    expect(within(section).getByText("R$ 2.500,00")).toBeInTheDocument();
    expect(within(section).getByText("Dia 10")).toBeInTheDocument();
    expect(within(section).getByText("Desde 01/2026 · Última gerada: 09/2026")).toBeInTheDocument();
    expect(within(section).getByText("Desde 02/2026 · Reativada em 05/2026 · Última gerada: 07/2026")).toBeInTheDocument();
    expect(within(section).getAllByText("Ativa")).toHaveLength(2);
    expect(within(section).getByText("Pausada")).toBeInTheDocument();
    expect(within(section).getAllByText("Encerrada")).toHaveLength(1);
    // Encerrada (mês final já passou) não oferece mais pausar nem encerrar.
    expect(within(section).queryByRole("button", { name: "Pausar Software antigo" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Encerrar Software antigo" })).not.toBeInTheDocument();
    // No próprio mês final ela ainda gera conta: continua ativa, com as ações.
    const lastMonthRow = within(section).getByText("Seguro do estúdio").closest(".finance-row") as HTMLElement;
    expect(within(lastMonthRow).getByText("Ativa")).toBeInTheDocument();
    expect(within(lastMonthRow).getByRole("button", { name: "Pausar Seguro do estúdio" })).toBeInTheDocument();
    expect(within(lastMonthRow).getByRole("button", { name: "Encerrar Seguro do estúdio" })).toBeInTheDocument();

    // Criar: só categorias de despesa no select; depois recarrega o workspace (que gera as contas).
    fireEvent.click(within(section).getByRole("button", { name: "Nova despesa fixa" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova despesa fixa" });
    expect(within(dialog).queryByRole("option", { name: "Mensalidades" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Descrição"), { target: { value: "Contador" } });
    fireEvent.change(within(dialog).getByLabelText("Fornecedor"), { target: { value: "Escritório Silva" } });
    fireEvent.change(within(dialog).getByLabelText("Valor mensal"), { target: { value: "450" } });
    fireEvent.change(within(dialog).getByLabelText("Dia do vencimento"), { target: { value: "20" } });
    fireEvent.change(within(dialog).getByLabelText("Mês inicial"), { target: { value: "2026-10" } });
    fireEvent.change(within(dialog).getByLabelText("Mês final (opcional)"), { target: { value: "2027-09" } });
    const loadsBeforeCreate = workspaceLoads();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cadastrar despesa fixa" }));
    expect(await within(section).findByText("Contador")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Nova despesa fixa" })).not.toBeInTheDocument();
    expect(bodies[0]).toMatchObject({ method: "POST" });
    expect(bodies[0]!.body).toEqual({
      description: "Contador",
      supplier: "Escritório Silva",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 45000,
      dayOfMonth: 20,
      startMonth: "2026-10",
      endMonth: "2027-09",
      active: true,
    });
    expect(workspaceLoads()).toBeGreaterThan(loadsBeforeCreate);

    // Pausar envia o corpo completo com active:false.
    fireEvent.click(within(section).getByRole("button", { name: "Pausar Aluguel da sala" }));
    expect(await within(section).findByRole("button", { name: "Reativar Aluguel da sala" })).toBeInTheDocument();
    expect(bodies[1]!.url).toContain("/finance/recurring-payables/e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1");
    expect(bodies[1]!.body).toEqual({
      description: "Aluguel da sala",
      supplier: "Imobiliária Centro",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 250000,
      dayOfMonth: 10,
      startMonth: "2026-01",
      active: false,
    });

    // Reativar envia active:true explicitamente e recarrega o workspace.
    const loadsBeforeResume = workspaceLoads();
    fireEvent.click(within(section).getByRole("button", { name: "Reativar Internet" }));
    expect(await within(section).findByRole("button", { name: "Pausar Internet" })).toBeInTheDocument();
    expect(bodies[2]!.body).toMatchObject({ description: "Internet", active: true });
    expect(bodies[2]!.body).not.toHaveProperty("resumedFromMonth");
    expect(workspaceLoads()).toBeGreaterThan(loadsBeforeResume);

    // Encerrar abre um modal com o último mês e mantém a situação atual.
    fireEvent.click(within(section).getByRole("button", { name: "Encerrar Internet" }));
    const endDialog = await screen.findByRole("dialog", { name: "Encerrar despesa fixa" });
    const lastMonth = within(endDialog).getByLabelText("Último mês");
    expect(lastMonth).toHaveAttribute("type", "month");
    expect(lastMonth).toHaveAttribute("min", "2026-02");
    expect(lastMonth).toHaveValue(currentMonth);
    fireEvent.change(lastMonth, { target: { value: "2026-01" } });
    // O `min` do campo barra o envio no navegador; a validação própria cobre campos sem suporte a `month`.
    expect((lastMonth as HTMLInputElement).validity.rangeUnderflow).toBe(true);
    fireEvent.submit(lastMonth.closest("form")!);
    expect(await within(endDialog).findByText("O mês final não pode ser anterior ao mês inicial.")).toBeInTheDocument();
    expect(bodies).toHaveLength(3);
    fireEvent.change(lastMonth, { target: { value: "2026-12" } });
    fireEvent.click(within(endDialog).getByRole("button", { name: "Encerrar despesa fixa" }));
    await vi.waitFor(() => expect(bodies[3]?.body).toEqual({
      description: "Internet",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 12990,
      dayOfMonth: 5,
      startMonth: "2026-02",
      endMonth: "2026-12",
      active: true,
    }));
    expect(bodies[3]!.url).toContain("/finance/recurring-payables/e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2");
    expect(await within(section).findByText("Desde 02/2026 · até 12/2026 · Última gerada: 07/2026")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Encerrar despesa fixa" })).not.toBeInTheDocument();
  });

  it("shows the API error inside the end fixed expense modal", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const item = { id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", clinicId: "11111111-1111-4111-8111-111111111111", description: "Aluguel da sala", categoryId: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", costCenterId: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1", categoryName: "Aluguel", costCenterName: "Administrativo", amountInCents: 250000, dayOfMonth: 10, startMonth: "2026-01", endMonth: "2099-12", active: false, createdAt: "2026-01-01T12:00:00.000Z", updatedAt: "2026-01-01T12:00:00.000Z" };
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [], costCenters: [], payables: [],
      payableOpenInCents: 0, payableOverdueInCents: 0, paidExpensesThisMonthInCents: 0, cashBalanceThisMonthInCents: 0,
      commissionRules: [], commissions: [], commissionOpenInCents: 0, paidCommissionsThisMonthInCents: 0,
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PUT") {
        return { ok: false, status: 404, json: async () => ({ code: "RECURRING_PAYABLE_NOT_FOUND", message: "Despesa fixa não encontrada." }) } as Response;
      }
      const body = url.includes("/finance/recurring-payables") ? [item] : url.includes("/finance/workspace") ? workspace : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Contas a pagar (0)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Encerrar Aluguel da sala" }));
    const dialog = await screen.findByRole("dialog", { name: "Encerrar despesa fixa" });
    // Sugere o mês final já cadastrado.
    expect(within(dialog).getByLabelText("Último mês")).toHaveValue("2099-12");
    fireEvent.click(within(dialog).getByRole("button", { name: "Encerrar despesa fixa" }));
    expect(await within(dialog).findByText("Despesa fixa não encontrada.")).toBeInTheDocument();
    const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
    // Pausada continua pausada: `active` vai explícito como false.
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ endMonth: "2099-12", active: false });
  });

  it("shows empty and error states for fixed expenses", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [], costCenters: [], payables: [],
      payableOpenInCents: 0, payableOverdueInCents: 0, paidExpensesThisMonthInCents: 0, cashBalanceThisMonthInCents: 0,
      commissionRules: [], commissions: [], commissionOpenInCents: 0, paidCommissionsThisMonthInCents: 0,
    };
    let failing = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/finance/recurring-payables") && failing) {
        return { ok: false, status: 500, json: async () => ({ code: "INTERNAL", message: "Falha ao carregar despesas fixas." }) } as Response;
      }
      const body = url.includes("/finance/workspace") ? workspace : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { unmount } = render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Contas a pagar (0)" }));
    const section = (await screen.findByRole("heading", { name: "Despesas fixas" })).closest("section")!;
    expect(await within(section).findByText("Nenhuma despesa fixa")).toBeInTheDocument();
    unmount();

    failing = true;
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Contas a pagar (0)" }));
    await screen.findByRole("heading", { name: "Despesas fixas" });
    expect(await screen.findByText("Falha ao carregar despesas fixas.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma despesa fixa")).not.toBeInTheDocument();
  });

  it("shows the daily cash with totals by payment method and movements", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "finance" }));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [], costCenters: [], payables: [],
      payableOpenInCents: 0, payableOverdueInCents: 0, paidExpensesThisMonthInCents: 0, cashBalanceThisMonthInCents: 0,
      commissionRules: [], commissions: [], commissionOpenInCents: 0, paidCommissionsThisMonthInCents: 0,
    };
    const cash = {
      date: today,
      generatedAt: "2026-09-30T21:00:00.000Z",
      byPaymentMethod: [
        { paymentMethod: "pix", inflowInCents: 25000, outflowInCents: 0, balanceInCents: 25000 },
        { paymentMethod: "bank_transfer", inflowInCents: 0, outflowInCents: 250000, balanceInCents: -250000 },
        { paymentMethod: "unspecified", inflowInCents: -8000, outflowInCents: 5000, balanceInCents: -13000 },
      ],
      totalInflowInCents: 17000,
      totalOutflowInCents: 255000,
      balanceInCents: -238000,
      movements: [
        { id: "receipt:1", kind: "receipt", direction: "in", occurredAt: "2026-09-30T12:15:00.000Z", description: "Pilates 2x · parcela 1/3", counterpart: "Ana Souza", paymentMethod: "pix", amountInCents: 25000 },
        { id: "receipt_reversal:2", kind: "receipt_reversal", direction: "in", occurredAt: "2026-09-30T14:00:00.000Z", description: "Avaliação postural", counterpart: "Bruno Lima", paymentMethod: "unspecified", amountInCents: -8000 },
        { id: "payable:3", kind: "payable", direction: "out", occurredAt: "2026-09-30T17:30:00.000Z", description: "Aluguel da sala", counterpart: "Imobiliária Centro", paymentMethod: "bank_transfer", amountInCents: 250000 },
        { id: "commission:4", kind: "commission", direction: "out", occurredAt: "2026-09-30T20:00:00.000Z", description: "Comissão 09/2026", paymentMethod: "unspecified", amountInCents: 5000 },
      ],
    };
    const emptyCash = { ...cash, date: "2026-09-01", byPaymentMethod: [], totalInflowInCents: 0, totalOutflowInCents: 0, balanceInCents: 0, movements: [] };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/finance/daily-cash") ? (url.includes(`date=${today}`) ? cash : emptyCash)
        : url.includes("/finance/workspace") ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Caixa do dia" }));
    const section = (await screen.findByRole("heading", { name: "Caixa do dia" })).closest("section")!;
    const dateInput = within(section).getByLabelText("Data");
    expect(dateInput).toHaveAttribute("type", "date");
    expect(dateInput).toHaveValue(today);
    expect(await within(section).findByText("Ana Souza")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes(`/finance/daily-cash?date=${today}`))).toBe(true);
    // A forma usada na baixa não se aplica ao caixa.
    expect(screen.queryByLabelText("Forma usada na baixa")).not.toBeInTheDocument();

    // Totais do dia.
    const totals = within(section).getByRole("list", { name: "Totais do dia" });
    expect(within(totals).getByText("Entradas").nextElementSibling).toHaveTextContent("R$ 170,00");
    expect(within(totals).getByText("Saídas").nextElementSibling).toHaveTextContent("R$ 2.550,00");
    expect(within(totals).getByText("Saldo").nextElementSibling).toHaveTextContent("-R$ 2.380,00");

    // Totais por forma de pagamento, na ordem da API, com rótulo para "sem forma".
    const methods = within(section).getByRole("table", { name: "Totais por forma de pagamento" });
    const methodRows = within(methods).getAllByRole("row").slice(1);
    expect(methodRows.map((row) => row.querySelector("th")?.textContent)).toEqual(["Pix", "Transferência", "Não informada"]);
    const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent?.replace(/\s/g, " "));
    expect(cells(methodRows[0]!)).toEqual(["R$ 250,00", "R$ 0,00", "R$ 250,00"]);
    expect(cells(methodRows[1]!)).toEqual(["R$ 0,00", "R$ 2.500,00", "-R$ 2.500,00"]);
    expect(cells(methodRows[2]!)).toEqual(["-R$ 80,00", "R$ 50,00", "-R$ 130,00"]);

    // Movimentos em ordem, com tipo, hora (São Paulo), forma e valor com sinal.
    const rows = [...section.querySelectorAll(".daily-cash-table .finance-row")] as HTMLElement[];
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText("Recebimento")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("09:15")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Pix")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("+ R$ 250,00")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Estorno")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Bruno Lima")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Não informada")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("- R$ 80,00")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Conta paga")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("14:30")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Transferência")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("- R$ 2.500,00")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Comissão")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("- R$ 50,00")).toBeInTheDocument();

    // Outro dia sem movimento: busca a data escolhida e mostra o estado vazio.
    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });
    expect(await within(section).findByText("Nenhum movimento neste dia")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/finance/daily-cash?date=2026-09-01"))).toBe(true);
    expect(within(section).queryByText("Ana Souza")).not.toBeInTheDocument();
    expect(within(section).queryByRole("table", { name: "Totais por forma de pagamento" })).not.toBeInTheDocument();
  });

  it("shows the finance forecast by month with confirmed and projected values", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "finance" }));
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [], costCenters: [], payables: [],
      payableOpenInCents: 0, payableOverdueInCents: 0, paidExpensesThisMonthInCents: 0, cashBalanceThisMonthInCents: 0,
      commissionRules: [], commissions: [], commissionOpenInCents: 0, paidCommissionsThisMonthInCents: 0,
    };
    const flow = (inflowInCents: number, outflowInCents: number) => ({ inflowInCents, outflowInCents, balanceInCents: inflowInCents - outflowInCents });
    const monthKey = (index: number) => {
      const total = 2026 * 12 + 8 + index;
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    };
    const forecast = (count: number) => {
      const months = Array.from({ length: count }, (_, index) => {
        const confirmed = index === 0 ? flow(50000, 250000) : index === 1 ? flow(30000, 0) : flow(0, 0);
        const projected = index === 0 ? flow(0, 0) : flow(45000, 250000);
        return { month: monthKey(index), confirmed, projected, balanceInCents: confirmed.balanceInCents + projected.balanceInCents };
      });
      const sum = (key: "confirmed" | "projected") => flow(months.reduce((t, m) => t + m[key].inflowInCents, 0), months.reduce((t, m) => t + m[key].outflowInCents, 0));
      return {
        generatedAt: "2026-09-30T12:00:00.000Z",
        startMonth: months[0]!.month,
        endMonth: months[months.length - 1]!.month,
        months,
        overdue: flow(12000, 3000),
        totals: { confirmed: sum("confirmed"), projected: sum("projected"), balanceInCents: months.reduce((t, m) => t + m.balanceInCents, 0) },
      };
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/finance/forecast") ? forecast(Number(/months=(\d+)/.exec(url)?.[1] ?? 6))
        : url.includes("/finance/workspace") ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Previsão" }));
    const section = (await screen.findByRole("heading", { name: "Previsão" })).closest("section")!;
    // A forma usada na baixa não se aplica à previsão.
    expect(screen.queryByLabelText("Forma usada na baixa")).not.toBeInTheDocument();
    const select = within(section).getByLabelText("Horizonte");
    expect(select).toHaveValue("6");
    expect([...(select as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(["3 meses", "6 meses", "12 meses"]);
    const table = await within(section).findByRole("table", { name: "Previsão por mês" });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/finance/forecast?months=6"))).toBe(true);

    // Os cabeçalhos distinguem confirmado de projetado.
    expect(within(table).getByRole("columnheader", { name: "Confirmado" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Projetado" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Saldo do mês" })).toBeInTheDocument();

    const bodyRows = () => within(table).getAllByRole("row").filter((row) => row.closest("tbody"));
    expect(bodyRows().map((row) => row.querySelector("th")?.textContent)).toEqual(["09/2026", "10/2026", "11/2026", "12/2026", "01/2027", "02/2027"]);
    const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent?.replace(/\s/g, " "));
    expect(cells(bodyRows()[0]!)).toEqual(["R$ 500,00", "R$ 2.500,00", "-R$ 2.000,00", "R$ 0,00", "R$ 0,00", "R$ 0,00", "-R$ 2.000,00"]);
    expect(cells(bodyRows()[1]!)).toEqual(["R$ 300,00", "R$ 0,00", "R$ 300,00", "R$ 450,00", "R$ 2.500,00", "-R$ 2.050,00", "-R$ 1.750,00"]);
    const footer = within(table).getAllByRole("row").find((row) => row.closest("tfoot"))!;
    expect(footer.querySelector("th")?.textContent).toBe("Total");
    expect(cells(footer)).toEqual(["R$ 800,00", "R$ 2.500,00", "-R$ 1.700,00", "R$ 2.250,00", "R$ 12.500,00", "-R$ 10.250,00", "-R$ 11.950,00"]);

    // Em atraso aparece à parte, fora dos saldos.
    const overdue = section.querySelector(".forecast-overdue")!;
    expect(overdue.textContent?.replace(/\s/g, " ")).toContain("Em atraso");
    expect(overdue.textContent?.replace(/\s/g, " ")).toContain("R$ 120,00 a receber");
    expect(overdue.textContent?.replace(/\s/g, " ")).toContain("R$ 30,00 a pagar");
    expect(overdue).toHaveTextContent("fora dos saldos");

    // Trocar o horizonte refaz a busca.
    fireEvent.change(select, { target: { value: "3" } });
    await vi.waitFor(() => expect(within(section).getAllByRole("row").filter((row) => row.closest("tbody"))).toHaveLength(3));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/finance/forecast?months=3"))).toBe(true);
    fireEvent.change(select, { target: { value: "12" } });
    await vi.waitFor(() => expect(within(section).getAllByRole("row").filter((row) => row.closest("tbody"))).toHaveLength(12));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/finance/forecast?months=12"))).toBe(true);
  });

  it("shows empty and error states for the finance forecast", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [], costCenters: [], payables: [],
      payableOpenInCents: 0, payableOverdueInCents: 0, paidExpensesThisMonthInCents: 0, cashBalanceThisMonthInCents: 0,
      commissionRules: [], commissions: [], commissionOpenInCents: 0, paidCommissionsThisMonthInCents: 0,
    };
    const zero = { inflowInCents: 0, outflowInCents: 0, balanceInCents: 0 };
    const emptyForecast = {
      generatedAt: "2026-09-30T12:00:00.000Z", startMonth: "2026-09", endMonth: "2027-02",
      months: ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"].map((month) => ({ month, confirmed: zero, projected: zero, balanceInCents: 0 })),
      overdue: zero, totals: { confirmed: zero, projected: zero, balanceInCents: 0 },
    };
    let failing = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/finance/forecast") && failing) {
        return { ok: false, status: 500, json: async () => ({ code: "INTERNAL", message: "Falha ao carregar a previsão." }) } as Response;
      }
      const body = url.includes("/finance/forecast") ? emptyForecast : url.includes("/finance/workspace") ? workspace : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { unmount } = render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Previsão" }));
    expect(await screen.findByText("Nada previsto no período")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Previsão por mês" })).not.toBeInTheDocument();
    unmount();

    failing = true;
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Previsão" }));
    expect(await screen.findByText("Falha ao carregar a previsão.")).toBeInTheDocument();
    expect(screen.queryByText("Nada previsto no período")).not.toBeInTheDocument();
  });

  it("shows the API error for the daily cash", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", fullName: "Mariana Costa", email: "admin@movimenta.local", role: "owner" }));
    const workspace = {
      summary: { openInCents: 0, overdueInCents: 0, paidThisMonthInCents: 0, receivables: [] },
      categories: [], costCenters: [], payables: [],
      payableOpenInCents: 0, payableOverdueInCents: 0, paidExpensesThisMonthInCents: 0, cashBalanceThisMonthInCents: 0,
      commissionRules: [], commissions: [], commissionOpenInCents: 0, paidCommissionsThisMonthInCents: 0,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/finance/daily-cash")) {
        return { ok: false, status: 400, json: async () => ({ code: "VALIDATION_ERROR", message: "Informe uma data válida." }) } as Response;
      }
      const body = url.includes("/finance/workspace") ? workspace : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<MemoryRouter initialEntries={["/financeiro"]}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Caixa do dia" }));
    expect(await screen.findByText("Informe uma data válida.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum movimento neste dia")).not.toBeInTheDocument();
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
