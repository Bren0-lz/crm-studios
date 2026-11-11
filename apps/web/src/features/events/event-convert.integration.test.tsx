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
const patientId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
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
  permissions,
}: {
  participants?: EventParticipant[];
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
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as Response;
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push({ url, body });
      // LC1: o cadastro completo de cliente converte o participante (lead) junto.
      if (url.endsWith("/patients/guided")) {
        rows = rows.map((row) =>
          row.id === body.leadId
            ? { ...row, stage: "converted", convertedPatientId: patientId }
            : row,
        );
        const lead = rows.find((row) => row.id === body.leadId);
        const patient = body.patient as Record<string, unknown>;
        return json(
          { lead, patient: { id: patientId, fullName: patient.fullName } },
          201,
        );
      }
    }
    if (url.endsWith(`/events/${eventId}`)) return json(detail(rows));
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

/** Preenche o que o participante não tem (CPF e emergência) e confirma o cadastro. */
function fillAndConfirm(dialog: HTMLElement) {
  expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
    "Ana Participante",
  );
  fireEvent.change(within(dialog).getByLabelText("CPF"), {
    target: { value: "52998224725" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Usar os dados do cliente" }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Cadastrar cliente" }),
  );
}

describe("event participant becomes a client", () => {
  it("opens the client form over the page and marks the participant as client", async () => {
    const writes = setup();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ana Participante se tornou cliente",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Cadastrar cliente" });
    expect(dialog).toHaveTextContent("Eventos");
    fillAndConfirm(dialog);
    const list = screen.getByRole("list", { name: "Lista de participantes" });
    const item = within(list).getByText("Ana Participante").closest("li")!;
    expect(await within(item).findByText("Cliente")).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "Cadastrar cliente" }),
    ).not.toBeInTheDocument();
    expect(
      within(item).queryByRole("button", { name: /se tornou cliente/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(indicator("Convertidos em cliente")).toHaveTextContent("1"),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      url: expect.stringMatching("/patients/guided$"),
      body: {
        next: "none",
        leadId: ana.id,
        patient: {
          fullName: "Ana Participante",
          cpf: "52998224725",
          phone: "11987654321",
          whatsapp: "11912345678",
          email: "ana@example.com",
          emergencyContactName: "Ana Participante",
          emergencyContactPhone: "11987654321",
        },
      },
    });
  });

  it("opens the client form in front of the contact modal, which stays open", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Registrar contato com Ana Participante",
      }),
    );
    const contact = screen.getByRole("dialog", { name: "Registrar contato" });
    fireEvent.click(
      within(contact).getByRole("button", { name: "Se tornou cliente" }),
    );
    const convert = screen.getByRole("dialog", { name: "Cadastrar cliente" });
    expect(contact).toBeInTheDocument();
    fillAndConfirm(convert);
    expect(await within(contact).findByText("Cliente")).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "Cadastrar cliente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Registrar contato" }),
    ).toBeVisible();
    expect(
      within(contact).queryByRole("button", { name: "Se tornou cliente" }),
    ).not.toBeInTheDocument();
  });

  it("closing the client form keeps the participant unchanged", async () => {
    const writes = setup();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ana Participante se tornou cliente",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Cadastrar cliente" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Voltar|Cancelar/ }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cadastrar cliente" }),
      ).not.toBeInTheDocument(),
    );
    expect(writes).toHaveLength(0);
    expect(
      screen.getByRole("button", {
        name: "Ana Participante se tornou cliente",
      }),
    ).toBeVisible();
  });

  it("shows the client mark for a converted participant without the action", async () => {
    setup({ participants: [{ ...ana, convertedPatientId: patientId }] });
    const list = await screen.findByRole("list", {
      name: "Lista de participantes",
    });
    expect(within(list).getByText("Cliente")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /se tornou cliente/ }),
    ).not.toBeInTheDocument();
  });

  it("hides the action without permission to convert", async () => {
    setup({ permissions: ["events.view", "crm.view", "crm.contacts_create"] });
    expect(await screen.findByText("Ana Participante")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /se tornou cliente/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Registrar contato com Ana Participante",
      }),
    );
    const contact = screen.getByRole("dialog", { name: "Registrar contato" });
    expect(
      within(contact).queryByRole("button", { name: "Se tornou cliente" }),
    ).not.toBeInTheDocument();
  });
});
