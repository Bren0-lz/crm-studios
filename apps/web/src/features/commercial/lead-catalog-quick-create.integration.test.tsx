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

type Entry = { id: string; name: string; active: boolean; sizes: string[] };

function signIn(role: "admin" | "reception") {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role,
    }),
  );
}

/** Catálogos em memória: o POST inclui o item e a próxima leitura já o devolve. */
function mockApi() {
  const catalogs: Record<string, Entry[]> = {
    lead_source: [{ id: "s1", name: "Instagram", active: true, sizes: [] }],
    interest: [{ id: "i1", name: "Pilates", active: true, sizes: [] }],
  };
  const catalogPosts: Array<{ kind: string; body: Record<string, unknown> }> =
    [];
  const leadPosts: Array<Record<string, unknown>> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const kind = /\/clinic-catalogs\/(\w+)$/.exec(url)?.[1];
    if (init?.method === "POST" && kind) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      catalogPosts.push({ kind, body });
      const entry = {
        id: `new-${catalogPosts.length}`,
        name: String(body.name),
        active: body.active !== false,
        sizes: [],
      };
      (catalogs[kind] ??= []).push(entry);
      return { ok: true, status: 201, json: async () => entry } as Response;
    }
    if (init?.method === "POST" && url.endsWith("/leads")) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      leadPosts.push(body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ...body,
          id: "l1",
          clinicId: "11111111-1111-4111-8111-111111111111",
          stage: "new_contact",
          openTasks: 0,
          overdueTasks: 0,
          createdAt: "2026-11-12T12:00:00.000Z",
          updatedAt: "2026-11-12T12:00:00.000Z",
        }),
      } as Response;
    }
    const body = kind
      ? (catalogs[kind] ?? [])
      : isLeadBoardUrl(url)
        ? leadBoardResponse(url, [])
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  return { catalogPosts, leadPosts };
}

async function openNewLead() {
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Novo lead/ }));
  return screen.getByRole("dialog", { name: "Novo lead" });
}

describe("novo lead: WhatsApp e cadastro de origem/interesse sem sair do lead", () => {
  it("cadastra origem e interesse por cima do lead, mantendo o que foi preenchido", async () => {
    signIn("admin");
    const { catalogPosts, leadPosts } = mockApi();
    const dialog = await openNewLead();

    // WhatsApp à vista, ao lado do telefone (sem abrir "Mais informações").
    const whatsapp = within(dialog).getByLabelText("WhatsApp");
    expect(whatsapp).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Lead Novo" },
    });
    fireEvent.change(within(dialog).getByLabelText("Telefone"), {
      target: { value: "11977776666" },
    });
    fireEvent.change(whatsapp, { target: { value: "11966665555" } });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cadastrar origem" }),
    );
    const sourceDialog = screen.getByRole("dialog", { name: "Nova origem" });
    // O lead continua aberto (só inativo por baixo) e com o que foi digitado.
    expect(
      screen.getByRole("dialog", { name: "Novo lead", hidden: true }),
    ).toBe(dialog);
    expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
      "Lead Novo",
    );
    fireEvent.change(within(sourceDialog).getByLabelText("Nome"), {
      target: { value: "Feira do bairro" },
    });
    fireEvent.click(
      within(sourceDialog).getByRole("button", { name: "Salvar" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova origem" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Novo lead" })).toBe(dialog);
    const origin = within(dialog).getByRole("combobox", { name: "Origem" });
    expect(origin).toHaveValue("Feira do bairro");
    await waitFor(() =>
      expect(
        within(origin)
          .getAllByRole("option")
          .map((item) => item.textContent),
      ).toEqual(["Selecione", "Instagram", "Feira do bairro", "Outro"]),
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cadastrar interesse" }),
    );
    const interestDialog = screen.getByRole("dialog", {
      name: "Novo interesse",
    });
    fireEvent.change(within(interestDialog).getByLabelText("Nome"), {
      target: { value: "Reabilitação" },
    });
    fireEvent.click(
      within(interestDialog).getByRole("button", { name: "Salvar" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "Interesse" }),
      ).toHaveValue("Reabilitação"),
    );
    expect(catalogPosts).toEqual([
      { kind: "lead_source", body: { name: "Feira do bairro", active: true } },
      { kind: "interest", body: { name: "Reabilitação", active: true } },
    ]);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    await waitFor(() => expect(leadPosts).toHaveLength(1));
    expect(leadPosts[0]).toMatchObject({
      fullName: "Lead Novo",
      phone: "11977776666",
      whatsapp: "11966665555",
      source: "Feira do bairro",
      interest: "Reabilitação",
    });
  });

  it("Esc fecha só o cadastro de origem, e o lead continua aberto", async () => {
    signIn("admin");
    const { catalogPosts } = mockApi();
    const dialog = await openNewLead();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cadastrar origem" }),
    );
    expect(screen.getByRole("dialog", { name: "Nova origem" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova origem" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Novo lead" })).toBe(dialog);
    expect(catalogPosts).toHaveLength(0);
  });

  it("sem perfil de administrador, os botões de cadastro não aparecem", async () => {
    signIn("reception");
    mockApi();
    const dialog = await openNewLead();
    expect(within(dialog).getByLabelText("WhatsApp")).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "Cadastrar origem" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Cadastrar interesse" }),
    ).not.toBeInTheDocument();
  });
});
