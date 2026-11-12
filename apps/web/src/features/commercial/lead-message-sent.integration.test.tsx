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
import { shortDateTime } from "../../shared/lib/formatting";

const baseLead = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  phone: "11987654321",
  source: "Instagram",
  interest: "Pilates",
  stage: "contacted",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-11-01T12:00:00.000Z",
  updatedAt: "2026-11-01T12:00:00.000Z",
};

function login() {
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
}

describe("lead message sent status", () => {
  it("shows on the card whether the message was sent and records it in one click", async () => {
    login();
    const pending = {
      ...baseLead,
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "Bruna Pendente",
      contactMethod: "WhatsApp",
      contactCount: 0,
    };
    const sent = {
      ...baseLead,
      id: "55555555-5555-4555-8555-555555555555",
      fullName: "Carla Enviada",
      lastMessageSentAt: "2026-11-10T17:32:00.000Z",
      lastContactAt: "2026-11-10T17:32:00.000Z",
      contactCount: 2,
    };
    const posts: Array<Record<string, unknown>> = [];
    const occurredAt = "2026-11-11T13:05:00.000Z";
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
            leadId: pending.id,
            actorName: "Aryana Dutra",
            occurredAt,
            createdAt: occurredAt,
          }),
        } as Response;
      }
      const body = isLeadBoardUrl(url)
        ? leadBoardResponse(url, [pending, sent])
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const sentCard = (await screen.findByText("Carla Enviada")).closest(
      "article",
    ) as HTMLElement;
    expect(sentCard).toHaveTextContent(
      `Mensagem enviada · ${shortDateTime(sent.lastMessageSentAt)}`,
    );
    expect(sentCard).toHaveTextContent("2 contatos");

    const pendingCard = screen
      .getByText("Bruna Pendente")
      .closest("article") as HTMLElement;
    expect(pendingCard).toHaveTextContent("Mensagem não enviada");
    const whatsapp = within(pendingCard).getByRole("link", {
      name: "Enviar mensagem no WhatsApp",
    });
    expect(whatsapp).toHaveClass("whatsapp-button");
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/5511987654321");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp.getAttribute("rel")).toMatch(/\bnoopener\b/);
    fireEvent.click(whatsapp);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      channel: "whatsapp",
      contactMethod: "WhatsApp",
      direction: "outbound",
      notes: "Mensagem enviada.",
    });
    const updated = (await screen.findByText("Bruna Pendente")).closest(
      "article",
    ) as HTMLElement;
    await waitFor(() =>
      expect(updated).toHaveTextContent(
        `Mensagem enviada · ${shortDateTime(occurredAt)}`,
      ),
    );
    expect(updated).toHaveTextContent("1 contato");
  });

  it("summarizes the last sent message and lists every contact with date and time", async () => {
    login();
    const lead = {
      ...baseLead,
      id: "66666666-6666-4666-8666-666666666666",
      fullName: "Dora Histórico",
      lastMessageSentAt: "2026-11-10T17:32:00.000Z",
      contactCount: 2,
    };
    const contacts = [
      {
        id: "c2",
        leadId: lead.id,
        channel: "whatsapp",
        contactMethod: "WhatsApp",
        direction: "inbound",
        notes: "Respondeu pedindo horários",
        actorName: "Aryana Dutra",
        occurredAt: "2026-11-10T18:10:00.000Z",
        createdAt: "2026-11-10T18:10:00.000Z",
      },
      {
        id: "c1",
        leadId: lead.id,
        channel: "whatsapp",
        contactMethod: "WhatsApp",
        direction: "outbound",
        notes: "Mensagem enviada.",
        actorName: "Aryana Dutra",
        occurredAt: "2026-11-10T17:32:00.000Z",
        createdAt: "2026-11-10T17:32:00.000Z",
      },
    ];
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
            id: "c3",
            leadId: lead.id,
            actorName: "Aryana Dutra",
            occurredAt: "2026-11-11T12:00:00.000Z",
            createdAt: "2026-11-11T12:00:00.000Z",
          }),
        } as Response;
      }
      const body = url.endsWith("/activity")
        ? { contacts, tasks: [] }
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
    const card = (await screen.findByText("Dora Histórico")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Atividades" }));
    const dialog = screen.getByRole("dialog", { name: "Dora Histórico" });
    const summary = await within(dialog).findByRole("region", {
      name: "Situação da mensagem",
    });
    expect(summary).toHaveTextContent("Mensagem enviada");
    expect(summary).toHaveTextContent(
      `Último envio em ${shortDateTime("2026-11-10T17:32:00.000Z")} · Aryana Dutra`,
    );
    expect(summary).toHaveTextContent("1 envio · 2 contatos no histórico");

    fireEvent.click(
      within(dialog).getByRole("button", { name: /Contatos \(2\)/ }),
    );
    const timeline = within(dialog).getByRole("list", {
      name: "Histórico de contatos",
    });
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Recebido do lead");
    expect(items[0]!.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-11-10T18:10:00.000Z",
    );
    expect(items[1]).toHaveTextContent("Mensagem enviada");

    // Contato com data e hora escolhidas (registro retroativo).
    fireEvent.change(within(dialog).getByLabelText("Data e hora"), {
      target: { value: "2026-11-09T08:15" },
    });
    fireEvent.change(within(dialog).getByLabelText("Registro do contato"), {
      target: { value: "Ligação sem resposta" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar contato" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      direction: "outbound",
      notes: "Ligação sem resposta",
      occurredAt: new Date("2026-11-09T08:15").toISOString(),
    });

    fireEvent.click(
      within(summary).getByRole("button", { name: "Marcar enviada agora" }),
    );
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatchObject({
      direction: "outbound",
      notes: "Mensagem enviada.",
    });
    expect(posts[1]).not.toHaveProperty("occurredAt");
  });

  it("shows full contact history with date and time on status hover and inside the card details modal", async () => {
    login();
    const lead = {
      ...baseLead,
      id: "77777777-7777-4777-8777-777777777777",
      fullName: "Elena Funil",
      lastMessageSentAt: "2026-11-10T14:20:00.000Z",
      lastContactAt: "2026-11-10T14:20:00.000Z",
      contactCount: 1,
    };
    const initialContacts = [
      {
        id: "c-prev",
        leadId: lead.id,
        channel: "whatsapp",
        contactMethod: "WhatsApp",
        direction: "outbound",
        notes: "Primeiro contato enviado.",
        actorName: "Aryana Dutra",
        occurredAt: "2026-11-10T14:20:00.000Z",
        createdAt: "2026-11-10T14:20:00.000Z",
      },
    ];
    const newOccurredAt = "2026-11-11T16:45:00.000Z";
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/contacts")) {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...body,
            id: "c-second",
            leadId: lead.id,
            actorName: "Aryana Dutra",
            occurredAt: newOccurredAt,
            createdAt: newOccurredAt,
          }),
        } as Response;
      }
      const body = url.endsWith("/activity")
        ? { contacts: initialContacts, tasks: [] }
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

    const card = (await screen.findByText("Elena Funil")).closest(
      "article",
    ) as HTMLElement;
    const whatsapp = within(card).getByRole("link", {
      name: "Enviar mensagem no WhatsApp",
    });
    fireEvent.click(whatsapp);

    const updatedCard = (await screen.findByText("Elena Funil")).closest(
      "article",
    ) as HTMLElement;
    await waitFor(() =>
      expect(updatedCard).toHaveTextContent(
        `Mensagem enviada · ${shortDateTime(newOccurredAt)}`,
      ),
    );

    // Ao passar o mouse em cima do status da mensagem, abre o modal com todo o histórico.
    const statusText = updatedCard.querySelector(
      ".lead-message-status",
    ) as HTMLElement;
    fireEvent.mouseEnter(statusText);

    const hoverTooltip = await within(updatedCard).findByRole("tooltip", {
      name: "Histórico de contatos",
    });
    expect(hoverTooltip).toHaveTextContent("2 contatos");
    const hoverItems = within(hoverTooltip).getAllByRole("listitem");
    expect(hoverItems).toHaveLength(2);
    expect(hoverItems[0]).toHaveTextContent(shortDateTime(newOccurredAt));
    expect(hoverItems[0]).toHaveTextContent("Mensagem enviada.");
    expect(hoverItems[1]).toHaveTextContent(
      shortDateTime("2026-11-10T14:20:00.000Z"),
    );
    expect(hoverItems[1]).toHaveTextContent("Primeiro contato enviado.");

    fireEvent.mouseLeave(
      updatedCard.querySelector(".lead-message-status-wrap") as HTMLElement,
    );

    // Ao clicar no card, o histórico completo aparece dentro do modal de detalhes.
    fireEvent.click(
      within(updatedCard).getByRole("button", {
        name: "Ver detalhes de Elena Funil",
      }),
    );
    const detailsDialog = (await screen.findByText(/^Etapa:/)).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    const historyRegion = await within(detailsDialog).findByRole("region", {
      name: "Histórico de contatos",
    });
    expect(historyRegion).toHaveTextContent("2 contatos");
    const modalItems = within(historyRegion).getAllByRole("listitem");
    expect(modalItems).toHaveLength(2);
    expect(modalItems[0]).toHaveTextContent(shortDateTime(newOccurredAt));
    expect(modalItems[1]).toHaveTextContent(
      shortDateTime("2026-11-10T14:20:00.000Z"),
    );
  });
});
