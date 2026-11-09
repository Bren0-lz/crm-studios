import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  CommercialEvent,
  EventInput,
  PermissionKey,
} from "@crm/contracts";
import App from "../../App";
import { api } from "../../api";
import {
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const branchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pilatesId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  dancaId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const services = [
  { id: pilatesId, name: "Pilates", active: true },
  { id: dancaId, name: "Dançaterapia", active: true },
  { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Antigo", active: false },
];
const event: CommercialEvent = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  clinicId: "clinic",
  name: "Aulão de Pilates",
  startsAt: "2039-06-10T13:00:00.000Z",
  branchId,
  participantCount: 3,
  attendeeCount: 20,
  location: "Praça Central",
  notes: "Levar tapete",
  createdAt: "2039-01-01T00:00:00Z",
  updatedAt: "2039-01-01T00:00:00Z",
};

function setup({
  empty = false,
  fail = false,
  permissions,
}: { empty?: boolean; fail?: boolean; permissions?: PermissionKey[] } = {}) {
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
  let events = empty ? [] : [{ ...event }];
  let failNext = fail;
  const writes: { method: string; input: EventInput }[] = [];
  const deletes: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as Response;
    if (/\/events(?:\/|$|\?)/.test(url)) {
      if (init?.method === "DELETE") {
        deletes.push(url);
        events = events.filter((item) => !url.endsWith(`/events/${item.id}`));
        return { ok: true, status: 204, json: async () => null } as Response;
      }
      if (init?.method && init.method !== "GET") {
        const body = JSON.parse(String(init.body)) as EventInput;
        writes.push({ method: init.method, input: body });
        const saved: CommercialEvent = {
          ...event,
          name: body.name,
          startsAt: body.startsAt,
        };
        if (body.branchId) saved.branchId = body.branchId;
        else delete saved.branchId;
        if (body.location !== undefined) saved.location = body.location;
        if (body.notes !== undefined) saved.notes = body.notes;
        if (body.attendeeCount !== undefined)
          saved.attendeeCount = body.attendeeCount;
        if (body.serviceId) {
          saved.serviceId = body.serviceId;
          saved.serviceName =
            services.find((item) => item.id === body.serviceId)?.name ?? "";
        } else {
          delete saved.serviceId;
          delete saved.serviceName;
        }
        events = [saved];
        return json(events[0]);
      }
      if (failNext) {
        failNext = false;
        return json({ message: "Falha ao carregar eventos" }, 500);
      }
      const filter = new URL(url, "http://localhost").searchParams.get(
        "serviceId",
      );
      return json(
        filter ? events.filter((item) => item.serviceId === filter) : events,
      );
    }
    if (url.endsWith("/services")) return json(services);
    if (url.endsWith("/branches"))
      return json([{ id: branchId, name: "Centro", active: true }]);
    if (url.includes("branding"))
      return json({ name: "Studios Aryana", timezone: "America/Manaus" });
    if (url.includes("/notifications")) return json({ date: "2039-06-10" });
    return json([]);
  });
  render(
    <MemoryRouter initialEntries={["/eventos"]}>
      <App />
    </MemoryRouter>,
  );
  return Object.assign(writes, { deletes });
}

describe("events page", () => {
  it("keeps creation disabled until the list and required options load", async () => {
    let resolve!: (events: CommercialEvent[]) => void;
    vi.spyOn(api, "events").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    setup({ empty: true });
    expect(
      await screen.findByRole("button", { name: "Novo evento" }),
    ).toBeDisabled();
    expect(
      screen
        .getByRole("region", { name: "Lista de eventos" })
        .querySelector(".loading-block"),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    resolve([]);
    expect(await screen.findByText("Nenhum evento cadastrado")).toBeVisible();
    expect(screen.getByRole("button", { name: "Novo evento" })).toBeEnabled();
  });

  it("lists events and inserts its authorized navigation item after CRM", async () => {
    setup();
    expect(await screen.findByText(event.name)).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const links = within(nav).getAllByRole("link");
    const crm = links.findIndex(
      (link) => link.getAttribute("href") === "/comercial",
    );
    expect(links[crm + 1]).toHaveAttribute("href", "/eventos");
    expect(screen.getByText(/10\/06\/2039.*09:00/)).toBeVisible();
    expect(screen.getByText(/3 participante/)).toHaveTextContent(
      "Público estimado: 20",
    );
    expect(
      screen.getByRole("link", { name: `Ver participantes de ${event.name}` }),
    ).toHaveAttribute("href", `/eventos/${event.id}`);
  });
  it("creates and edits, preserving clinic time, zero public estimate and branch", async () => {
    const writes = setup({ empty: true });
    expect(await screen.findByText("Nenhum evento cadastrado")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Novo evento" }));
    const dialog = screen.getByRole("dialog", { name: "Novo evento" });
    fireEvent.change(within(dialog).getByLabelText("Nome do evento"), {
      target: { value: "Feira de saúde" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Data e horário/), {
      target: { value: "2039-06-10T09:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Unidade"), {
      target: { value: branchId },
    });
    fireEvent.change(within(dialog).getByLabelText("Público estimado"), {
      target: { value: "0" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByText("Feira de saúde")).toBeVisible();
    expect(writes[0]).toMatchObject({
      method: "POST",
      input: {
        name: "Feira de saúde",
        startsAt: "2039-06-10T13:00:00.000Z",
        branchId,
        attendeeCount: 0,
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Feira de saúde" }),
    );
    const edit = screen.getByRole("dialog", { name: "Editar evento" });
    expect(within(edit).getByLabelText(/Data e horário/)).toHaveValue(
      "2039-06-10T09:00",
    );
    fireEvent.change(within(edit).getByLabelText("Nome do evento"), {
      target: { value: "Feira atualizada" },
    });
    fireEvent.click(
      within(edit).getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByText("Feira atualizada")).toBeVisible();
    expect(writes[1]).toMatchObject({
      method: "PUT",
      input: { startsAt: "2039-06-10T13:00:00.000Z", branchId },
    });
  });
  it("saves the event service and filters the list by service", async () => {
    const writes = setup({ empty: true });
    expect(await screen.findByText("Nenhum evento cadastrado")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Novo evento" }));
    const dialog = screen.getByRole("dialog", { name: "Novo evento" });
    const serviceField = within(dialog).getByLabelText("Serviço");
    // Só serviços ativos no cadastro.
    expect(
      within(serviceField)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Sem serviço", "Dançaterapia", "Pilates"]);
    fireEvent.change(within(dialog).getByLabelText("Nome do evento"), {
      target: { value: "Aulão de Pilates" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Data e horário/), {
      target: { value: "2039-06-10T09:00" },
    });
    fireEvent.change(serviceField, { target: { value: pilatesId } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByText(/Pilates · 3 participante/)).toBeVisible();
    expect(writes[0]).toMatchObject({
      method: "POST",
      input: { serviceId: pilatesId },
    });

    const filter = within(
      screen.getByRole("region", { name: "Lista de eventos" }),
    ).getByLabelText("Serviço");
    fireEvent.change(filter, { target: { value: dancaId } });
    expect(
      await screen.findByText("Nenhum evento com este serviço"),
    ).toBeVisible();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).endsWith(`/events?serviceId=${dancaId}`),
        ),
    ).toBe(true);
    fireEvent.change(filter, { target: { value: pilatesId } });
    expect(await screen.findByText("Aulão de Pilates")).toBeVisible();
  });

  it("deletes an event after confirmation", async () => {
    const writes = setup();
    expect(await screen.findByText(event.name)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: `Excluir ${event.name}` }),
    );
    const dialog = screen.getByRole("dialog", { name: "Excluir evento" });
    expect(dialog).toHaveTextContent(
      "Os 3 participantes continuam no funil comercial como lead",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(writes.deletes).toEqual([]);
    fireEvent.click(
      screen.getByRole("button", { name: `Excluir ${event.name}` }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Excluir evento" }),
      ).getByRole("button", { name: "Excluir evento" }),
    );
    expect(await screen.findByText("Nenhum evento cadastrado")).toBeVisible();
    expect(writes.deletes).toEqual([
      expect.stringMatching(new RegExp(`/events/${event.id}$`)),
    ]);
    expect(
      screen.queryByRole("dialog", { name: "Excluir evento" }),
    ).not.toBeInTheDocument();
  });

  it("shows request errors and supports retry", async () => {
    setup({ fail: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar eventos",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(event.name)).toBeVisible();
  });
  it("allows viewing without create/edit permission", async () => {
    setup({ permissions: ["events.view"] });
    expect(await screen.findByText(event.name)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Novo evento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Editar ${event.name}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Excluir ${event.name}` }),
    ).not.toBeInTheDocument();
  });
  it("denies the route and menu without events.view", async () => {
    setup({ permissions: ["crm.view"] });
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Eventos" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "Eventos" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).endsWith("/events")),
    ).toBe(false);
  });
});
