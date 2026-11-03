import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  openSettingsSection,
  patientTag,
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("configured patient tags", () => {
  it("offers editing independently from creating and deleting tags", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Limited Settings",
        email: "limited@test.local",
        role: "user",
        modules: ["settings"],
        editModules: [],
        permissions: ["settings.view", "settings.tags_update"],
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/patient-tags")
              ? [patientTag("Pilates")]
              : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Etiquetas");
    expect(
      await screen.findByRole("button", { name: "Editar etiqueta Pilates" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adicionar etiqueta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir etiqueta Pilates" }),
    ).not.toBeInTheDocument();
  });
  const admin = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  function jsonResponse(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }

  it("creates, edits and deletes tags in Settings, warning when the tag is in use", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    const tags = [
      patientTag("Pilates", "#276749", 3),
      patientTag("VIP", "#facc15", 0),
    ];
    const writes: Array<{ method: string; url: string; body: unknown }> = [];
    let created = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/patient-tags")) {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (method !== "GET") writes.push({ method, url, body });
        if (method === "POST")
          return jsonResponse(
            { ...patientTag(`nova-${++created}`), ...body },
            201,
          );
        if (method === "PATCH") return jsonResponse({ ...tags[0], ...body });
        if (method === "DELETE" && url.endsWith(`/patient-tags/${tags[0]!.id}`))
          return jsonResponse(
            {
              code: "PATIENT_TAG_IN_USE",
              message:
                "A etiqueta Pilates Solo está em uso por 4 clientes. Retire-a desses clientes antes de excluir.",
              details: { patientCount: 4 },
            },
            409,
          );
        if (method === "DELETE")
          return {
            ok: true,
            status: 204,
            json: async () => {
              throw new SyntaxError("Unexpected end of JSON input");
            },
          } as unknown as Response;
        return jsonResponse(tags);
      }
      const body = url.includes("/relationship/settings")
        ? relationshipSettingsFixture()
        : url.includes("/admin/clinic-settings")
          ? null
          : [];
      return jsonResponse(body);
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Etiquetas");
    const list = await within(section).findByRole("list", {
      name: "Etiquetas configuradas",
    });

    // Selos na cor configurada, com texto preto ou branco conforme o contraste.
    const pilates = within(list).getByText("Pilates");
    expect(pilates).toHaveClass("tag-colored");
    expect(pilates.style.getPropertyValue("--tag-color")).toBe("#276749");
    expect(pilates.style.getPropertyValue("--tag-text")).toBe("#ffffff");
    expect(
      within(list).getByText("VIP").style.getPropertyValue("--tag-text"),
    ).toBe("#000000");
    expect(within(list).getByText("3 clientes")).toBeInTheDocument();
    expect(within(list).getByText("0 clientes")).toBeInTheDocument();

    // Criar com uma cor da paleta sugerida.
    fireEvent.change(within(section).getByLabelText("Nome da etiqueta"), {
      target: { value: "Dança" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Cor Roxo" }));
    expect(
      within(section).getByRole("button", { name: "Cor Roxo" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    expect(await within(list).findByText("Dança")).toBeInTheDocument();
    expect(writes.at(-1)).toMatchObject({
      method: "POST",
      body: { name: "Dança", color: "#7c3aed" },
    });
    expect(within(section).getByLabelText("Nome da etiqueta")).toHaveValue("");

    // Criar com o seletor livre de cor.
    fireEvent.change(within(section).getByLabelText("Nome da etiqueta"), {
      target: { value: "Avaliação" },
    });
    fireEvent.change(within(section).getByLabelText("Outra cor"), {
      target: { value: "#123456" },
    });
    expect(
      within(section).getByRole("button", { name: "Cor Roxo" }),
    ).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    expect(await within(list).findByText("Avaliação")).toBeInTheDocument();
    expect(writes.at(-1)).toMatchObject({
      method: "POST",
      body: { name: "Avaliação", color: "#123456" },
    });

    // Nome vazio não chama a API.
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    expect(
      await within(section).findByText("Informe o nome da etiqueta."),
    ).toBeInTheDocument();
    expect(writes).toHaveLength(2);

    // Renomear e trocar a cor.
    fireEvent.click(
      within(list).getByRole("button", { name: "Editar etiqueta Pilates" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Editar etiqueta" });
    fireEvent.change(within(dialog).getByLabelText("Nome da etiqueta"), {
      target: { value: "Pilates Solo" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cor Azul" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar etiqueta" }),
    );
    expect(await within(list).findByText("Pilates Solo")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes.at(-1)).toMatchObject({
      method: "PATCH",
      url: expect.stringContaining(`/patient-tags/${tags[0]!.id}`),
      body: { name: "Pilates Solo", color: "#2563eb" },
    });

    // Excluir etiqueta em uso: o modal avisa e mostra o 409 da API, sem tirar da lista.
    fireEvent.click(
      within(list).getByRole("button", {
        name: "Excluir etiqueta Pilates Solo",
      }),
    );
    dialog = await screen.findByRole("dialog", { name: "Excluir etiqueta" });
    expect(within(dialog).getByText(/está em 3 clientes/)).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Excluir etiqueta" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A etiqueta Pilates Solo está em uso por 4 clientes.",
    );
    expect(within(list).getByText("Pilates Solo")).toBeInTheDocument();
    expect(within(list).getByText("4 clientes")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Excluir etiqueta sem clientes.
    fireEvent.click(
      within(list).getByRole("button", { name: "Excluir etiqueta VIP" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Excluir etiqueta" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Excluir etiqueta" }),
    );
    await vi.waitFor(() =>
      expect(within(list).queryByText("VIP")).not.toBeInTheDocument(),
    );
    expect(writes.at(-1)).toMatchObject({
      method: "DELETE",
      url: expect.stringContaining(`/patient-tags/${tags[1]!.id}`),
    });
  });

  it("creates a tag with a category and shows the category color when it has no own color", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    const tags = [
      { ...patientTag("Atrasado", "#64748b", 2), category: "financial" },
    ];
    const posts: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/patient-tags")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          posts.push(body);
          return jsonResponse({ ...patientTag("x"), ...body }, 201);
        }
        return jsonResponse(tags);
      }
      return jsonResponse(
        url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : [],
      );
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Etiquetas");
    const list = await within(section).findByRole("list", {
      name: "Etiquetas configuradas",
    });
    const late = within(list).getByText("Atrasado");
    expect(late.style.getPropertyValue("--tag-color")).toBe("#c2410c");
    expect(within(list).getByText("Financeiro")).toBeInTheDocument();
    fireEvent.change(within(section).getByLabelText("Nome da etiqueta"), {
      target: { value: "Ativo" },
    });
    fireEvent.change(within(section).getByLabelText(/^Categoria/), {
      target: { value: "status" },
    });
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ name: "Ativo", category: "status" });
  });

  it("shows the tags read-only in Settings for who only views settings", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "33333333-3333-4333-8333-333333333333",
        fullName: "Fábio Financeiro",
        email: "financeiro@movimenta.local",
        role: "finance",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) =>
      jsonResponse(
        String(input).includes("/patient-tags")
          ? [patientTag("Pilates", "#276749", 3)]
          : String(input).includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : [],
      ),
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Etiquetas");
    const list = await within(section).findByRole("list", {
      name: "Etiquetas configuradas",
    });
    expect(within(list).getByText("Pilates")).toHaveClass("tag-colored");
    expect(
      within(section).queryByLabelText("Nome da etiqueta"),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", {
        name: /Editar etiqueta|Excluir etiqueta/,
      }),
    ).not.toBeInTheDocument();
  });

  it("colors the client list and filters, and lets the record pick only configured tags", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    const patient = {
      cpf: "52998224725",
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["Pilates"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/patient-tags"))
        return jsonResponse([
          patientTag("Pilates", "#276749", 1),
          patientTag("VIP", "#facc15", 0),
        ]);
      if (init?.method === "PUT")
        return jsonResponse({ ...patient, ...JSON.parse(String(init.body)) });
      return jsonResponse([patient]);
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    const row = await screen.findByRole("button", {
      name: "Abrir ficha de Helena Almeida",
    });
    const badge = within(row).getByText("Pilates");
    expect(badge).toHaveClass("tag-colored");
    expect(badge.style.getPropertyValue("--tag-color")).toBe("#276749");
    expect(badge.style.getPropertyValue("--tag-text")).toBe("#ffffff");

    // Filtro lista todas as etiquetas configuradas (mesmo sem clientes), com a cor.
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const filter = await screen.findByRole("group", { name: "Etiquetas" });
    expect(
      within(filter)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Pilates1", "VIP0", "Pagamento atrasado0", "Falta CPF0"]);
    expect(
      within(filter)
        .getByRole("button", { name: /^VIP/ })
        .style.getPropertyValue("--tag-color"),
    ).toBe("#facc15");

    fireEvent.click(
      within(row).getByRole("button", { name: "Editar Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByLabelText(/separadas por vírgula/),
    ).not.toBeInTheDocument();
    const choices = within(dialog).getByRole("group", { name: "Etiquetas" });
    expect(within(choices).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(choices).getByRole("button", { name: "Pilates" }),
    ).toHaveAttribute("aria-pressed", "true");
    // V3: selecionada mostra ✓; não selecionada mostra a bolinha da cor.
    expect(
      within(choices)
        .getByRole("button", { name: "Pilates" })
        .querySelector(".tag-check"),
    ).not.toBeNull();
    expect(
      within(choices)
        .getByRole("button", { name: "VIP" })
        .querySelector(".tag-dot"),
    ).not.toBeNull();
    const vip = within(choices).getByRole("button", { name: "VIP" });
    expect(vip).toHaveAttribute("aria-pressed", "false");
    expect(vip.style.getPropertyValue("--tag-text")).toBe("#000000");
    fireEvent.click(vip);
    fireEvent.click(within(choices).getByRole("button", { name: "Pilates" }));
    expect(vip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true),
    );
    const updateCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(String(updateCall?.[1]?.body)).tags).toEqual(["VIP"]);
  });

  it("tells there are no configured tags in a new client record", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText(/Nenhuma etiqueta configurada/),
    ).toBeInTheDocument();
  });

  it("formats CPF while typing and rejects invalid check digits", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    const cpf = within(dialog).getByLabelText("CPF");

    fireEvent.change(cpf, { target: { value: "52998224724" } });
    expect(cpf).toHaveValue("529.982.247-24");
    expect(cpf).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getAllByText("Informe um CPF válido.").length,
    ).toBeGreaterThan(0);

    fireEvent.change(cpf, { target: { value: "52998224725" } });
    expect(cpf).toHaveValue("529.982.247-25");
    expect(cpf).not.toHaveAttribute("aria-invalid");
  });

  describe("in the appointment details (Agenda › Dados do cliente)", () => {
    const patientId = "99999999-9999-4999-8999-999999999999";
    function mockAgenda(patientTags: string[], tagsResponse: () => Response) {
      const startsAt = new Date();
      startsAt.setHours(10, 0, 0, 0);
      const appointment = {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        patientId,
        patientName: "Helena Almeida",
        professionalColor: "#5c6f68",
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
        serviceName: "Fisioterapia individual",
        professionalName: "Dra. Ana Martins",
        roomName: "Sala Movimento",
        status: "scheduled",
      };
      const patient = {
        id: patientId,
        fullName: "Helena Almeida",
        recordNumber: "PAC-00001",
        phone: "11987654321",
        status: "active",
        tags: patientTags,
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/patient-tags")) return tagsResponse();
        if (url.includes("/relationship/settings"))
          return jsonResponse(relationshipSettingsFixture());
        if (url.includes("/admin/clinic-settings")) return jsonResponse(null);
        if (url.includes("/appointments?")) return jsonResponse([appointment]);
        if (url.includes("/patients")) return jsonResponse([patient]);
        return jsonResponse([]);
      });
    }
    const tagRequests = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes("/patient-tags"));

    it("shows the client tags as colored badges and links to manage them", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(admin));
      mockAgenda(["Retorno", "Antiga"], () =>
        jsonResponse([patientTag("Retorno", "#2563eb", 1)]),
      );
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Detalhes de Helena Almeida",
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Detalhes do atendimento",
      });
      // Cor configurada; etiqueta sem configuração usa a cor padrão.
      await vi.waitFor(() =>
        expect(
          within(dialog)
            .getByText("Retorno")
            .style.getPropertyValue("--tag-color"),
        ).toBe("#2563eb"),
      );
      expect(within(dialog).getByText("Retorno")).toHaveClass("tag-colored");
      expect(
        within(dialog)
          .getByText("Retorno")
          .style.getPropertyValue("--tag-text"),
      ).toBe("#ffffff");
      expect(within(dialog).getByText("Antiga")).toHaveClass("tag-colored");
      expect(
        within(dialog)
          .getByText("Antiga")
          .style.getPropertyValue("--tag-color"),
      ).toBe("#64748b");
      expect(
        within(dialog).queryByText("Retorno, Antiga"),
      ).not.toBeInTheDocument();
      // Quem edita Configurações tem o atalho; a gaveta Etiquetas já abre.
      const manage = within(dialog).getByRole("link", {
        name: "Gerenciar etiquetas",
      });
      expect(manage).toHaveAttribute("href", "/configuracoes?secao=etiquetas");
      fireEvent.click(manage);
      expect(
        await screen.findByRole("list", { name: "Etiquetas configuradas" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Etiquetas" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("uses the default color without an error when the tag colors cannot be loaded", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem(
        "crm.auth.user",
        storedUser({
          id: "33333333-3333-4333-8333-333333333333",
          fullName: "Rita Recepção",
          email: "recepcao@movimenta.local",
          role: "reception",
        }),
      );
      mockAgenda(["VIP"], () =>
        jsonResponse({ code: "FORBIDDEN", message: "Sem permissão." }, 403),
      );
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Detalhes de Helena Almeida",
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Detalhes do atendimento",
      });
      await vi.waitFor(() => expect(tagRequests()).toHaveLength(1));
      const vip = within(dialog).getByText("VIP");
      expect(vip).toHaveClass("tag-colored");
      expect(vip.style.getPropertyValue("--tag-color")).toBe("#64748b");
      expect(
        within(dialog).queryByText("Sem permissão."),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("link", { name: "Gerenciar etiquetas" }),
      ).not.toBeInTheDocument();
    });

    it("tells the client has no tags without fetching the tag colors", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(admin));
      mockAgenda([], () => jsonResponse([]));
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Detalhes de Helena Almeida",
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Detalhes do atendimento",
      });
      expect(within(dialog).getByText("Sem etiquetas")).toBeInTheDocument();
      expect(tagRequests()).toHaveLength(0);
    });
  });
});
