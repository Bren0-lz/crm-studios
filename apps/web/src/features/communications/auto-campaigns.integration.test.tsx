import type { AutoCampaignItem, AutoCampaignQueue } from "@crm/contracts";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  documentEditor,
  installDocumentBrowserMocks,
  setDocumentText,
} from "../../test-support/document-editor";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

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

const campaignId = "a1111111-1111-4111-8111-111111111111";
const otherCampaignId = "a2222222-2222-4222-8222-222222222222";

function item(
  patientName: string,
  patientId: string,
  extra: Partial<AutoCampaignItem> = {},
): AutoCampaignItem {
  return {
    key: `${campaignId}:s2:${patientId}:2026`,
    campaignId,
    campaignName: "Aniversariantes",
    trigger: "birthday",
    stepId: "b1111111-1111-4111-8111-111111111111",
    stepLabel: "2 dias antes",
    patientId,
    patientName,
    phone: "11999990000",
    occurrenceKey: `${patientId}:2026`,
    eventDate: "2026-10-27",
    detail: "Aniversário em 2 dias (27/10)",
    message: `${patientName.split(" ")[0]}, faltam 2 dias!`,
    status: "pending",
    ...extra,
  };
}

const ana = item("Ana Lima", "c1111111-1111-4111-8111-111111111111");
const bia = item("Bia Rocha", "c2222222-2222-4222-8222-222222222222");
const caio = item("Caio Reis", "c3333333-3333-4333-8333-333333333333", {
  key: `${otherCampaignId}:s1:plan`,
  campaignId: otherCampaignId,
  campaignName: "Renovação",
  trigger: "plan_expiring",
  stepLabel: "No dia",
  detail: "Pilates termina hoje",
  status: "skipped",
  blockedReason: "no_destination",
  phone: "",
});

function queueWith(items: AutoCampaignItem[]): AutoCampaignQueue {
  const summary = (id: string, name: string) => {
    const own = items.filter((entry) => entry.campaignId === id);
    return {
      campaignId: id,
      name,
      trigger: own[0]?.trigger ?? "birthday",
      active: true,
      pending: own.filter((entry) => entry.status === "pending").length,
      sent: own.filter((entry) => entry.status === "sent").length,
      skipped: own.filter((entry) => entry.status === "skipped").length,
    };
  };
  return {
    date: "2026-10-25",
    items,
    campaigns: [
      summary(campaignId, "Aniversariantes"),
      summary(otherCampaignId, "Renovação"),
    ],
  };
}

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function mockApi() {
  let current = queueWith([ana, bia, caio]);
  const posts: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/communications/auto-campaigns/deliveries")) {
      const body = JSON.parse(String(init?.body)) as {
        patientId: string;
        status: "sent" | "skipped";
        skipReason?: string;
      };
      posts.push(body);
      current = queueWith(
        current.items.map((entry) =>
          entry.patientId === body.patientId
            ? {
                ...entry,
                status: body.status,
                delivery: {
                  id: "d1111111-1111-4111-8111-111111111111",
                  campaignId: entry.campaignId,
                  stepId: entry.stepId,
                  patientId: entry.patientId,
                  occurrenceKey: entry.occurrenceKey,
                  status: body.status,
                  skipReason: body.skipReason as never,
                  message: entry.message,
                  handledAt: "2026-10-25T13:00:00Z",
                  handledByName: "Aryana Dutra",
                },
              }
            : entry,
        ),
      );
      return json({}, 201);
    }
    if (url.includes("/communications/auto-campaigns/queue"))
      return json(current);
    if (url.includes("/notifications"))
      return json({
        date: "2026-10-25",
        autoCampaigns: [
          { id: campaignId, name: "Aniversariantes", pending: 2 },
        ],
      });
    if (url.includes("/reports/sales?"))
      return json({ patientsWithoutReturn: [] });
    if (url.includes("/dashboard?"))
      return json({ date: "2026-10-25", nextAppointments: [] });
    return json([]);
  });
  return posts;
}

describe("campanhas automáticas na página inicial", () => {
  it("lists today's messages with filters, records sent and skipped and shows why", async () => {
    login();
    const posts = mockApi();
    render(
      <MemoryRouter initialEntries={["/?aba=campanhas"]}>
        <App />
      </MemoryRouter>,
    );
    const tab = await screen.findByRole("tab", {
      name: /Campanhas automáticas/,
    });
    expect(tab).toHaveAttribute("aria-selected", "true");
    const panel = await screen.findByRole("tabpanel", {
      name: /Campanhas automáticas/,
    });
    // Pendentes por padrão: Ana e Bia; Caio (sem número) fica em "Não enviadas".
    expect(await within(panel).findByText("Ana Lima")).toBeVisible();
    expect(within(panel).getByText("Bia Rocha")).toBeVisible();
    expect(within(panel).queryByText("Caio Reis")).not.toBeInTheDocument();
    expect(within(panel).getByText("Ana, faltam 2 dias!")).toBeVisible();

    fireEvent.click(
      within(panel).getByRole("button", { name: /Não enviadas/ }),
    );
    expect(within(panel).getByText("Caio Reis")).toBeVisible();
    expect(
      within(panel).getByText("Motivo: Sem WhatsApp ou telefone cadastrado"),
    ).toBeVisible();

    fireEvent.click(within(panel).getByRole("button", { name: /Pendentes/ }));
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Marcar enviada para Ana Lima",
      }),
    );
    await waitFor(() =>
      expect(within(panel).queryByText("Ana Lima")).not.toBeInTheDocument(),
    );
    expect(posts[0]).toMatchObject({
      campaignId,
      patientId: ana.patientId,
      occurrenceKey: ana.occurrenceKey,
      status: "sent",
    });

    fireEvent.click(
      within(panel).getByRole("button", { name: "Não enviar para Bia Rocha" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Não enviar para Bia Rocha",
    });
    fireEvent.click(
      within(dialog).getByLabelText("Cliente pediu para não receber"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Não enviar para Bia Rocha" }),
      ).not.toBeInTheDocument(),
    );
    expect(posts[1]).toMatchObject({
      patientId: bia.patientId,
      status: "skipped",
      skipReason: "client_asked",
    });
    expect(
      await within(panel).findByText("Tudo enviado por hoje"),
    ).toBeVisible();

    // Filtro por campanha e busca.
    fireEvent.click(within(panel).getByRole("button", { name: /Todas \(/ }));
    fireEvent.click(within(panel).getByRole("button", { name: /^Renovação/ }));
    expect(within(panel).getByText("Caio Reis")).toBeVisible();
    expect(within(panel).queryByText("Bia Rocha")).not.toBeInTheDocument();

    // Sino: lembra quantas pessoas faltam na campanha.
    fireEvent.click(
      screen.getByRole("button", { name: /Notificações: 2 pendências/ }),
    );
    const bell = screen.getByRole("dialog", { name: "Notificações" });
    expect(
      within(bell).getByRole("button", {
        name: /Campanha automática “Aniversariantes”.*Faltam 2 pessoas/,
      }),
    ).toBeVisible();
  });
});

describe("configuração das campanhas automáticas", () => {
  it("creates a campaign with one message per moment", async () => {
    login();
    const created: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/communications/auto-campaigns") && init?.method) {
        const body = JSON.parse(String(init.body)) as { name: string };
        created.push(body);
        return json(
          {
            id: campaignId,
            ...body,
            steps: [],
            createdAt: "2026-10-25T12:00:00Z",
            updatedAt: "2026-10-25T12:00:00Z",
            createdByName: "Aryana Dutra",
          },
          201,
        );
      }
      if (url.includes("/communications/auto-campaigns/queue"))
        return json({ date: "2026-10-25", items: [], campaigns: [] });
      if (url.includes("/notifications")) return json({ date: "2026-10-25" });
      return json([]);
    });
    render(
      <MemoryRouter initialEntries={["/comunicacoes?aba=automaticas"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Nenhuma campanha automática"),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Nova campanha automática" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nova campanha automática",
    });
    fireEvent.change(within(dialog).getByLabelText("Nome da campanha"), {
      target: { value: "Aniversariantes" },
    });
    fireEvent.change(within(dialog).getByLabelText("Momento da mensagem 1"), {
      target: { value: "7" },
    });
    expect(within(dialog).getByText("7 dias antes")).toBeVisible();
    // Mensagem com o editor das etiquetas verdes: códigos do evento (aniversário tem idade).
    installDocumentBrowserMocks();
    const first = within(dialog).getByRole("textbox", { name: "Mensagem 1" });
    setDocumentText(first, "Faltam 7 dias, ");
    act(() => {
      documentEditor(first).commands.focus("end");
    });
    const firstToolbar = within(dialog).getByRole("toolbar", {
      name: "Inserir dados na mensagem 1",
    });
    expect(
      within(firstToolbar).getByRole("button", { name: "Inserir idade" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(firstToolbar).getByRole("button", { name: "Inserir nome" }),
    );
    expect(within(first).getByText("Nome")).toHaveClass("document-field");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar mensagem" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Momento da mensagem 2"), {
      target: { value: "0" },
    });
    setDocumentText(
      within(dialog).getByRole("textbox", { name: "Mensagem 2" }),
      "Parabéns!",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar campanha" }),
    );
    await waitFor(() =>
      expect(created[0]).toEqual({
        name: "Aniversariantes",
        trigger: "birthday",
        active: true,
        steps: [
          { offset: 7, message: "Faltam 7 dias, {{nome}}" },
          { offset: 0, message: "Parabéns!" },
        ],
      }),
    );
  });

  it("creates a promotional campaign with validity and cooldown", async () => {
    login();
    const created: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/communications/auto-campaigns") && init?.method) {
        const body = JSON.parse(String(init.body)) as { name: string };
        created.push(body);
        return json(
          {
            id: campaignId,
            ...body,
            steps: [],
            createdAt: "2026-10-25T12:00:00Z",
            updatedAt: "2026-10-25T12:00:00Z",
            createdByName: "Aryana Dutra",
          },
          201,
        );
      }
      if (url.includes("/communications/auto-campaigns/queue"))
        return json({ date: "2026-10-25", items: [], campaigns: [] });
      if (url.includes("/notifications")) return json({ date: "2026-10-25" });
      return json([]);
    });
    render(
      <MemoryRouter initialEntries={["/comunicacoes?aba=automaticas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Nova campanha automática" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nova campanha automática",
    });
    fireEvent.change(within(dialog).getByLabelText("Nome da campanha"), {
      target: { value: "Aniversário com desconto" },
    });
    fireEvent.change(within(dialog).getByLabelText("Momento da mensagem 1"), {
      target: { value: "7" },
    });
    installDocumentBrowserMocks();
    setDocumentText(
      within(dialog).getByRole("textbox", { name: "Mensagem 1" }),
      "Ganhe 20% no seu aniversário!",
    );
    fireEvent.click(within(dialog).getByLabelText(/Campanha promocional/));
    fireEvent.change(
      within(dialog).getByLabelText(
        "Validade da promoção (dias a partir da primeira mensagem)",
      ),
      { target: { value: "10" } },
    );
    expect(
      within(dialog).getByText(
        "Com a primeira mensagem 7 dias antes, a promoção vale até 3 dias depois do evento.",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByLabelText(/deixar o cliente fora desta campanha/),
    );
    fireEvent.change(within(dialog).getByLabelText("Tempo fora da campanha"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Unidade"), {
      target: { value: "months" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar campanha" }),
    );
    await waitFor(() =>
      expect(created[0]).toEqual({
        name: "Aniversário com desconto",
        trigger: "birthday",
        active: true,
        steps: [{ offset: 7, message: "Ganhe 20% no seu aniversário!" }],
        promotion: { validDays: 10, cooldown: { amount: 2, unit: "months" } },
      }),
    );
  });
});
