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
      weeklySlots: [{ weekday: 1, startTime: "08:00", endTime: "09:00" }],
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
    fireEvent.change(within(dialog).getByLabelText("CPF"), {
      target: { value: "52998224725" },
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
      "Aula experimental",
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
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
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
      within(dialog).getByRole("radio", { name: "Aula experimental" }),
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
        name: "Salvar e agendar aula experimental",
      }),
    );
    expect(
      await screen.findByText(/Aula experimental agendada para/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
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
      within(dialog).getByRole("radio", { name: "Aula experimental" }),
    );
    await within(dialog).findByLabelText("Serviço");
    fireEvent.change(within(dialog).getByLabelText("Data e horário"), {
      target: { value: "2026-10-06T09:00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar aula experimental",
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
      within(dialog).getByRole("radio", { name: "Aula experimental" }),
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
        name: "Salvar e agendar aula experimental",
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
    // V7: o bloco de cada serviço do plano usa a borda e o raio do padrão.
    for (const group of dialog.querySelectorAll("fieldset fieldset"))
      expect(group).toHaveClass("form-fieldset");
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
    expect(
      within(dialog).queryByRole("region", { name: /^Detalhes da turma/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(turma, { target: { value: groups[1]!.id } });
    // Escolhida a turma, aparecem os dias e horários para repassar ao cliente.
    const details = within(dialog).getByRole("region", {
      name: "Detalhes da turma Pilates 2",
    });
    expect(within(details).getByText("Prof. Bruno Lima")).toBeInTheDocument();
    expect(
      within(details)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Segunda-feira08:00 às 09:00"]);
    expect(within(details).getByText(/^Turma cheia/)).toBeInTheDocument();
    // Plano é fixo: sessões e valor vêm do plano cadastrado.
    expect(
      within(dialog).getByLabelText("Sessões do serviço 1"),
    ).toHaveAttribute("readonly");
    expect(within(dialog).getByLabelText("Valor do serviço 1")).toHaveAttribute(
      "readonly",
    );
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
    expect(
      await screen.findByText(
        /A turma Pilates 2 está cheia: o cliente entrou na lista de espera \(posição 2\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
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

  it("subscribes several plans at once, each with its own class", async () => {
    const planResult = (plan: object, id: string) => ({
      id,
      patientId: created.id,
      patientName: created.fullName,
      ...plan,
      status: "active",
      remainingSessions: 8,
    });
    const posts = mockApi((body) => {
      const additional = body.additionalPlans as {
        plan: object;
        groupId?: string;
      }[];
      return jsonResponse(
        {
          patient: created,
          plan: planResult(
            body.plan as object,
            "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          ),
          additionalPlans: additional.map((entry) => ({
            plan: planResult(
              entry.plan,
              "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
            ),
            enrollment: {
              id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              clinicId: created.clinicId,
              groupId: entry.groupId,
              patientId: created.id,
              patientName: created.fullName,
              status: "active",
              enrolledAt: "2026-10-04T12:00:00.000Z",
              updatedAt: "2026-10-04T12:00:00.000Z",
            },
          })),
        },
        201,
      );
    });
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    fireEvent.change(await within(dialog).findByLabelText("Plano cadastrado"), {
      target: { value: pilatesTemplate.id },
    });
    // Um plano só: nada para remover.
    expect(
      within(dialog).queryByRole("button", { name: /^Remover plano/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar outro plano" }),
    );
    const first = within(dialog).getByRole("group", { name: "Plano 1" });
    const second = within(dialog).getByRole("group", { name: "Plano 2" });
    // O segundo plano ainda sem escolha trava o salvamento.
    expect(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    ).toBeDisabled();
    fireEvent.change(await within(second).findByLabelText("Plano cadastrado"), {
      target: { value: physioTemplate.id },
    });
    fireEvent.change(within(second).getByLabelText("Modelo"), {
      target: { value: "recurring" },
    });
    const secondGroup =
      await within(second).findByLabelText("Turma (opcional)");
    expect(
      within(secondGroup)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Escolher depois", expect.stringMatching(/^Fisioterapia 1 — /)]);
    fireEvent.change(secondGroup, { target: { value: groups[2]!.id } });
    // Um terceiro plano adicionado e removido não vai para o cadastro.
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar outro plano" }),
    );
    fireEvent.click(
      within(within(dialog).getByRole("group", { name: "Plano 3" })).getByRole(
        "button",
        { name: "Remover plano 3" },
      ),
    );
    expect(
      within(dialog).queryByRole("group", { name: "Plano 3" }),
    ).not.toBeInTheDocument();
    expect(within(first).getByLabelText("Plano cadastrado")).toHaveValue(
      pilatesTemplate.id,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    );
    expect(
      await screen.findByText(
        "Planos “Pilates 2x semana” e “Fisioterapia” criados. Matrícula feita na turma Fisioterapia 1.",
      ),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      next: "plan",
      plan: { planTemplateId: pilatesTemplate.id, kind: "fixed_package" },
      additionalPlans: [
        {
          groupId: groups[2]!.id,
          plan: {
            planTemplateId: physioTemplate.id,
            kind: "recurring",
            installments: 1,
            services: [
              {
                serviceId: physioId,
                totalSessions: 8,
                totalValueInCents: 48000,
              },
            ],
          },
        },
      ],
    });
    expect(posts[0]).not.toHaveProperty("groupId");
  });

  it("mixes a plan with single services in the same registration", async () => {
    const planResult = (plan: object, id: string) => ({
      id,
      patientId: created.id,
      patientName: created.fullName,
      ...plan,
      status: "active",
      remainingSessions: 1,
    });
    const posts = mockApi((body) =>
      jsonResponse(
        {
          patient: created,
          plan: planResult(
            body.plan as object,
            "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          ),
          additionalPlans: (body.additionalPlans as { plan: object }[]).map(
            (entry) => ({
              plan: planResult(
                entry.plan,
                "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
              ),
            }),
          ),
        },
        201,
      ),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    fireEvent.change(await within(dialog).findByLabelText("Plano cadastrado"), {
      target: { value: pilatesTemplate.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar serviço avulso" }),
    );
    const single = within(dialog).getByRole("group", {
      name: "Serviço avulso",
    });
    // Avulso: só os planos do tipo avulso, sem modelo nem turma.
    const catalog = await within(single).findByLabelText("Plano cadastrado");
    expect(
      within(catalog)
        .getAllByRole("option")
        .map((item) => item.getAttribute("value")),
    ).toEqual(["", singleTemplate.id]);
    expect(within(single).queryByLabelText("Modelo")).not.toBeInTheDocument();
    expect(
      within(single).queryByLabelText("Turma (opcional)"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    ).toBeDisabled();
    fireEvent.change(catalog, { target: { value: singleTemplate.id } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    );
    expect(
      await screen.findByText(
        "Plano “Pilates 2x semana” criado. Serviço avulso “Serviço avulso” criado.",
      ),
    ).toBeInTheDocument();
    expect(posts[0]).toMatchObject({
      next: "plan",
      plan: { planTemplateId: pilatesTemplate.id, kind: "fixed_package" },
      additionalPlans: [
        {
          plan: {
            planTemplateId: singleTemplate.id,
            kind: "single",
            installments: 1,
            totalValueInCents: 9000,
          },
        },
      ],
    });
    expect(
      (posts[0]!.additionalPlans as Record<string, unknown>[])[0],
    ).not.toHaveProperty("groupId");
  });

  it("prorates the first charge of a recurring plan by the classes until the due date", async () => {
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
        },
        201,
      ),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    fireEvent.change(await within(dialog).findByLabelText("Plano cadastrado"), {
      target: { value: pilatesTemplate.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Modelo"), {
      target: { value: "recurring" },
    });
    fireEvent.change(within(dialog).getByLabelText("Início"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("Primeiro vencimento"), {
      target: { value: "2026-10-15" },
    });
    expect(
      within(dialog).getByText(/^Escolha a turma para calcular o 1º pagamento/),
    ).toBeInTheDocument();
    // Pilates 1 é às segundas: 4 aulas em outubro, 2 delas até o dia 15.
    fireEvent.change(await within(dialog).findByLabelText("Turma (opcional)"), {
      target: { value: groups[0]!.id },
    });
    const note = within(dialog).getByText(/^1º pagamento proporcional/);
    expect(note).toHaveTextContent(
      /R\$\s240,00 \(2 aulas da turma até 15\/10\/2026, de 4 aulas no ciclo até 31\/10\/2026\)/,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      next: "plan",
      groupId: groups[0]!.id,
      plan: {
        kind: "recurring",
        installments: 1,
        totalValueInCents: 48000,
        firstDueDate: "2026-10-15",
        firstInstallmentInCents: 24000,
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
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
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

  describe("payment method", () => {
    /** Plano criado pela API ecoando os termos enviados, e a chave Pix da clínica. */
    function mockPlanSale(pixKey: string, pixMessageTemplate = "") {
      const posts = mockApi((body) =>
        jsonResponse(
          {
            patient: created,
            plan: {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              patientId: created.id,
              patientName: created.fullName,
              serviceName: "Pilates",
              serviceId: pilatesId,
              ...(body.plan as object),
              totalSessions: 8,
              status: "active",
              remainingSessions: 8,
            },
          },
          201,
        ),
      );
      const base = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) =>
        String(input).includes("/clinic/branding")
          ? jsonResponse({
              name: "Studios Aryana",
              logoDataUrl: "",
              pixKey,
              pixMessageTemplate,
            })
          : base(input, init),
      );
      renderAs(storedUser(admin));
      return posts;
    }
    async function choosePlanWithPix() {
      const dialog = await openNewClient();
      fireEvent.click(
        within(dialog).getByRole("radio", { name: "Assinar um plano" }),
      );
      const catalog = await within(dialog).findByLabelText("Plano cadastrado");
      fireEvent.change(catalog, { target: { value: pilatesTemplate.id } });
      const method = within(dialog).getByLabelText("Forma de pagamento");
      expect(method).toHaveValue("");
      fireEvent.change(method, { target: { value: "pix" } });
      return dialog;
    }

    it("sends the Pix key and the default message with the value per session", async () => {
      const posts = mockPlanSale("financeiro@aryana.com.br");
      const dialog = await choosePlanWithPix();
      const preview = await within(dialog).findByLabelText(
        "Mensagem do Pix (enviada pelo WhatsApp ao salvar)",
      );
      expect((preview as HTMLTextAreaElement).value).toContain(
        "o plano “Pilates 2x semana” tem 8 sessões por R$ 480,00 (R$ 60,00 por sessão), em 3 parcelas; a 1ª parcela é de R$ 160,00. Chave Pix: financeiro@aryana.com.br.",
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
      );
      const charge = await screen.findByRole("dialog", {
        name: "Enviar cobrança Pix",
      });
      expect(posts[0]).toMatchObject({
        next: "plan",
        plan: { planTemplateId: pilatesTemplate.id, paymentMethod: "pix" },
      });
      const link = within(charge).getByRole("link", {
        name: "Enviar Pix pelo WhatsApp",
      });
      const href = link.getAttribute("href")!;
      expect(href.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
      expect(decodeURIComponent(href.split("?text=")[1]!)).toBe(
        "Olá, Marina! Tudo bem? Seja bem-vindo(a)! Para confirmar, o plano “Pilates 2x semana” tem 8 sessões por R$ 480,00 (R$ 60,00 por sessão), em 3 parcelas; a 1ª parcela é de R$ 160,00. Chave Pix: financeiro@aryana.com.br. Assim que fizer o pagamento, envie o comprovante por aqui. Obrigado!",
      );
      fireEvent.click(within(charge).getByRole("button", { name: "Concluir" }));
      expect(
        await screen.findByText("Plano “Pilates 2x semana” criado."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Enviar cobrança Pix" }),
      ).not.toBeInTheDocument();
    });

    it("charges the first installment already with the plan discount", async () => {
      const posts = mockPlanSale("financeiro@aryana.com.br");
      const dialog = await choosePlanWithPix();
      // O desconto fica no fim do bloco do plano, não no cadastro do cliente.
      const planBlock = within(dialog).getByRole("group", { name: "Plano" });
      expect(
        within(planBlock).getByText("Sem desconto neste plano."),
      ).toBeVisible();
      fireEvent.click(
        within(planBlock).getByRole("button", { name: "Configurar desconto" }),
      );
      const discount = await screen.findByRole("dialog", {
        name: "Desconto do plano",
      });
      fireEvent.click(within(discount).getByLabelText("Valor (R$)"));
      fireEvent.change(
        within(discount).getByLabelText("Valor do desconto (R$)"),
        { target: { value: "20,00" } },
      );
      fireEvent.click(
        within(discount).getByRole("button", { name: "Aplicar desconto" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Desconto do plano" }),
        ).toBeNull(),
      );
      expect(
        within(planBlock).getByText(
          /R\$\s20,00 de desconto · só no próximo pagamento/,
        ),
      ).toBeVisible();
      const bag = within(dialog).getByRole("group", { name: "Sacola" });
      expect(within(bag).getByText("Desconto do plano")).toBeVisible();
      expect(within(bag).getByText("Total").closest("div")).toHaveTextContent(
        /R\$\s460,00/,
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
      );
      const charge = await screen.findByRole("dialog", {
        name: "Enviar cobrança Pix",
      });
      expect(posts[0]).toMatchObject({
        plan: {
          discount: { type: "amount", amountInCents: 2000, scope: "once" },
        },
      });
      expect(posts[0]!.patient).not.toHaveProperty("discount");
      const href = within(charge)
        .getByRole("link", { name: "Enviar Pix pelo WhatsApp" })
        .getAttribute("href")!;
      expect(decodeURIComponent(href.split("?text=")[1]!)).toContain(
        "em 3 parcelas; a 1ª parcela é de R$ 140,00, já com o seu desconto de R$ 20,00. Chave Pix:",
      );
    });

    it("sells a product with its own discount and a general discount on the bag", async () => {
      const bottle = {
        id: "e1111111-1111-4111-8111-111111111111",
        clinicId: created.clinicId,
        name: "Garrafa térmica",
        unit: "un",
        active: true,
        salePriceInCents: 5_000,
        currentStock: 5,
        sizes: [],
        sizeStock: [],
      };
      const sales: Array<Record<string, unknown>> = [];
      const posts = mockPlanSale("");
      const base = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/inventory/workspace"))
          return jsonResponse({ products: [bottle], movements: [] });
        if (init?.method === "POST" && url.endsWith("/product-sales")) {
          sales.push(JSON.parse(String(init.body)) as Record<string, unknown>);
          return jsonResponse({ totalInCents: 8_100 }, 201);
        }
        return base(input, init);
      });
      const dialog = await openNewClient();
      fireEvent.click(
        within(dialog).getByRole("radio", { name: "Assinar um plano" }),
      );
      fireEvent.change(
        await within(dialog).findByLabelText("Plano cadastrado"),
        {
          target: { value: pilatesTemplate.id },
        },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Adicionar produto" }),
      );
      const productBlock = within(dialog).getByRole("group", {
        name: "Produto",
      });
      fireEvent.change(await within(productBlock).findByLabelText("Produto"), {
        target: { value: bottle.id },
      });
      fireEvent.change(within(productBlock).getByLabelText("Quantidade"), {
        target: { value: "2" },
      });
      // Desconto do produto: só porcentagem/valor, sem alcance de cobranças.
      fireEvent.click(
        within(productBlock).getByRole("button", {
          name: "Configurar desconto",
        }),
      );
      const productDiscount = await screen.findByRole("dialog", {
        name: "Desconto do produto",
      });
      expect(
        within(productDiscount).queryByText("Onde o desconto vale"),
      ).toBeNull();
      fireEvent.change(
        within(productDiscount).getByLabelText("Porcentagem de desconto (%)"),
        { target: { value: "10" } },
      );
      fireEvent.click(
        within(productDiscount).getByRole("button", {
          name: "Aplicar desconto",
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Desconto do produto" }),
        ).toBeNull(),
      );
      // Desconto geral sobre plano + produto (R$ 480 + R$ 90), configurado na sacola.
      const bag = within(dialog).getByRole("group", { name: "Sacola" });
      fireEvent.click(
        within(bag).getByRole("button", { name: "Configurar desconto" }),
      );
      const general = await screen.findByRole("dialog", {
        name: "Desconto geral",
      });
      fireEvent.click(within(general).getByLabelText("Valor (R$)"));
      fireEvent.change(
        within(general).getByLabelText("Valor do desconto (R$)"),
        { target: { value: "57,00" } },
      );
      fireEvent.click(
        within(general).getByRole("button", { name: "Aplicar desconto" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Desconto geral" }),
        ).toBeNull(),
      );
      const items = within(bag).getByRole("list", { name: "Itens da sacola" });
      expect(items).toHaveTextContent("Pilates 2x semana");
      expect(items).toHaveTextContent("Garrafa térmica");
      expect(
        within(bag).getByText("Subtotal").closest("div"),
      ).toHaveTextContent(/R\$\s580,00/);
      expect(
        within(bag).getByText("Descontos dos itens").closest("div"),
      ).toHaveTextContent(/R\$\s10,00/);
      expect(
        within(bag).getByText("Desconto geral").closest("div"),
      ).toHaveTextContent(/R\$\s57,00/);
      expect(within(bag).getByText("Total").closest("div")).toHaveTextContent(
        /R\$\s513,00/,
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
      );
      await waitFor(() => expect(sales).toHaveLength(1));
      // O plano leva a parte dele do desconto geral; o produto vai com o preço descontado.
      expect(posts[0]).toMatchObject({
        plan: {
          planTemplateId: pilatesTemplate.id,
          orderDiscountInCents: 4_800,
        },
      });
      expect(sales[0]).toMatchObject({
        patientId: created.id,
        items: [{ productId: bottle.id, quantity: 2, unitPriceInCents: 4_050 }],
        settlement: "paid",
        paymentMethod: "pix",
      });
    });

    it("uses the message configured by the clinic", async () => {
      mockPlanSale(
        "financeiro@aryana.com.br",
        "Oi {{nome}}, {{sessoes}} do {{plano}}: {{parcelas}}x de {{valor_parcela}}. Pix {{chave_pix}}",
      );
      const dialog = await choosePlanWithPix();
      const expected =
        "Oi Marina, 8 sessões do Pilates 2x semana: 3x de R$ 160,00. Pix financeiro@aryana.com.br";
      expect(
        await within(dialog).findByLabelText(
          "Mensagem do Pix (enviada pelo WhatsApp ao salvar)",
        ),
      ).toHaveValue(expected);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
      );
      const charge = await screen.findByRole("dialog", {
        name: "Enviar cobrança Pix",
      });
      const href = within(charge)
        .getByRole("link", { name: "Enviar Pix pelo WhatsApp" })
        .getAttribute("href")!;
      expect(decodeURIComponent(href.split("?text=")[1]!)).toBe(expected);
    });

    it("explains where to register the Pix key and only saves the method without it", async () => {
      const posts = mockPlanSale("");
      const dialog = await choosePlanWithPix();
      expect(
        await within(dialog).findByText(/Nenhuma chave Pix cadastrada/),
      ).toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
      );
      expect(
        await screen.findByText("Plano “Pilates 2x semana” criado."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Enviar cobrança Pix" }),
      ).not.toBeInTheDocument();
      expect(posts[0]).toMatchObject({ plan: { paymentMethod: "pix" } });
    });

    it("sends another method without a Pix charge", async () => {
      const posts = mockPlanSale("financeiro@aryana.com.br");
      const dialog = await choosePlanWithPix();
      fireEvent.change(within(dialog).getByLabelText("Forma de pagamento"), {
        target: { value: "card" },
      });
      expect(
        within(dialog).queryByLabelText(
          "Mensagem do Pix (enviada pelo WhatsApp ao salvar)",
        ),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
      );
      expect(
        await screen.findByText("Plano “Pilates 2x semana” criado."),
      ).toBeInTheDocument();
      expect(posts[0]).toMatchObject({ plan: { paymentMethod: "card" } });
    });
  });

  describe("single service catalog", () => {
    const massageId = "79797979-7979-4979-8979-797979797979";
    const massageTemplate = {
      id: "b4444444-4444-4444-8444-444444444444",
      name: "Massagem relaxante",
      planType: "single",
      kind: null,
      active: true,
      totalValueInCents: 15000,
      services: [
        { serviceId: massageId, totalSessions: 1, totalValueInCents: 15000 },
      ],
    };
    /** Troca o catálogo de planos e os serviços (com duração) do `mockApi`. */
    function mockCatalog(
      templates: unknown[] | (() => Response),
      user = storedUser(admin),
    ) {
      mockApi(() => jsonResponse({ patient: created }, 201));
      const base = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/plan-templates"))
          return typeof templates === "function"
            ? templates()
            : jsonResponse(templates);
        if (url.includes("/services"))
          return jsonResponse([
            {
              id: pilatesId,
              name: "Pilates",
              priceInCents: 9000,
              durationMinutes: 50,
            },
            {
              id: massageId,
              name: "Massagem",
              priceInCents: 15000,
              durationMinutes: 60,
            },
          ]);
        return base(input, init);
      });
      renderAs(user);
    }
    async function chooseSingle() {
      const dialog = await openNewClient();
      fireEvent.click(
        within(dialog).getByRole("radio", { name: "Serviço avulso" }),
      );
      return dialog;
    }

    it("lists only the active single services with price and duration", async () => {
      mockCatalog([
        pilatesTemplate,
        singleTemplate,
        massageTemplate,
        {
          ...massageTemplate,
          id: "b5555555-5555-4555-8555-555555555555",
          name: "Massagem antiga",
          active: false,
        },
      ]);
      const dialog = await chooseSingle();
      const catalog = await within(dialog).findByLabelText("Plano cadastrado");
      const options = within(catalog)
        .getAllByRole("option")
        .map((option) => option.textContent?.replace(/\s/g, " "));
      expect(options).toEqual([
        "Selecione um serviço avulso",
        "Serviço avulso · Pilates · R$ 90,00 · 1 sessão de 50 min",
        "Massagem relaxante · Massagem · R$ 150,00 · 1 sessão de 60 min",
      ]);
    });

    it("explains where to register single services and links to the plans settings", async () => {
      mockCatalog([pilatesTemplate]);
      const dialog = await chooseSingle();
      expect(
        await within(dialog).findByText("Nenhum serviço avulso cadastrado."),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/Configurações › Planos/),
      ).toBeInTheDocument();
      const link = within(dialog).getByRole("link", {
        name: /Cadastrar serviço avulso/,
      });
      expect(link).toHaveAttribute("href", "/configuracoes?secao=planos");
      expect(link).toHaveAttribute("target", "_blank");
      expect(
        within(dialog).queryByLabelText("Plano cadastrado"),
      ).not.toBeInTheDocument();
    });

    it("asks for an administrator when the user cannot register plans", async () => {
      mockCatalog([pilatesTemplate], customUser(["patients", "plans"]));
      const dialog = await chooseSingle();
      expect(
        await within(dialog).findByText("Nenhum serviço avulso cadastrado."),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/administrador/)).toBeInTheDocument();
      expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    });

    it("shows the loading error of the catalog", async () => {
      mockCatalog(() => jsonResponse({ message: "Falha no catálogo" }, 500));
      const dialog = await chooseSingle();
      expect(
        await within(dialog).findByText(/Não foi possível carregar/),
      ).toBeInTheDocument();
    });
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
    ).toEqual(["Aula experimental", "Só cadastrar por enquanto"]);
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
