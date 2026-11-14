import { inferLeadContactChannel } from "@crm/contracts";
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
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

describe("lead contact channel", () => {
  it("infers the technical channel from the chosen name", () => {
    expect(inferLeadContactChannel("WhatsApp Business")).toBe("whatsapp");
    expect(inferLeadContactChannel("Ligação")).toBe("phone");
    expect(inferLeadContactChannel("Visita à recepção")).toBe("in_person");
    expect(inferLeadContactChannel("E-mail marketing")).toBe("email");
    expect(inferLeadContactChannel("Instagram Direct")).toBe("note");
  });

  it("records a contact with a single channel field and keeps old records readable", async () => {
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
    const lead = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Bruna Lead",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "contacted",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const oldContact = {
      id: "c-old",
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      notes: "Contato antigo sem forma de contato",
      actorName: "Aryana Dutra",
      occurredAt: "2026-09-02T12:00:00.000Z",
    };
    const posts: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/contacts")) {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...body,
            id: "c-new",
            leadId: lead.id,
            actorName: "Aryana Dutra",
            occurredAt: new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.endsWith("/activity")
        ? { contacts: [oldContact], tasks: [] }
        : url.endsWith("/clinic-catalogs/lead_channel")
          ? [
              { id: "k1", name: "Instagram Direct", active: true },
              { id: "k2", name: "whatsapp", active: true },
            ]
          : isLeadBoardUrl(url)
            ? leadBoardResponse(url, [lead])
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (await screen.findByText("Bruna Lead")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Atividades" }));
    const dialog = screen.getByRole("dialog", { name: "Bruna Lead" });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: /Contatos \(1\)/ }),
    );
    expect(
      within(dialog).queryByLabelText("Forma de contato"),
    ).not.toBeInTheDocument();
    const channel = within(dialog).getByRole("combobox", { name: "Canal" });
    await waitFor(() =>
      expect(
        within(channel)
          .getAllByRole("option")
          .map((item) => item.textContent),
      ).toEqual([
        "Telefone",
        "WhatsApp",
        "E-mail",
        "Presencial",
        "Nota interna",
        "Instagram Direct",
      ]),
    );
    // O registro antigo (só com o canal técnico) continua legível.
    expect(
      within(dialog)
        .getByText("Contato antigo sem forma de contato")
        .closest("li"),
    ).toHaveTextContent("WhatsApp");

    fireEvent.change(channel, { target: { value: "Instagram Direct" } });
    // Sem o registro, o botão diz o que falta (QM14).
    const register = within(dialog).getByRole("button", {
      name: "Registrar contato",
    });
    expect(register).toBeDisabled();
    expect(register).toHaveAccessibleDescription("Falta: Registro do contato.");
    fireEvent.change(within(dialog).getByLabelText("Registro do contato"), {
      target: { value: "Respondeu no direct" },
    });
    expect(register).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar contato" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      contactMethod: "Instagram Direct",
      channel: "note",
      notes: "Respondeu no direct",
    });
  });

  // RT2 (D3): ligação sem resposta fica no histórico, mas não conta como envio.
  it("records an unanswered call without counting it as a message sent", async () => {
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
    const lead = {
      id: "46464646-4646-4646-8646-464646464646",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Caio Ligação",
      phone: "11987654321",
      stage: "contacted",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const posts: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/contacts")) {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...body,
            id: `c-${posts.length}`,
            leadId: lead.id,
            actorName: "Aryana Dutra",
            occurredAt: body.occurredAt ?? new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.endsWith("/activity")
        ? { contacts: [], tasks: [] }
        : isLeadBoardUrl(url)
          ? leadBoardResponse(url, [lead])
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (await screen.findByText("Caio Ligação")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Atividades" }));
    const dialog = screen.getByRole("dialog", { name: "Caio Ligação" });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: /Contatos \(0\)/ }),
    );
    expect(within(dialog).getByRole("combobox", { name: "Canal" })).toHaveValue(
      "Telefone",
    );
    const direction = within(dialog).getByRole("combobox", { name: "Direção" });
    // Só no contato realizado se pergunta se conseguiu falar.
    fireEvent.change(direction, { target: { value: "inbound" } });
    expect(
      within(dialog).queryByLabelText("Conseguiu falar?"),
    ).not.toBeInTheDocument();
    fireEvent.change(direction, { target: { value: "outbound" } });
    const reached = within(dialog).getByLabelText("Conseguiu falar?");
    expect(reached).toHaveValue("yes");
    fireEvent.change(reached, { target: { value: "no" } });
    fireEvent.change(within(dialog).getByLabelText("Registro do contato"), {
      target: { value: "Caixa postal" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar contato" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      channel: "phone",
      direction: "outbound",
      reached: false,
      notes: "Caixa postal",
    });
    const item = (await within(dialog).findByText("Caixa postal")).closest(
      "li",
    ) as HTMLElement;
    expect(item).toHaveTextContent("Ligação realizada");
    expect(item).toHaveTextContent("Sem resposta");
    expect(item).not.toHaveTextContent("Mensagem enviada");
    const summary = within(dialog).getByRole("region", {
      name: "Situação da mensagem",
    });
    expect(summary).toHaveTextContent("Mensagem ainda não enviada");
    expect(summary).toHaveTextContent("0 envios · 1 contato no histórico");

    // "Sim" (padrão) não envia o campo.
    fireEvent.change(within(dialog).getByLabelText("Registro do contato"), {
      target: { value: "Atendeu e marcou" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar contato" }),
    );
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).not.toHaveProperty("reached");
  });
});
