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

function catalog(names: string[]) {
  return names.map((name, index) => ({
    id: `c${index}`,
    name,
    active: name !== "Inativo",
  }));
}

describe("lead origin and interest selects", () => {
  it("lists the clinic catalogs, accepts 'Outro' and keeps a legacy free-text value", async () => {
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
    const legacy = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Lead Antigo",
      phone: "11987654321",
      source: "Panfleto na praça",
      interest: "Pilates",
      stage: "new_contact",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const posts: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/leads")) {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...legacy, ...body, id: "l2" }),
        } as Response;
      }
      const body = url.endsWith("/clinic-catalogs/lead_source")
        ? catalog(["Instagram", "Indicação", "Inativo"])
        : url.endsWith("/clinic-catalogs/interest")
          ? catalog(["Pilates", "Dançaterapia"])
          : url.endsWith("/leads")
            ? [legacy]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const options = (select: HTMLElement) =>
      within(select)
        .getAllByRole("option")
        .map((item) => item.textContent);

    // Lead antigo com origem em texto livre: o valor continua como opção.
    const card = (await screen.findByText("Lead Antigo")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(
      within(card).getByRole("button", { name: "Editar cadastro" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Editar lead" });
    let origin = within(dialog).getByRole("combobox", { name: "Origem" });
    await waitFor(() => expect(options(origin)).toContain("Instagram"));
    expect(origin).toHaveValue("Panfleto na praça");
    expect(options(origin)).toEqual([
      "Selecione",
      "Panfleto na praça",
      "Instagram",
      "Indicação",
      "Outro",
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: /Novo lead/ }));
    dialog = screen.getByRole("dialog", { name: "Novo lead" });
    origin = within(dialog).getByRole("combobox", { name: "Origem" });
    const interest = within(dialog).getByRole("combobox", {
      name: "Interesse",
    });
    await waitFor(() => expect(options(interest)).toContain("Dançaterapia"));
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Lead Novo" },
    });
    fireEvent.change(within(dialog).getByLabelText("Telefone"), {
      target: { value: "11977776666" },
    });
    fireEvent.change(interest, { target: { value: "Dançaterapia" } });
    fireEvent.change(origin, { target: { value: "__other__" } });
    fireEvent.change(within(dialog).getByLabelText("Origem: qual?"), {
      target: { value: "Feira do bairro" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      source: "Feira do bairro",
      interest: "Dançaterapia",
    });
  });
});
