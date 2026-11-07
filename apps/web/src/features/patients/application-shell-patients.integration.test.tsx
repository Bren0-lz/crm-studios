import { saoPauloToday } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { patientTag, storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import {
  clickMoreAction,
  findMoreAction,
  moreActionNames,
} from "../../test-support/patient-actions";

describe("application shell", () => {
  it("shows patient and booking details before cancelling an appointment", async () => {
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
      const body =
        options?.method === "PATCH"
          ? { ...appointment, status: "cancelled" }
          : url.includes("/appointments?") ||
              url.includes("/appointments/options?")
            ? [appointment]
            : url.includes("/patients")
              ? [
                  {
                    id: appointment.patientId,
                    fullName: appointment.patientName,
                    recordNumber: "PAC-00001",
                    phone: "11987654321",
                    email: "helena@example.com",
                    cpf: "12345678901",
                    status: "active",
                    tags: ["Retorno"],
                  },
                ]
              : url.includes("/services")
                ? [
                    {
                      id: appointment.serviceId,
                      durationMinutes: 50,
                    },
                  ]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(screen.getByText("helena@example.com")).toBeInTheDocument();
    expect(screen.getByText("Primeira consulta")).toBeInTheDocument();
    expect(screen.getByText(/50 min/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar atendimento" }),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, options]) => options?.method === "PATCH"),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
      target: { value: "Cliente desmarcou" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PATCH");
      expect(call?.[0]).toContain(`/appointments/${appointment.id}/status`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        status: "cancelled",
        absenceReason: "Cliente desmarcou",
      });
    });
    // Depois de cancelar, o modal fica aberto para avisar o cliente por WhatsApp.
    const notify = await screen.findByRole("link", {
      name: "Avisar cliente por WhatsApp",
    });
    expect(notify).toHaveAttribute(
      "href",
      expect.stringContaining("foi%20cancelado"),
    );
    // Mensagem com o primeiro nome, não o nome completo.
    expect(decodeURIComponent(notify.getAttribute("href")!)).toContain(
      "Olá, Helena! Seu atendimento",
    );
  });

  it("filters patients by status, tags and record data", async () => {
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
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const otherMonth = String(((new Date().getMonth() + 1) % 12) + 1).padStart(
      2,
      "0",
    );
    const patient = (
      id: string,
      fullName: string,
      extra: Record<string, unknown>,
    ) => ({
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
      patient("a0000000-0000-4000-8000-000000000001", "Ana Lima", {
        tags: ["Pilates"],
        email: "ana@example.com",
        birthDate: `1990-${month}-10`,
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
      patient("a0000000-0000-4000-8000-000000000002", "Bruno Souza", {
        tags: ["Fisioterapia"],
        status: "inactive",
        birthDate: `1985-${otherMonth}-02`,
      }),
      patient("a0000000-0000-4000-8000-000000000003", "Carla Dias", {
        tags: ["Pilates", "Frequente"],
        email: "carla@example.com",
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
    ];
    const tags = [
      patientTag("Fisioterapia", "#2563eb", 1),
      patientTag("Frequente", "#facc15", 1),
      patientTag("Pilates", "#2f855a", 2),
    ];
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/patient-tags") ? tags : patients,
        }) as Response,
    );
    // O endereço antigo redireciona para /clientes.
    render(
      <MemoryRouter initialEntries={["/pacientes"]}>
        <App />
      </MemoryRouter>,
    );
    const names = () =>
      screen
        .queryAllByRole("button", { name: /^Editar / })
        .map((row) => row.getAttribute("aria-label"));
    await screen.findByRole("button", { name: "Editar Ana Lima" });
    expect(names()).toEqual([
      "Editar Ana Lima",
      "Editar Bruno Souza",
      "Editar Carla Dias",
    ]);
    expect(
      within(
        screen.getByRole("button", { name: "Abrir ficha de Bruno Souza" }),
      ).getByText("Inativo"),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Filtros/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Inativos" }),
    ).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
    expect(names()).toEqual(["Editar Bruno Souza"]);
    expect(screen.getByText("de 3 clientes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pilates/ }));
    expect(names()).toEqual(["Editar Ana Lima", "Editar Carla Dias"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: "oldest" },
    });
    expect(names()).toEqual(["Editar Carla Dias", "Editar Ana Lima"]);
    fireEvent.change(screen.getByLabelText("Cadastro"), {
      target: { value: "birthday_month" },
    });
    expect(names()).toEqual(["Editar Ana Lima"]);
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent(
      "2",
    );

    fireEvent.change(screen.getByLabelText("Cadastro"), {
      target: { value: "without_email" },
    });
    expect(
      screen.getByText("Nenhum cliente com esses filtros"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Limpar filtros" })[0]!,
    );
    // Limpar mantém a ordenação escolhida (cadastro mais antigo primeiro).
    expect(names()).toEqual([
      "Editar Bruno Souza",
      "Editar Carla Dias",
      "Editar Ana Lima",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Editar Carla Dias" }));
    expect(
      screen.getByRole("heading", { name: "Editar cliente" }),
    ).toBeInTheDocument();
  });

  it("opens a patient record for correction and saves the changed name", async () => {
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
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["Retorno"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const body =
        options?.method === "PUT"
          ? { ...patient, fullName: "Helena Pereira" }
          : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    expect(
      screen.getByRole("heading", { name: "Editar cliente" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Helena Pereira" },
    });
    fireEvent.change(screen.getByLabelText("CPF"), {
      target: { value: "52998224725" },
    });
    fireEvent.change(screen.getByLabelText("WhatsApp"), {
      target: { value: "11 90000-1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Helena Pereira")).toBeInTheDocument();
    const updateCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PUT");
    expect(updateCall?.[0]).toContain(`/patients/${patient.id}`);
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      fullName: "Helena Pereira",
      whatsapp: "11900001234",
      tags: ["Retorno"],
    });
  });

  it("shows the patient history with values and a filter by type", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: [],
      status: "active",
    };
    const timeline = [
      {
        id: "appointment:1",
        kind: "appointment",
        occurredAt: "2026-09-20T13:00:00.000Z",
        title: "Atendimento de Pilates",
        detail: "Com Dra. Ana Martins",
        status: "completed",
      },
      {
        id: "payment_reversal:2",
        kind: "payment_reversal",
        occurredAt: "2026-09-12T13:00:00.000Z",
        title: "Pagamento estornado",
        amountInCents: -18000,
      },
      {
        id: "payment:3",
        kind: "payment",
        occurredAt: "2026-09-10T13:00:00.000Z",
        title: "Pagamento recebido",
        detail: "Pix",
        amountInCents: 18000,
      },
      {
        id: "receipt_signed:3",
        kind: "receipt_signed",
        occurredAt: "2026-09-11T15:00:00.000Z",
        title: "Recibo assinado pelo cliente",
        detail: "Pilates 1x · R$ 180,00 · por Helena Almeida",
      },
      {
        id: "receipt_sent:3",
        kind: "receipt_sent",
        occurredAt: "2026-09-10T14:00:00.000Z",
        title: "Recibo enviado para assinatura",
        detail: "Pilates 1x · R$ 180,00",
      },
      {
        id: "satisfaction:4",
        kind: "satisfaction",
        occurredAt: "2026-09-05T13:00:00.000Z",
        title: "Avaliação de satisfação",
        score: 9,
      },
      {
        id: "patient_updated:5",
        kind: "patient_updated",
        occurredAt: "2026-09-01T13:00:00.000Z",
        title: "Cadastro editado por Aryana Dutra",
        detail: "Apelido: (vazio) → Tres QA · Motivo: Pedido da cliente",
      },
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/timeline") ? timeline : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    const history = await screen.findByRole("region", { name: "Histórico" });
    expect(
      await within(history).findByText("Atendimento de Pilates"),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes(`/patients/${patient.id}/timeline`),
        ),
    ).toBe(true);
    expect(
      within(history).getByText("Com Dra. Ana Martins"),
    ).toBeInTheDocument();
    expect(within(history).getByText(/^R\$\s*180,00$/)).toBeInTheDocument();
    expect(within(history).getByText(/^-\s*R\$\s*180,00$/)).toBeInTheDocument();
    expect(within(history).getByText("Nota 9")).toBeInTheDocument();
    expect(within(history).getByText(/20 de set\./)).toBeInTheDocument();
    fireEvent.click(
      within(history).getByRole("button", { name: "Pagamentos" }),
    );
    expect(within(history).getByText("Pagamento recebido")).toBeInTheDocument();
    expect(
      within(history).getByText("Pagamento estornado"),
    ).toBeInTheDocument();
    // RC4: envio e assinatura do recibo da baixa ficam junto dos pagamentos.
    expect(
      within(history).getByText("Recibo enviado para assinatura"),
    ).toBeInTheDocument();
    expect(
      within(history).getByText("Recibo assinado pelo cliente"),
    ).toBeInTheDocument();
    expect(within(history).getByText(/11 de set\./)).toBeInTheDocument();
    expect(
      within(history).queryByText("Atendimento de Pilates"),
    ).not.toBeInTheDocument();
    expect(
      within(history).queryByText("Avaliação de satisfação"),
    ).not.toBeInTheDocument();
    // Edições do cadastro também ficam no histórico da ficha, com filtro próprio.
    fireEvent.click(within(history).getByRole("button", { name: "Cadastro" }));
    expect(
      within(history).getByText("Cadastro editado por Aryana Dutra"),
    ).toBeInTheDocument();
    expect(
      within(history).getByText(
        "Apelido: (vazio) → Tres QA · Motivo: Pedido da cliente",
      ),
    ).toBeInTheDocument();
    expect(
      within(history).queryByText("Pagamento recebido"),
    ).not.toBeInTheDocument();
    fireEvent.click(within(history).getByRole("button", { name: "Todos" }));
    expect(
      within(history).getByText("Atendimento de Pilates"),
    ).toBeInTheDocument();
  });

  it("does not load the patient history for physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: [],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({ ok: true, status: 200, json: async () => [patient] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    expect(
      screen.getByRole("heading", { name: "Editar cliente" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Histórico" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/timeline")),
    ).toBe(false);
  });

  it("records patient satisfaction on a completed appointment and hides the button afterwards", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "reception",
      }),
    );
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
        const payload = JSON.parse(String(options.body)) as Record<
          string,
          unknown
        >;
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "s-1",
            clinicId: "c-1",
            patientName: appointment.patientName,
            actorUserId: "u-1",
            createdAt: new Date().toISOString(),
            ...payload,
          }),
        } as Response;
      }
      const body = url.includes("/satisfaction?")
        ? {
            from: "2026-09-01",
            to: "2026-09-30",
            surveys: [
              {
                id: "s-0",
                appointmentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                patientId: appointment.patientId,
                score: 10,
              },
            ],
            summary: {
              total: 1,
              promoters: 1,
              passives: 0,
              detractors: 0,
              nps: 100,
            },
          }
        : url.includes("/appointments?") ||
            url.includes("/appointments/options?")
          ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(
      screen.queryByRole("button", { name: "Cancelar atendimento" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar satisfação" }),
    );
    expect(
      screen.getByRole("heading", { name: "Registrar satisfação" }),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Salvar avaliação" });
    expect(save).toBeDisabled();
    // Sem nota, o botão diz o que falta (QM14).
    expect(save).toHaveAccessibleDescription("Falta: Nota de 0 a 10.");
    for (let score = 0; score <= 10; score += 1) {
      expect(
        screen.getByRole("button", { name: `Nota ${score}` }),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Nota 9" }));
    expect(screen.getByRole("button", { name: "Nota 9" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(save).toBeEnabled();
    expect(save).not.toHaveAttribute("aria-describedby");
    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), {
      target: { value: "Ótimo atendimento" },
    });
    fireEvent.click(save);
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "POST");
      expect(call?.[0]).toContain("/satisfaction");
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        score: 9,
        comment: "Ótimo atendimento",
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Detalhes do atendimento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Satisfação registrada: nota 9"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
  });

  it("shows the retention error in its card without hiding the client rankings", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "finance",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/reports/retention?")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: "RETENTION_PERIOD_TOO_LONG",
            message: "A retenção aceita no máximo 24 meses.",
          }),
        } as Response;
      }
      if (url.includes("/reports/clients?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            generatedAt: "2026-09-30T12:00:00.000Z",
            from: "2024-01-01",
            to: "2026-09-30",
            topBySessions: [
              {
                patientId: "p-1",
                patientName: "Helena Almeida",
                completedSessions: 30,
              },
            ],
            activeClients: 1,
            ageDistribution: [
              { band: "0-17", label: "0 a 17 anos", clients: 0 },
              { band: "18-29", label: "18 a 29 anos", clients: 1 },
              { band: "30-44", label: "30 a 44 anos", clients: 0 },
              { band: "45-59", label: "45 a 59 anos", clients: 0 },
              { band: "60+", label: "60 anos ou mais", clients: 0 },
              { band: "unknown", label: "Sem data de nascimento", clients: 0 },
            ],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "Dados indisponíveis" }),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Clientes" }));
    const retentionPanel = (
      await screen.findByRole("heading", { name: "Retenção mês a mês" })
    ).closest("section") as HTMLElement;
    expect(
      await within(retentionPanel).findByText(
        "A retenção aceita no máximo 24 meses.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("tab", { name: "Ranking e faixa etária" }),
    );
    expect(await screen.findByText("1. Helena Almeida")).toBeInTheDocument();
    expect(screen.getByText("30 sessões")).toBeInTheDocument();
    expect(screen.getByText("Relatórios gerenciais")).toBeInTheDocument();
  });

  it("previews a patient spreadsheet, imports the same file and reloads the list", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const existing = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: [],
      status: "active",
    };
    const imported = {
      ...existing,
      id: "88888888-8888-4888-8888-888888888888",
      recordNumber: "PAC-00002",
      fullName: "Ana Lima",
      phone: "11999990000",
    };
    let patients = [existing];
    const analysis = {
      columns: [
        { index: 0, title: "nome", samples: ["Ana Lima", "Helena A."] },
        { index: 1, title: "telefone", samples: ["11999990000", "123"] },
      ],
      mapping: ["fullName", "phone"],
      rows: [
        {
          line: 2,
          status: "valid",
          fullName: "Ana Lima",
          phone: "11999990000",
          input: {
            fullName: "Ana Lima",
            phone: "11999990000",
            tags: [],
            status: "active",
          },
        },
        {
          line: 3,
          status: "error",
          fullName: "",
          phone: "123",
          errors: ["Informe o nome.", "Telefone inválido."],
        },
        {
          line: 4,
          status: "duplicate",
          fullName: "Helena A.",
          phone: "11987654321",
          duplicateOf: {
            kind: "existing",
            field: "phone",
            patientId: existing.id,
            fullName: "Helena Almeida",
          },
        },
        {
          line: 5,
          status: "duplicate",
          fullName: "Ana Lima",
          phone: "11999990000",
          duplicateOf: { kind: "row", field: "phone", line: 2 },
        },
      ],
      errors: [],
      totals: { valid: 1, error: 1, duplicate: 2 },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/patients/import/preview")
        ? analysis
        : url.endsWith("/patients/import")
          ? ((patients = [existing, imported]),
            { created: 1, skipped: 2, errors: 1 })
          : patients;
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    clickMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    const template = within(dialog).getByRole("link", {
      name: /Baixar modelo/,
    });
    expect(template).toHaveAttribute("download", "modelo-clientes.csv");
    const templateText = decodeURIComponent(
      template.getAttribute("href")!.split(",").slice(1).join(","),
    );
    expect(
      templateText.startsWith(
        "\uFEFFnome;cpf;telefone;whatsapp;email;nascimento;etiquetas;observações",
      ),
    ).toBe(true);
    expect(
      within(dialog).getByRole("button", { name: /Importar \d+ cliente/ }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: /Importar \d+ cliente/ }),
    ).toHaveAccessibleDescription("Falta: Planilha de clientes.");

    const content =
      "nome;telefone\nAna Lima;11999990000\n;123\nHelena A.;11987654321\nAna Lima;11999990000\n";
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [new File([content], "clientes.csv", { type: "text/csv" })],
      },
    });
    expect(await within(dialog).findByText("1 válido")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 com erro")).toBeInTheDocument();
    expect(within(dialog).getByText("2 duplicados")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Informe o nome. Telefone inválido."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Já cadastrado: Helena Almeida (mesmo telefone)",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Repete a linha 2 (mesmo telefone)"),
    ).toBeInTheDocument();
    const previewCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) =>
        String(url).endsWith("/patients/import/preview"),
      );
    const expectedFile = {
      fileName: "clientes.csv",
      contentBase64: btoa(content),
    };
    expect(previewCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(previewCall?.[1]?.body))).toEqual(expectedFile);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Importar 1 cliente" }),
    );
    expect(
      await screen.findByText(
        "1 cliente importado, 2 ignorados por duplicidade e 1 com erro.",
      ),
    ).toBeInTheDocument();
    const importCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/patients/import"));
    expect(importCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({
      ...expectedFile,
      mapping: ["fullName", "phone"],
    });
    expect(
      await screen.findByRole("button", { name: "Editar Ana Lima" }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes("/patients?search="))
        .length,
    ).toBe(2);
  });

  it("lets the user choose which system field each spreadsheet column fills", async () => {
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
    const columns = [
      { index: 0, title: "Aluno", samples: ["Dora Mapeada"] },
      { index: 1, title: "Documento", samples: ["529.982.247-25"] },
      { index: 2, title: "Cel.", samples: ["21988883333"] },
      { index: 3, title: "", samples: [] },
    ];
    const mapped = {
      columns,
      mapping: ["fullName", "cpf", "phone", null],
      rows: [
        {
          line: 2,
          status: "valid",
          fullName: "Dora Mapeada",
          phone: "21988883333",
          input: {
            fullName: "Dora Mapeada",
            cpf: "52998224725",
            phone: "21988883333",
            tags: [],
          },
        },
      ],
      errors: [],
      totals: { valid: 1, error: 0, duplicate: 0 },
    };
    const previews: Array<{ mapping?: unknown[] }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      let body: unknown = [];
      if (url.endsWith("/patients/import/preview")) {
        const request = JSON.parse(String(init?.body)) as {
          mapping?: (string | null)[];
        };
        previews.push(request);
        const mapping = request.mapping ?? [null, null, null, null];
        body =
          mapping.includes("fullName") && mapping.includes("phone")
            ? { ...mapped, mapping }
            : {
                columns,
                mapping,
                rows: [],
                errors: ["Escolha a coluna de nome e telefone da planilha."],
                totals: { valid: 0, error: 0, duplicate: 0 },
              };
      } else if (url.endsWith("/patients/import")) {
        body = { created: 1, skipped: 0, errors: 0 };
      }
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Mais" });
    clickMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    const content =
      "Aluno;Documento;Cel.;\nDora Mapeada;529.982.247-25;21988883333;\n";
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [new File([content], "minha.csv", { type: "text/csv" })],
      },
    });
    expect(
      await within(dialog).findByText(
        "Escolha a coluna de nome e telefone da planilha.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Ex.: 529.982.247-25")).toBeInTheDocument();
    expect(within(dialog).getByText("Sem valores")).toBeInTheDocument();
    const nameSelect = within(dialog).getByLabelText(
      "Dado do sistema para a coluna Aluno",
    );
    expect(nameSelect).toHaveValue("");
    expect(
      within(dialog).getByLabelText("Dado do sistema para a coluna Coluna 4"),
    ).toBeInTheDocument();

    fireEvent.change(nameSelect, { target: { value: "fullName" } });
    await within(dialog).findByText(
      "Escolha a coluna de nome e telefone da planilha.",
    );
    fireEvent.change(
      within(dialog).getByLabelText("Dado do sistema para a coluna Documento"),
      { target: { value: "cpf" } },
    );
    // Escolher Telefone numa coluna e depois em outra deixa a primeira como "Não importar".
    fireEvent.change(
      within(dialog).getByLabelText("Dado do sistema para a coluna Coluna 4"),
      { target: { value: "phone" } },
    );
    // Sem WhatsApp, contato de emergência e e-mail: etiquetas automáticas da CD3.
    expect(
      await within(dialog).findByText(
        "Pronta para importar · sem WhatsApp ou contato de emergência (etiqueta “Cadastro incompleto”) · sem e-mail (etiqueta “Sem e-mail”)",
      ),
    ).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByLabelText("Dado do sistema para a coluna Cel."),
      { target: { value: "phone" } },
    );
    await vi.waitFor(() => expect(previews).toHaveLength(5));
    expect(previews.map((preview) => preview.mapping)).toEqual([
      undefined,
      ["fullName", null, null, null],
      ["fullName", "cpf", null, null],
      ["fullName", "cpf", null, "phone"],
      ["fullName", "cpf", "phone", null],
    ]);
    expect(
      within(dialog).getByLabelText("Dado do sistema para a coluna Coluna 4"),
    ).toHaveValue("");

    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Importar 1 cliente" }),
    );
    expect(
      await within(dialog).findByText(/1 cliente importado/),
    ).toBeInTheDocument();
    const importCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/patients/import"));
    expect(JSON.parse(String(importCall?.[1]?.body))).toMatchObject({
      fileName: "minha.csv",
      mapping: ["fullName", "cpf", "phone", null],
    });
    // O mapeamento fica salvo para a próxima planilha com os mesmos títulos.
    expect(
      JSON.parse(localStorage.getItem("crm.patientImportMapping") ?? "{}"),
    ).toMatchObject({ mapping: ["fullName", "cpf", "phone", null] });
  });

  it("shows general spreadsheet errors and keeps import disabled", async () => {
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
      const body = String(input).endsWith("/patients/import/preview")
        ? {
            columns: [],
            mapping: [],
            rows: [],
            errors: ["A planilha precisa de uma coluna de nome."],
            totals: { valid: 0, error: 0, duplicate: 0 },
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await findMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [
          new File(["telefone\n11999990000\n"], "clientes.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    expect(
      await within(dialog).findByText(
        "A planilha precisa de uma coluna de nome.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Importar 0 clientes" }),
    ).toBeDisabled();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).endsWith("/patients/import")),
    ).toBe(false);
  });

  it("does not offer patient import to physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: [],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({ ok: true, status: 200, json: async () => [patient] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    // Desde a T053 a fisioterapeuta só consulta Clientes: sem criar nem importar.
    expect(
      screen.queryByRole("button", { name: /Novo cliente/ }),
    ).not.toBeInTheDocument();
    expect(moreActionNames()).not.toContain("Importar");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/patients/import")),
    ).toBe(false);
  });

  it("exports the patient base with the screen filters, chosen format and columns", async () => {
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
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["pilates"],
      status: "active",
      createdAt: "2026-01-10T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/patients/export")) {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["nome\nHelena"]),
        } as Response;
      }
      if (String(input).includes("/patient-tags")) {
        return {
          ok: true,
          status: 200,
          json: async () => [patientTag("pilates", "#2f855a", 1)],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [patient] } as Response;
    });
    const createObjectURL = vi.fn(() => "blob:clientes");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const downloads: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    try {
      render(
        <MemoryRouter initialEntries={["/clientes"]}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByRole("button", { name: "Editar Helena Almeida" });
      fireEvent.change(
        screen.getByPlaceholderText("Buscar por nome, CPF ou telefone"),
        { target: { value: "Hel" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
      await vi.waitFor(() =>
        expect(
          vi
            .mocked(fetch)
            .mock.calls.some(([url]) =>
              String(url).includes("/patients?search=Hel"),
            ),
        ).toBe(true),
      );
      await screen.findByRole("button", { name: "Editar Helena Almeida" });
      fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
      fireEvent.click(screen.getByRole("button", { name: "Ativos" }));
      fireEvent.change(screen.getByLabelText("Cadastro"), {
        target: { value: "birthday_month" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^pilates/ }));

      clickMoreAction("Exportar");
      const dialog = screen.getByRole("dialog", { name: "Exportar clientes" });
      expect(
        within(dialog).getByText(
          "Busca: “Hel” · Situação: ativos · Aniversariantes do mês",
        ),
      ).toBeInTheDocument();
      // A etiqueta do filtro aparece como selo na cor configurada.
      const exportTag = within(dialog).getByText("pilates");
      expect(exportTag).toHaveClass("tag-colored");
      expect(exportTag.style.getPropertyValue("--tag-color")).toBe("#2f855a");
      expect(within(dialog).getByLabelText("CSV (.csv)")).toBeChecked();
      expect(within(dialog).getByLabelText("Observações")).toBeChecked();
      fireEvent.click(within(dialog).getByLabelText("Excel (.xlsx)"));
      fireEvent.click(within(dialog).getByLabelText("Observações"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));

      await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      const exportCall = vi
        .mocked(fetch)
        .mock.calls.find(([url]) => String(url).includes("/patients/export"));
      const query = new URL(String(exportCall?.[0]), "http://localhost")
        .searchParams;
      expect(query.get("format")).toBe("xlsx");
      expect(query.get("columns")).toBe(
        "fullName,recordNumber,cpf,phone,whatsapp,email,birthDate,tags,status,emergencyContactName,emergencyContactPhone,createdAt",
      );
      expect(query.get("search")).toBe("Hel");
      expect(query.get("status")).toBe("active");
      expect(query.get("tags")).toBe("pilates");
      expect(query.get("birthdayMonth")).toBe("true");
      expect(query.has("activePlan")).toBe(false);
      expect(downloads).toEqual([`clientes-${saoPauloToday()}.xlsx`]);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:clientes");
      await vi.waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Exportar clientes" }),
        ).not.toBeInTheDocument(),
      );
    } finally {
      click.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("requires a column, applies registration filters and shows API errors", async () => {
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
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      email: "helena@exemplo.com",
      tags: [],
      status: "active",
      createdAt: "2026-01-10T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/patients/export")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            code: "EXPORT_FAILED",
            message: "Não foi possível gerar o arquivo.",
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [patient] } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.change(screen.getByLabelText("Cadastro"), {
      target: { value: "with_email" },
    });
    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: "newest" },
    });
    clickMoreAction("Exportar");
    const dialog = screen.getByRole("dialog", { name: "Exportar clientes" });
    expect(
      within(dialog).getByText("Cadastro: Com e-mail"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Cadastro: Com e-mail/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/ordem alfabética/)).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Desmarcar todas" }),
    );
    expect(within(dialog).getByLabelText("Nome")).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));
    expect(
      await within(dialog).findByText("Selecione pelo menos uma coluna."),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/patients/export")),
    ).toBe(false);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Marcar todas" }),
    );
    expect(within(dialog).getByLabelText("Nome")).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));
    expect(
      await within(dialog).findByText("Não foi possível gerar o arquivo."),
    ).toBeInTheDocument();
    const exportUrl = vi
      .mocked(fetch)
      .mock.calls.find(([url]) =>
        String(url).includes("/patients/export"),
      )?.[0];
    const query = new URL(String(exportUrl), "http://localhost").searchParams;
    expect(query.get("format")).toBe("csv");
    expect([...query.keys()].sort()).toEqual(["columns", "format", "record"]);
    expect(query.get("record")).toBe("with_email");
    expect(
      within(dialog).getByRole("button", { name: "Exportar" }),
    ).toBeEnabled();
  });

  it("paginates the patient list 20 at a time and resets to page 1 on search and filters", async () => {
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
    const patients = Array.from({ length: 45 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return {
        id: `99999999-9999-4999-8999-9999999999${number}`,
        recordNumber: `PAC-000${number}`,
        fullName: `Cliente ${number}`,
        phone: "11987654321",
        tags: index < 10 ? ["pilates"] : [],
        status: index % 2 === 0 ? "active" : "inactive",
        createdAt: "2026-01-10T12:00:00.000Z",
      };
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/patients/export")) {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["nome"]),
        } as Response;
      }
      if (String(input).includes("/patient-tags")) {
        return {
          ok: true,
          status: 200,
          json: async () => [patientTag("pilates", "#2f855a", 10)],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => patients } as Response;
    });
    const createObjectURL = vi.fn(() => "blob:clientes");
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const rows = () =>
      screen.getAllByRole("button", { name: /^Editar Cliente/ });
    try {
      render(
        <MemoryRouter initialEntries={["/clientes"]}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByRole("button", { name: "Editar Cliente 01" });
      const pagination = screen.getByRole("navigation", {
        name: "Paginação de clientes",
      });
      expect(rows()).toHaveLength(20);
      expect(
        within(pagination).getByText("Página 1 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      expect(
        within(pagination).getByRole("button", { name: /Anterior/ }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Editar Cliente 21" }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        within(pagination).getByRole("button", { name: /Próxima/ }),
      );
      expect(
        screen.getByText("Página 2 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      expect(rows()).toHaveLength(20);
      expect(
        screen.getByRole("button", { name: "Editar Cliente 21" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Editar Cliente 01" }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(
        screen.getByText("Página 3 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      expect(rows()).toHaveLength(5);
      expect(screen.getByRole("button", { name: /Próxima/ })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: /Anterior/ }));
      expect(
        screen.getByText("Página 2 de 3 · 45 clientes"),
      ).toBeInTheDocument();

      // A exportação ignora a página: segue só com os filtros da tela.
      clickMoreAction("Exportar");
      const dialog = screen.getByRole("dialog", { name: "Exportar clientes" });
      expect(
        within(dialog).getByText(
          "Nenhum filtro: todos os clientes serão exportados.",
        ),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));
      await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      const exportUrl = vi
        .mocked(fetch)
        .mock.calls.find(([url]) =>
          String(url).includes("/patients/export"),
        )?.[0];
      expect(
        [
          ...new URL(String(exportUrl), "http://localhost").searchParams.keys(),
        ].sort(),
      ).toEqual(["columns", "format"]);
      await vi.waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Exportar clientes" }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByText("Página 2 de 3 · 45 clientes"),
      ).toBeInTheDocument();

      // Busca volta para a página 1.
      fireEvent.change(
        screen.getByPlaceholderText("Buscar por nome, CPF ou telefone"),
        { target: { value: "Cliente" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
      expect(
        await screen.findByText("Página 1 de 3 · 45 clientes"),
      ).toBeInTheDocument();

      // Filtro de situação volta para a página 1.
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(
        screen.getByText("Página 3 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
      fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
      expect(
        screen.getByText("Página 1 de 2 · 22 clientes"),
      ).toBeInTheDocument();
      expect(rows()).toHaveLength(20);
      expect(
        screen.getByRole("button", { name: "Editar Cliente 02" }),
      ).toBeInTheDocument();

      // Ordenação também volta para a página 1.
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(
        screen.getByText("Página 2 de 2 · 22 clientes"),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Ordenar por"), {
        target: { value: "name_desc" },
      });
      expect(
        screen.getByText("Página 1 de 2 · 22 clientes"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Editar Cliente 44" }),
      ).toBeInTheDocument();

      // Tudo numa página: os controles somem.
      fireEvent.click(screen.getByRole("button", { name: /^pilates/ }));
      expect(rows()).toHaveLength(5);
      expect(
        screen.queryByRole("navigation", { name: "Paginação de clientes" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Próxima/ }),
      ).not.toBeInTheDocument();
    } finally {
      click.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("hides the patient pagination when every patient fits on one page", async () => {
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
    const patients = Array.from({ length: 20 }, (_, index) => ({
      id: `99999999-9999-4999-8999-9999999999${String(index + 10)}`,
      recordNumber: `PAC-000${index + 10}`,
      fullName: `Cliente ${index + 10}`,
      phone: "11987654321",
      tags: [],
      status: "active",
    }));
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({ ok: true, status: 200, json: async () => patients }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Cliente 10" });
    expect(
      screen.getAllByRole("button", { name: /^Editar Cliente/ }),
    ).toHaveLength(20);
    expect(
      screen.queryByRole("navigation", { name: "Paginação de clientes" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Página \d/)).not.toBeInTheDocument();
  });

  it("shows trial and evaluation badges in the agenda and hides client actions on lead appointments", async () => {
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
    const leadAppointment = {
      ...base,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      leadId: "44444444-4444-4444-8444-444444444444",
      leadName: "Bruna Lead",
      patientName: "Bruna Lead",
      visitType: "trial",
      startsAt: startsAt.toISOString(),
    };
    const later = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const clientAppointment = {
      ...base,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      visitType: "evaluation",
      status: "scheduled",
      startsAt: later.toISOString(),
      endsAt: new Date(later.getTime() + 50 * 60_000).toISOString(),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments?")
        ? [leadAppointment, clientAppointment]
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    const leadCard = await screen.findByRole("button", {
      name: "Detalhes de Bruna Lead",
    });
    expect(
      within(leadCard).getByText("Experimental · lead"),
    ).toBeInTheDocument();
    const clientCard = screen.getByRole("button", {
      name: "Detalhes de Helena Almeida",
    });
    expect(within(clientCard).getByText("Avaliação")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await vi.waitFor(() =>
      expect(container.querySelector(".week-agenda")).toHaveTextContent(
        "Experimental · lead",
      ),
    );
    expect(container.querySelector(".week-agenda")).toHaveTextContent(
      "Avaliação",
    );

    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Bruna Lead" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Detalhes do atendimento",
    });
    expect(within(dialog).getByText("Experimental · lead")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Lead" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Bruna Lead", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: "Dados do cliente" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Prontuário")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Histórico/ }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/satisfaction")),
    ).toBe(false);
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
  });

  it("highlights the emergency contact fields in the client record without an SOS button", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      emergencyContactName: "",
      tags: [],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/timeline") ? [] : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar cliente" });
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Contato de emergência" }),
    ).toHaveClass("emergency-fieldset");
  });

  it("does not show the SOS button when creating a new client", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo cliente/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
  });
});
