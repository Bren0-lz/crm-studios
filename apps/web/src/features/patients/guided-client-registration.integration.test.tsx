import type { AppModule } from "@crm/contracts";
import {
  cleanup,
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

describe("guided client registration", () => {
  const admin = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const pilatesId = "77777777-7777-4777-8777-777777777777";
  const physioId = "78787878-7878-4878-8878-787878787878";
  const professionalId = "33333333-3333-4333-8333-333333333333";
  const roomId = "55555555-5555-4555-8555-555555555555";
  const created = {
    id: "99999999-9999-4999-8999-999999999999",
    clinicId: "11111111-1111-4111-8111-111111111111",
    recordNumber: "PAC-00042",
    fullName: "Marina Costa",
    phone: "11987654321",
    tags: [],
    status: "active",
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
  const pilatesTemplate = {
    id: "b1111111-1111-4111-8111-111111111111",
    name: "Pilates 2x semana",
    kind: "fixed_package",
    active: true,
    totalValueInCents: 48000,
    services: [
      { serviceId: pilatesId, totalSessions: 8, totalValueInCents: 48000 },
    ],
  };
  const physioTemplate = {
    ...pilatesTemplate,
    id: "b2222222-2222-4222-8222-222222222222",
    name: "Fisioterapia",
    services: [
      { serviceId: physioId, totalSessions: 8, totalValueInCents: 48000 },
    ],
  };
  const singleTemplate = {
    ...pilatesTemplate,
    id: "b3333333-3333-4333-8333-333333333333",
    name: "Serviço avulso",
    kind: "single",
    totalValueInCents: 9000,
    services: [
      { serviceId: pilatesId, totalSessions: 1, totalValueInCents: 9000 },
    ],
  };
  function group(
    id: string,
    name: string,
    serviceId: string,
    extra: Record<string, unknown> = {},
  ) {
    return {
      id,
      clinicId: created.clinicId,
      name,
      sequence: 1,
      serviceId,
      serviceName: "Pilates",
      professionalId,
      professionalName: "Dra. Ana Martins",
      roomId,
      roomName: "Sala Movimento",
      capacity: 4,
      activeEnrollments: 1,
      waitlistCount: 0,
      active: true,
      weeklySlots: [{ weekday: 1, startTime: "08:00", durationMinutes: 60 }],
      createdAt: "2026-01-01T00:00:00.000Z",
      ...extra,
    };
  }
  const groups = [
    group("a1111111-1111-4111-8111-111111111111", "Pilates 1", pilatesId),
    group("a2222222-2222-4222-8222-222222222222", "Pilates 2", pilatesId, {
      professionalName: "Prof. Bruno Lima",
      activeEnrollments: 4,
    }),
    group("a3333333-3333-4333-8333-333333333333", "Fisioterapia 1", physioId),
    group("a4444444-4444-4444-8444-444444444444", "Pilates antiga", pilatesId, {
      active: false,
    }),
  ];
  function jsonResponse(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }
  /** Cadastros simples e guiados, com os planos do catálogo vigente. */
  function mockApi(guided: (body: Record<string, unknown>) => Response) {
    const posts: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/patients/guided")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(body);
        return guided(body);
      }
      if (init?.method === "POST" && url.endsWith("/patients")) {
        posts.push({ patient: JSON.parse(String(init.body)) });
        return jsonResponse(created, 201);
      }
      if (url.includes("/plan-templates"))
        return jsonResponse([pilatesTemplate, physioTemplate, singleTemplate]);
      if (url.includes("/patient-tags")) return jsonResponse([]);
      if (url.includes("/professionals"))
        return jsonResponse([
          {
            id: professionalId,
            fullName: "Dra. Ana Martins",
            color: "#5c6f68",
          },
        ]);
      if (url.includes("/rooms"))
        return jsonResponse([
          { id: roomId, name: "Sala Movimento", capacity: 6 },
        ]);
      if (url.includes("/services"))
        return jsonResponse([
          { id: pilatesId, name: "Pilates", priceInCents: 9000 },
          { id: physioId, name: "Fisioterapia", priceInCents: 12000 },
        ]);
      if (url.includes("/groups/workspace?"))
        return jsonResponse({
          groups,
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        });
      return jsonResponse([]);
    });
    return posts;
  }
  function renderAs(user: string) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", user);
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
  }
  async function openNewClient() {
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Marina Costa" },
    });
    fireEvent.change(within(dialog).getAllByLabelText("Telefone")[0]!, {
      target: { value: "11987654321" },
    });
    return dialog;
  }
  function customUser(editModules: AppModule[]) {
    return JSON.stringify({
      id: "55555555-5555-4555-8555-555555555555",
      fullName: "Carla Personalizada",
      email: "carla@movimenta.local",
      role: "user",
      modules: ["patients", "agenda", "plans", "groups"],
      editModules,
    });
  }

  it("asks what the client will do and only registers when chosen 'Só cadastrar por enquanto'", async () => {
    const posts = mockApi(() => jsonResponse({ patient: created }, 201));
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    const question = within(dialog).getByRole("group", {
      name: "O que o cliente vai fazer?",
    });
    expect(
      within(question)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual([
      "Aula de demonstração",
      "Assinar um plano",
      "Serviço avulso",
      "Só cadastrar por enquanto",
    ]);
    expect(
      within(question).getByRole("radio", {
        name: "Só cadastrar por enquanto",
      }),
    ).toBeChecked();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    );
    expect(
      await screen.findByRole("button", { name: "Editar Marina Costa" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Cliente cadastrado" }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      patient: { fullName: "Marina Costa", phone: "11987654321" },
    });
    expect(posts[0]).not.toHaveProperty("next");
    expect(posts[0]).not.toHaveProperty("appointment");
    expect(posts[0]).not.toHaveProperty("plan");
  });

  it("books a demonstration class with service, professional, room and time", async () => {
    const posts = mockApi((body) => {
      const appointment = body.appointment as Record<string, unknown>;
      return jsonResponse(
        {
          patient: created,
          appointment: {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            patientId: created.id,
            patientName: created.fullName,
            ...appointment,
            visitType: "trial",
            endsAt: appointment.startsAt,
            status: "scheduled",
            serviceName: "Pilates",
            professionalName: "Dra. Ana Martins",
            roomName: "Sala Movimento",
            professionalColor: "#5c6f68",
          },
        },
        201,
      );
    });
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Aula de demonstração" }),
    );
    const service = await within(dialog).findByLabelText("Serviço");
    expect(service).toHaveValue(pilatesId);
    fireEvent.change(service, { target: { value: physioId } });
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue(
      professionalId,
    );
    expect(within(dialog).getByLabelText("Sala")).toHaveValue(roomId);
    fireEvent.change(within(dialog).getByLabelText("Data e horário"), {
      target: { value: "2026-10-06T09:00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar demonstração",
      }),
    );
    expect(
      await screen.findByText(/Aula de demonstração agendada para/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts[0]).toEqual({
      next: "demonstration",
      patient: expect.objectContaining({ fullName: "Marina Costa" }),
      appointment: {
        serviceId: physioId,
        professionalId,
        roomId,
        startsAt: new Date("2026-10-06T09:00").toISOString(),
        notes: "",
      },
    });
  });

  it("keeps the form filled and shows the API error when the guided registration fails", async () => {
    let fail = true;
    const posts = mockApi(() =>
      fail
        ? jsonResponse(
            {
              code: "APPOINTMENT_CONFLICT",
              message: "Profissional já tem atendimento neste horário.",
            },
            409,
          )
        : jsonResponse({ patient: created }, 201),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Aula de demonstração" }),
    );
    await within(dialog).findByLabelText("Serviço");
    fireEvent.change(within(dialog).getByLabelText("Data e horário"), {
      target: { value: "2026-10-06T09:00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar demonstração",
      }),
    );
    expect(
      await within(dialog).findByText(
        "Profissional já tem atendimento neste horário.",
      ),
    ).toHaveClass("form-error");
    expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
      "Marina Costa",
    );
    expect(
      within(dialog).getByRole("radio", { name: "Aula de demonstração" }),
    ).toBeChecked();
    expect(within(dialog).getByLabelText("Data e horário")).toHaveValue(
      "2026-10-06T09:00",
    );
    expect(
      screen.queryByRole("button", { name: "Editar Marina Costa" }),
    ).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar demonstração",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Editar Marina Costa" }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(2);
  });

  it("subscribes a plan with an optional class of the same service and warns about the waiting list", async () => {
    const posts = mockApi((body) =>
      jsonResponse(
        {
          patient: created,
          plan: {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            patientId: created.id,
            patientName: created.fullName,
            serviceName: "Pilates",
            ...(body.plan as object),
            status: "active",
            remainingSessions: 8,
          },
          enrollment: body.groupId
            ? {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                clinicId: created.clinicId,
                groupId: body.groupId,
                patientId: created.id,
                patientName: created.fullName,
                status: "waitlisted",
                queuePosition: 2,
                enrolledAt: "2026-10-04T12:00:00.000Z",
                updatedAt: "2026-10-04T12:00:00.000Z",
              }
            : undefined,
        },
        201,
      ),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    const catalog = await within(dialog).findByLabelText("Plano cadastrado");
    expect(catalog).toHaveValue("");
    fireEvent.change(catalog, { target: { value: pilatesTemplate.id } });
    const model = within(dialog).getByLabelText("Modelo");
    expect(
      within(model)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Pacote fixo", "Recorrente"]);
    expect(
      within(dialog).getByText(
        "A turma pode ser escolhida depois com o responsável.",
      ),
    ).toBeInTheDocument();
    const turma = await within(dialog).findByLabelText("Turma (opcional)");
    expect(turma).toHaveValue("");
    // Só turmas ativas do serviço do plano, com o responsável e as vagas.
    expect(
      within(turma)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual([
      "Escolher depois",
      expect.stringMatching(/^Pilates 1 — .* · Dra\. Ana Martins · 3 vagas$/),
      expect.stringMatching(
        /^Pilates 2 — .* · Prof\. Bruno Lima · turma cheia \(lista de espera\)$/,
      ),
    ]);
    fireEvent.change(turma, { target: { value: groups[1]!.id } });
    fireEvent.change(within(dialog).getByLabelText("Sessões do serviço 1"), {
      target: { value: "8" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor do serviço 1"), {
      target: { value: "480" },
    });
    // Trocar o plano limpa a turma escolhida (ela é de outro serviço).
    fireEvent.change(catalog, { target: { value: physioTemplate.id } });
    expect(within(dialog).getByLabelText("Turma (opcional)")).toHaveValue("");
    expect(
      within(within(dialog).getByLabelText("Turma (opcional)")).getAllByRole(
        "option",
      ),
    ).toHaveLength(2);
    fireEvent.change(catalog, { target: { value: pilatesTemplate.id } });
    fireEvent.change(within(dialog).getByLabelText("Turma (opcional)"), {
      target: { value: groups[1]!.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    );
    // O aviso aparece fora do modal (a opção "turma cheia (lista de espera)" some com ele).
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "A turma Pilates 2 está cheia: o cliente entrou na lista de espera (posição 2).",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts[0]).toMatchObject({
      next: "plan",
      groupId: groups[1]!.id,
      plan: {
        planTemplateId: pilatesTemplate.id,
        kind: "fixed_package",
        name: "Pilates 2x semana",
        services: [
          { serviceId: pilatesId, totalSessions: 8, totalValueInCents: 48000 },
        ],
        totalValueInCents: 48000,
      },
    });
  });

  it("sells a single service without model nor class", async () => {
    const posts = mockApi((body) =>
      jsonResponse(
        {
          patient: created,
          plan: {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            patientId: created.id,
            patientName: created.fullName,
            serviceName: "Pilates",
            ...(body.plan as object),
            kind: "single",
            status: "active",
            remainingSessions: 1,
          },
        },
        201,
      ),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Serviço avulso" }),
    );
    const catalog = await within(dialog).findByLabelText("Plano cadastrado");
    fireEvent.change(catalog, { target: { value: singleTemplate.id } });
    expect(within(dialog).queryByLabelText("Modelo")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Turma (opcional)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e criar serviço avulso",
      }),
    );
    expect(
      await screen.findByText(/Serviço avulso .* criado/),
    ).toBeInTheDocument();
    expect(posts[0]).toMatchObject({
      next: "single",
      plan: {
        planTemplateId: singleTemplate.id,
        services: [
          { serviceId: pilatesId, totalSessions: 1, totalValueInCents: 9000 },
        ],
      },
    });
    expect(posts[0]!.plan).not.toHaveProperty("kind");
    expect(posts[0]).not.toHaveProperty("groupId");
  });

  it("hides the options the user cannot edit", async () => {
    mockApi(() => jsonResponse({ patient: created }, 201));
    renderAs(customUser(["patients"]));
    let dialog = await openNewClient();
    expect(
      within(dialog).queryByRole("group", {
        name: "O que o cliente vai fazer?",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    ).toBeInTheDocument();
    cleanup();

    renderAs(customUser(["patients", "agenda"]));
    dialog = await openNewClient();
    let question = within(dialog).getByRole("group", {
      name: "O que o cliente vai fazer?",
    });
    expect(
      within(question)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual(["Aula de demonstração", "Só cadastrar por enquanto"]);
    cleanup();

    // Edita Planos mas não Turmas: plano sem o campo de turma (e sem buscar as turmas).
    renderAs(customUser(["patients", "plans"]));
    dialog = await openNewClient();
    question = within(dialog).getByRole("group", {
      name: "O que o cliente vai fazer?",
    });
    expect(
      within(question)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual([
      "Assinar um plano",
      "Serviço avulso",
      "Só cadastrar por enquanto",
    ]);
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    await within(dialog).findByLabelText("Plano cadastrado");
    expect(
      within(dialog).queryByLabelText("Turma (opcional)"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A turma pode ser escolhida depois com o responsável.",
      ),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/groups/workspace")),
    ).toBe(false);
  });

  it("filters subscribers without a class and links each one to the enrollment", async () => {
    const subscriber = { ...created, fullName: "Helena Almeida" };
    const other = {
      ...created,
      id: "98989898-9898-4898-8898-989898989898",
      fullName: "Bruno Souza",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patient-tags")) return jsonResponse([]);
      if (url.includes("/groups/workspace?"))
        return jsonResponse({
          groups,
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        });
      if (url.includes("/patients/options"))
        return jsonResponse([
          { id: subscriber.id, fullName: subscriber.fullName, tags: [] },
          { id: other.id, fullName: other.fullName, tags: [] },
        ]);
      if (url.includes("/patients?"))
        return jsonResponse(
          url.includes("withoutGroup=true")
            ? [subscriber]
            : [other, subscriber],
        );
      return jsonResponse([]);
    });
    renderAs(storedUser(admin));
    await screen.findByRole("button", { name: "Editar Bruno Souza" });
    expect(screen.queryByText("Sem turma")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Assinantes sem turma vinculada" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Editar Bruno Souza" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url]) =>
            String(url).includes("/patients?") &&
            String(url).includes("withoutGroup=true"),
        ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent(
      "1",
    );
    const row = screen.getByRole("button", {
      name: "Abrir ficha de Helena Almeida",
    });
    expect(within(row).getByText("Sem turma")).toHaveClass("status-pill");
    const link = within(row).getByRole("link", {
      name: "Matricular Helena Almeida em uma turma",
    });
    expect(link).toHaveAttribute("href", `/turmas?matricular=${subscriber.id}`);
    fireEvent.click(link);
    const drawer = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    await waitFor(() =>
      expect(
        within(drawer).getByRole("combobox", { name: "Cliente" }),
      ).toHaveValue(subscriber.fullName),
    );
  });

  it("clears the subscribers filter reloading the full list", async () => {
    const subscriber = { ...created, fullName: "Helena Almeida" };
    const other = {
      ...created,
      id: "98989898-9898-4898-8898-989898989898",
      fullName: "Bruno Souza",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patient-tags")) return jsonResponse([]);
      return jsonResponse(
        url.includes("withoutGroup=true") ? [subscriber] : [other, subscriber],
      );
    });
    renderAs(customUser(["patients"]));
    await screen.findByRole("button", { name: "Editar Bruno Souza" });
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Assinantes sem turma vinculada" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Editar Bruno Souza" }),
      ).not.toBeInTheDocument(),
    );
    // Sem editar Turmas: o selo aparece, mas sem o atalho para matricular.
    const row = screen.getByRole("button", {
      name: "Abrir ficha de Helena Almeida",
    });
    expect(within(row).getByText("Sem turma")).toBeInTheDocument();
    expect(
      within(row).queryByRole("link", { name: "Matricular" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Limpar filtros" })[0]!,
    );
    expect(
      await screen.findByRole("button", { name: "Editar Bruno Souza" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sem turma")).not.toBeInTheDocument();
  });
});
