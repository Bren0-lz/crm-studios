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

const lead = {
  id: "44444444-4444-4444-8444-444444444444",
  clinicId: "11111111-1111-4111-8111-111111111111",
  fullName: "Bruna Lead",
  phone: "11987654321",
  source: "Instagram",
  interest: "Pilates",
  stage: "new_contact",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

function setup(role: string, saved: Array<{ stage: string; label: string }>) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Equipe",
      email: "equipe@movimenta.local",
      role,
    }),
  );
  const puts: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    let body: unknown = [];
    if (url.endsWith("/leads/stages")) {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        puts.push(payload);
        body = payload.stages;
      } else body = saved;
    } else if (isLeadBoardUrl(url)) body = leadBoardResponse(url, [lead]);
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
  return puts;
}

describe("lead stage names", () => {
  it("shows the clinic names and lets an admin rename the stages", async () => {
    const puts = setup("owner", [
      { stage: "new_contact", label: "Entrada" },
      { stage: "contacted", label: "Em contato" },
      { stage: "evaluation", label: "Avaliação" },
      { stage: "proposal", label: "Proposta" },
      { stage: "won", label: "Ganhos" },
      { stage: "lost", label: "Perdidos" },
    ]);
    expect(
      await screen.findByRole("region", { name: "Entrada" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Etapa de Bruna Lead")).getByRole("option", {
        name: "Entrada",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Renomear etapas" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Renomear etapas do funil",
    });
    const fourth = within(dialog).getByLabelText("Etapa 4");
    fireEvent.change(fourth, { target: { value: "Entrada" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nomes" }),
    );
    expect(
      await within(dialog).findByText(
        "Duas etapas não podem ter o mesmo nome.",
      ),
    ).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    fireEvent.change(fourth, { target: { value: "  Negociação " } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar nomes" }),
    );
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      stages: [
        { stage: "new_contact", label: "Entrada" },
        { stage: "contacted", label: "Em contato" },
        { stage: "evaluation", label: "Avaliação" },
        { stage: "proposal", label: "Negociação" },
        { stage: "won", label: "Ganhos" },
        { stage: "lost", label: "Perdidos" },
      ],
    });
    expect(
      await screen.findByRole("region", { name: "Negociação" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Proposta" })).toBeNull();
  });

  it("hides the rename action without the explicit permission", async () => {
    setup("reception", []);
    expect(
      await screen.findByRole("region", { name: "Novos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Novo lead" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Renomear etapas" }),
    ).toBeNull();
  });
});
