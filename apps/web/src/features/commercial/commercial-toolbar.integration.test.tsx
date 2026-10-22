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

const me = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const base = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  phone: "11987654321",
  source: "Instagram",
  interest: "Pilates",
  stage: "new_contact",
};
const leads = [
  {
    ...base,
    id: "44444444-4444-4444-8444-000000000001",
    fullName: "Lead Meu",
    responsibleUserId: me,
    responsibleName: "Aryana Dutra",
  },
  {
    ...base,
    id: "44444444-4444-4444-8444-000000000002",
    fullName: "Lead Atrasado",
    responsibleUserId: other,
    responsibleName: "Bruno Costa",
    openTasks: 1,
    overdueTasks: 1,
  },
  {
    ...base,
    id: "44444444-4444-4444-8444-000000000003",
    fullName: "Lead Perdido",
    source: "Site",
    stage: "lost",
    lostReason: "Achou caro",
  },
];

function setup() {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: me,
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role: "owner",
    }),
  );
  const urls: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input) => {
    urls.push(String(input));
    const body = isLeadBoardUrl(input) ? leadBoardResponse(input, leads) : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
  return urls;
}

describe("commercial toolbar", () => {
  it("toggles quick filters on the server query and hides the lost column", async () => {
    const urls = setup();
    await screen.findByText("Lead Atrasado");
    // Cartão com tarefa atrasada ganha o selo; a coluna avisa quantos estão atrasados.
    const fresh = screen.getByRole("region", { name: "Novos" });
    expect(
      within(fresh).getByText("1 com tarefa atrasada"),
    ).toBeInTheDocument();
    expect(within(fresh).getByText("Tarefa atrasada")).toBeInTheDocument();

    const mine = screen.getByRole("button", { name: "Meus leads" });
    fireEvent.click(mine);
    expect(mine).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(screen.queryByText("Lead Atrasado")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Lead Meu")).toBeInTheDocument();
    expect(
      urls.some((url) => url.includes(`/leads/board?responsibleUserId=${me}`)),
    ).toBe(true);
    // O atalho ligado não vira chip duplicado nem some do contador do botão.
    expect(
      screen.queryByRole("button", { name: /Remover filtro/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filtros (1 ativo)" }),
    ).toBeInTheDocument();
    fireEvent.click(mine);
    expect(await screen.findByText("Lead Atrasado")).toBeInTheDocument();

    expect(
      screen.getByRole("region", { name: "Perdidos" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar perdidos" }));
    expect(
      screen.queryByRole("region", { name: "Perdidos" }),
    ).not.toBeInTheDocument();
  });

  it("only applies the modal filters on confirm and opens the funnel analysis", async () => {
    const urls = setup();
    await screen.findByText("Lead Perdido");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    let dialog = screen.getByRole("dialog", { name: "Filtros do funil" });
    fireEvent.change(await within(dialog).findByLabelText("Filtrar origem"), {
      target: { value: "Site" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Filtros do funil" }),
      ).not.toBeInTheDocument(),
    );
    expect(urls.some((url) => url.includes("source=Site"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    dialog = screen.getByRole("dialog", { name: "Filtros do funil" });
    await within(dialog).findByRole("option", { name: "Site" });
    fireEvent.change(within(dialog).getByLabelText("Filtrar origem"), {
      target: { value: "Site" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Aplicar filtros" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Lead Meu")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Achou caro")).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: "Remover filtro Origem" });
    fireEvent.click(chip);
    expect(await screen.findByText("Lead Meu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Análise" }));
    const analysis = screen.getByRole("dialog", { name: "Análise do funil" });
    expect(
      within(analysis).getByText("Conversão por origem"),
    ).toBeInTheDocument();
    expect(within(analysis).getByText("Achou caro")).toBeInTheDocument();
  });
});
