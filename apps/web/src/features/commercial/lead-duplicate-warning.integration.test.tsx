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

const existingLead = {
  id: "44444444-4444-4444-8444-444444444444",
  clinicId: "11111111-1111-4111-8111-111111111111",
  fullName: "Lead Com CPF",
  phone: "11955554444",
  email: "lead.antigo@email.com",
  cpf: "52998224725",
  source: "Instagram",
  interest: "Pilates",
  stage: "contacted",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

type Match = {
  kind: "patient" | "lead";
  id: string;
  fullName: string;
  fields: Array<"phone" | "email" | "cpf">;
};

function setup(matches: Match[]) {
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
  const checks: URLSearchParams[] = [];
  const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST" || init?.method === "PUT") {
      const body = JSON.parse(String(init.body ?? "{}"));
      writes.push({ method: init.method, body });
      return {
        ok: true,
        status: init.method === "POST" ? 201 : 200,
        json: async () => ({
          ...existingLead,
          ...body,
          id:
            init.method === "POST"
              ? "55555555-5555-4555-8555-555555555555"
              : existingLead.id,
        }),
      } as Response;
    }
    if (url.includes("/leads/duplicates")) {
      checks.push(new URL(url, "http://localhost").searchParams);
      return {
        ok: true,
        status: 200,
        json: async () => ({ matches }),
      } as Response;
    }
    const body = isLeadBoardUrl(url)
      ? leadBoardResponse(url, [existingLead])
      : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
  return { checks, writes };
}

async function openNewLead() {
  fireEvent.click(await screen.findByRole("button", { name: /Novo lead/ }));
  const dialog = screen.getByRole("dialog", { name: "Novo lead" });
  fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
    target: { value: "Lead Novo" },
  });
  fireEvent.change(within(dialog).getByLabelText("Telefone"), {
    target: { value: "11977776666" },
  });
  return dialog;
}

describe("lead duplicate warning", () => {
  it("warns about a client with the same phone before saving and saves anyway on request", async () => {
    const { checks, writes } = setup([
      {
        kind: "patient",
        id: "66666666-6666-4666-8666-666666666666",
        fullName: "Maria Souza",
        fields: ["phone"],
      },
    ]);
    const dialog = await openNewLead();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    const warning = await within(dialog).findByRole("alert");
    expect(warning).toHaveTextContent(
      "Telefone já cadastrado para Maria Souza (cliente).",
    );
    expect(checks[0]!.get("phone")).toBe("11977776666");
    expect(writes).toHaveLength(0);
    expect(
      within(warning).getByRole("button", {
        name: "Abrir ficha de Maria Souza",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(warning).getByRole("button", { name: "Salvar mesmo assim" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: "POST",
      body: { fullName: "Lead Novo", phone: "11977776666" },
    });
  });

  it("warns about an e-mail already used by another lead", async () => {
    const { checks, writes } = setup([
      {
        kind: "lead",
        id: existingLead.id,
        fullName: "Lead Com CPF",
        fields: ["email"],
      },
    ]);
    const dialog = await openNewLead();
    fireEvent.change(within(dialog).getByLabelText("E-mail"), {
      target: { value: "Lead.Antigo@email.com" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    const warning = await within(dialog).findByRole("alert");
    expect(warning).toHaveTextContent(
      "E-mail já cadastrado para Lead Com CPF (lead).",
    );
    expect(checks[0]!.get("email")).toBe("Lead.Antigo@email.com");
    // Lead não tem ficha: só a opção de seguir.
    expect(
      within(warning).queryByRole("button", { name: /Abrir ficha/ }),
    ).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("warns about the CPF of a client when editing the lead's contact", async () => {
    const { checks, writes } = setup([
      {
        kind: "patient",
        id: "66666666-6666-4666-8666-666666666666",
        fullName: "Cliente Do CPF",
        fields: ["cpf"],
      },
    ]);
    const card = (await screen.findByText("Lead Com CPF")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(
      within(card).getByRole("button", { name: "Editar cadastro" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar lead" });
    fireEvent.change(within(dialog).getByLabelText("E-mail"), {
      target: { value: "novo.email@email.com" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cadastro" }),
    );
    const warning = await within(dialog).findByRole("alert");
    expect(warning).toHaveTextContent(
      "CPF já cadastrado para Cliente Do CPF (cliente).",
    );
    expect(checks[0]!.get("cpf")).toBe("52998224725");
    expect(checks[0]!.get("excludeLeadId")).toBe(existingLead.id);
    expect(writes).toHaveLength(0);
    fireEvent.click(
      within(warning).getByRole("button", { name: "Salvar mesmo assim" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: "PUT",
      body: { email: "novo.email@email.com" },
    });
  });

  it("saves right away when nobody else has the contact", async () => {
    const { checks, writes } = setup([]);
    const dialog = await openNewLead();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(checks).toHaveLength(1);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not check again when editing a lead without changing its contact", async () => {
    const { checks, writes } = setup([
      {
        kind: "patient",
        id: "66666666-6666-4666-8666-666666666666",
        fullName: "Cliente Do CPF",
        fields: ["cpf"],
      },
    ]);
    const card = (await screen.findByText("Lead Com CPF")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(
      within(card).getByRole("button", { name: "Editar cadastro" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar lead" });
    fireEvent.change(within(dialog).getByLabelText("Observações"), {
      target: { value: "Prefere manhã" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cadastro" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(checks).toHaveLength(0);
  });
});
