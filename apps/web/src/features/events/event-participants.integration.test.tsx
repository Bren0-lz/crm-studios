import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  buildEventIndicators,
  type CommercialEventDetail,
  type EventParticipant,
  type PermissionKey,
} from "@crm/contracts";
import App from "../../App";
import {
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const eventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ana: EventParticipant = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  clinicId: "clinic",
  fullName: "Ana Participante",
  phone: "11987654321",
  email: "ana@example.com",
  whatsapp: "11912345678",
  source: "Evento: Aulão de Pilates",
  interest: "Evento",
  stage: "new",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  eventId,
  createdAt: "2039-06-10T13:00:00.000Z",
  updatedAt: "2039-06-10T13:00:00.000Z",
};

function detail(participants: EventParticipant[]): CommercialEventDetail {
  return {
    id: eventId,
    clinicId: "clinic",
    name: "Aulão de Pilates",
    startsAt: "2039-06-10T13:00:00.000Z",
    location: "Praça Central",
    participantCount: participants.length,
    createdAt: "2039-01-01T00:00:00Z",
    updatedAt: "2039-01-01T00:00:00Z",
    participants,
    indicators: buildEventIndicators(participants),
  };
}

function setup({
  participants = [{ ...ana }],
  duplicates = false,
  fail = false,
  permissions,
}: {
  participants?: EventParticipant[];
  duplicates?: boolean;
  fail?: boolean;
  permissions?: PermissionKey[];
} = {}) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    permissions
      ? JSON.stringify(
          withPermissions({
            id: "22222222-2222-4222-8222-222222222222",
            fullName: "Consulta",
            email: "viewer@example.com",
            role: "user",
            permissions,
          }),
        )
      : storedUser({
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Aryana",
          email: "admin@example.com",
          role: "owner",
        }),
  );
  let rows = participants.map((item) => ({ ...item }));
  let failNext = fail;
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as Response;
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push({ url, body });
      if (url.endsWith("/leads")) {
        const created: EventParticipant = {
          ...ana,
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          fullName: String(body.fullName),
          phone: String(body.phone),
          email: String(body.email ?? ""),
          ...(body.whatsapp ? { whatsapp: String(body.whatsapp) } : {}),
        };
        if (!body.whatsapp) delete created.whatsapp;
        rows = [...rows, created];
        return json(created, 201);
      }
      const contactMatch = /\/leads\/([^/]+)\/contacts$/.exec(url);
      if (contactMatch) {
        rows = rows.map((row) =>
          row.id === contactMatch[1]
            ? {
                ...row,
                lastContactAt: String(body.occurredAt),
                ...(body.reached === false
                  ? {}
                  : { contactedAt: String(body.occurredAt) }),
              }
            : row,
        );
        return json({ id: "contact", ...body }, 201);
      }
    }
    if (url.includes("/leads/duplicates"))
      return json({
        matches: duplicates
          ? [
              {
                kind: "patient",
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                fullName: "Bia Cliente",
                fields: ["phone"],
              },
            ]
          : [],
      });
    if (url.endsWith(`/events/${eventId}`)) {
      if (failNext) {
        failNext = false;
        return json({ message: "Falha ao carregar o evento" }, 500);
      }
      return json(detail(rows));
    }
    if (url.includes("branding"))
      return json({ name: "Studios Aryana", timezone: "America/Manaus" });
    if (url.includes("/notifications")) return json({ date: "2039-06-10" });
    return json([]);
  });
  render(
    <MemoryRouter initialEntries={[`/eventos/${eventId}`]}>
      <App />
    </MemoryRouter>,
  );
  return writes;
}

const indicator = (label: string) =>
  within(screen.getByLabelText("Indicadores"))
    .getByText(label)
    .closest("article");

describe("event participants", () => {
  it("lists participants with phone, e-mail, WhatsApp and the indicators", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { name: "Aulão de Pilates" }),
    ).toBeVisible();
    const list = screen.getByRole("list", { name: "Lista de participantes" });
    const item = within(list).getByText("Ana Participante").closest("li")!;
    expect(item).toHaveTextContent("(11) 98765-4321");
    expect(item).toHaveTextContent("(11) 91234-5678");
    expect(item).toHaveTextContent("ana@example.com");
    expect(item).toHaveTextContent("Contato não feito");
    expect(indicator("Contatados")).toHaveTextContent("0");
    expect(
      screen.getByText(/10 de jun\. às 09:00 · Praça Central/),
    ).toBeVisible();
  });

  it("adds a participant linked to the event, with the duplicate warning", async () => {
    const writes = setup({ duplicates: true });
    expect(await screen.findByText("Ana Participante")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar participante" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Adicionar participante",
    });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Caio Novo" },
    });
    fireEvent.change(within(dialog).getByLabelText("Telefone"), {
      target: { value: "11955551234" },
    });
    fireEvent.change(within(dialog).getByLabelText("WhatsApp"), {
      target: { value: "11955554321" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail"), {
      target: { value: "caio@example.com" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar participante" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Telefone já cadastrado para Bia Cliente (cliente).",
    );
    expect(writes).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar mesmo assim" }),
    );
    const list = await screen.findByRole("list", {
      name: "Lista de participantes",
    });
    expect(await within(list).findByText("Caio Novo")).toBeVisible();
    expect(writes[0]).toMatchObject({
      url: expect.stringMatching(/\/leads$/),
      body: {
        fullName: "Caio Novo",
        phone: "11955551234",
        whatsapp: "11955554321",
        email: "caio@example.com",
        eventId,
        source: "Evento: Aulão de Pilates",
        interest: "Evento",
      },
    });
    expect(screen.getByText("2 participante(s)")).toBeVisible();
  });

  it("registers a contact attempt and a contact made, refreshing the indicators", async () => {
    const writes = setup();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Registrar contato com Ana Participante",
      }),
    );
    let dialog = screen.getByRole("dialog", { name: "Registrar contato" });
    fireEvent.change(within(dialog).getByLabelText("Contato feito?"), {
      target: { value: "no" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Data e hora/), {
      target: { value: "2039-06-11T10:30" },
    });
    const notes = within(dialog).getByLabelText(/^Observação/);
    expect(notes).toHaveAttribute("maxLength", "2000");
    fireEvent.change(notes, { target: { value: "Não atendeu" } });
    expect(dialog).toHaveTextContent("11/2000 caracteres");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar contato" }),
    );
    expect(
      await screen.findByText("Sem resposta em 11 de jun. às 10:30"),
    ).toBeVisible();
    expect(writes[0]).toMatchObject({
      url: expect.stringMatching(`/leads/${ana.id}/contacts$`),
      body: {
        reached: false,
        notes: "Não atendeu",
        occurredAt: "2039-06-11T14:30:00.000Z",
        direction: "outbound",
        channel: "phone",
        contactMethod: "Telefone",
      },
    });
    expect(indicator("Contatados")).toHaveTextContent("0");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Registrar contato com Ana Participante",
      }),
    );
    dialog = screen.getByRole("dialog", { name: "Registrar contato" });
    fireEvent.change(within(dialog).getByLabelText("Canal"), {
      target: { value: "WhatsApp" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Data e hora/), {
      target: { value: "2039-06-12T09:00" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Observação/), {
      target: { value: "Quer Pilates à noite" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar contato" }),
    );
    expect(
      await screen.findByText("Contato feito em 12 de jun. às 09:00"),
    ).toBeVisible();
    expect(writes[1]?.body).toMatchObject({
      reached: true,
      channel: "whatsapp",
    });
    await waitFor(() => expect(indicator("Contatados")).toHaveTextContent("1"));
  });

  it("shows the empty state and hides actions without CRM permissions", async () => {
    setup({ participants: [], permissions: ["events.view"] });
    expect(await screen.findByText("Nenhum participante")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Adicionar participante" }),
    ).not.toBeInTheDocument();
  });

  it("hides contact registration without crm.contacts_create", async () => {
    setup({ permissions: ["events.view", "crm.view"] });
    expect(await screen.findByText("Ana Participante")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Registrar contato/ }),
    ).not.toBeInTheDocument();
  });

  it("shows request errors and supports retry", async () => {
    setup({ fail: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar o evento",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Ana Participante")).toBeVisible();
  });
});
