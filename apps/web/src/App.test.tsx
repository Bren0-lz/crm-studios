import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      name: "Pilates · Turma A",
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
    expect(screen.getByText("Pilates · Turma B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar gaveta" }));
    expect(screen.getByText("Turma de terça da noite")).toBeInTheDocument();
    expect(screen.getByText("Terça · 18:00–19:00")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    expect(screen.getByRole("dialog", { name: "Pilates · Turma A" })).toBeInTheDocument();
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
      groupName: "Pilates · Turma A",
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
    const day = await screen.findByRole("button", { name: /1 atendimentos, 1 turmas, 0 bloqueios/ });
    expect(screen.getByText("1 turma")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }));
    expect(screen.getByRole("heading", { name: "Detalhes do atendimento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day);
    expect(await screen.findByRole("heading", { name: "Helena Almeida" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Turma Pilates · Turma A" })).toHaveTextContent("Dra. Ana Martins · Estúdio 1");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(await screen.findByText("10:00–10:50")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
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
    expect(screen.getAllByText("Pacientes sem retorno")).toHaveLength(2);
    const details = screen.getByText("Ver vendas e pacientes do mês")
      .parentElement as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Ver vendas e pacientes do mês"));
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
    expect(await screen.findByRole("heading", { name: "Vendas e retorno dos pacientes" })).toBeInTheDocument();
    expect(screen.getByText(/1\.200,00/)).toBeInTheDocument();
    expect(screen.getByText("+20% vs. mês anterior comparável")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pacientes sem retorno" })).toBeInTheDocument();
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
    expect(screen.getByLabelText("Paciente")).toHaveValue(
      "99999999-9999-4999-8999-999999999999",
    );
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
      <MemoryRouter initialEntries={["/pacientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Editar Helena Almeida" }));
    expect(screen.getByRole("heading", { name: "Editar paciente" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Helena Pereira" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Helena Pereira")).toBeInTheDocument();
    const updateCall = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PUT");
    expect(updateCall?.[0]).toContain(`/patients/${patient.id}`);
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      fullName: "Helena Pereira",
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
});
