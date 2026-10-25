import {
  defaultNavTabLabels,
  navTabSchema,
  type NavTabLabel,
} from "@crm/contracts";
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

const defaults = (): NavTabLabel[] =>
  navTabSchema.options.map((tab) => ({
    tab,
    label: defaultNavTabLabels[tab],
  }));

function renderAs(role: "owner" | "user") {
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
  let labels = defaults();
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    let body: unknown = [];
    if (url.includes("/admin/nav-tabs") && init?.method === "PUT") {
      labels = (JSON.parse(String(init.body)) as { tabs: NavTabLabel[] }).tabs;
      body = labels;
    } else if (url.includes("/clinic/nav-tabs")) body = labels;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/configuracoes?secao=abas"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("nomes das abas do menu", () => {
  it("admin renomeia uma aba e o menu lateral passa a usar o novo nome", async () => {
    renderAs("owner");
    const panel = await screen.findByRole("tabpanel", {
      name: "Abas do menu",
    });
    const patients = await within(panel).findByLabelText("Aba: Clientes");
    fireEvent.change(patients, { target: { value: "Alunos" } });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Salvar nomes das abas" }),
    );
    expect(
      await within(panel).findByText("Nomes das abas salvos."),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(nav).getByRole("link", { name: "Alunos" })).toHaveAttribute(
      "href",
      "/clientes",
    );
    expect(
      within(nav).queryByRole("link", { name: "Clientes" }),
    ).not.toBeInTheDocument();
    const put = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).includes("/admin/nav-tabs") && init?.method === "PUT",
      );
    expect(JSON.parse(String(put?.[1]?.body)).tabs[3]).toEqual({
      tab: "patients",
      label: "Alunos",
    });
  });

  it("bloqueia nomes repetidos e restaura os nomes padrão", async () => {
    renderAs("owner");
    const panel = await screen.findByRole("tabpanel", {
      name: "Abas do menu",
    });
    fireEvent.change(await within(panel).findByLabelText("Aba: Agenda"), {
      target: { value: "turmas" },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Salvar nomes das abas" }),
    );
    expect(
      await within(panel).findByText("Duas abas não podem ter o mesmo nome."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Restaurar nomes padrão" }),
    );
    expect(within(panel).getByLabelText("Aba: Agenda")).toHaveValue("Agenda");
  });

  it("não mostra a seção para quem não é admin", async () => {
    renderAs("user");
    await waitFor(() =>
      expect(
        screen.getByRole("navigation", { name: "Navegação principal" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("tab", { name: "Abas do menu" }),
    ).not.toBeInTheDocument();
  });
});
