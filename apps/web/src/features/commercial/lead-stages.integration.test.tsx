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

type Stage = { stage: string; label: string; kind: string };
const kind = (stage: string) =>
  stage === "won" ? "won" : stage === "lost" ? "lost" : "open";
const defaults: Stage[] = [
  ["new_contact", "Novos"],
  ["contacted", "Em contato"],
  ["evaluation", "Avaliação"],
  ["proposal", "Proposta"],
  ["won", "Ganhos"],
  ["lost", "Perdidos"],
].map(([stage, label]) => ({
  stage: stage!,
  label: label!,
  kind: kind(stage!),
}));

/** API em memória só para o funil: a resposta do PUT imita a regra da chave `won`. */
function setup(role: string, reject?: string) {
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
  let stages = defaults;
  let created = 0;
  const puts: Array<{
    stages: Array<{ stage?: string; label: string; final?: boolean }>;
  }> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    let body: unknown = [];
    if (url.endsWith("/leads/stages")) {
      if (init?.method === "PUT") {
        const payload = JSON.parse(String(init.body));
        puts.push(payload);
        if (reject)
          return {
            ok: false,
            status: 409,
            json: async () => ({ message: reject }),
          } as Response;
        const finalIndex = payload.stages.findIndex(
          (item: { final?: boolean }) => item.final,
        );
        stages = payload.stages.map(
          (item: { stage?: string; label: string }, index: number) => {
            const stage =
              index === finalIndex
                ? "won"
                : !item.stage || (finalIndex >= 0 && item.stage === "won")
                  ? `stage_novo${(created += 1)}`
                  : item.stage;
            return { stage, label: item.label, kind: kind(stage) };
          },
        );
      }
      body = stages;
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

const columns = () =>
  screen
    .getAllByRole("region")
    .filter((item) => item.classList.contains("kanban-column"))
    .map((item) => item.getAttribute("aria-label"));

describe("configurable lead funnel", () => {
  it("renames a stage with the column pencil", async () => {
    const puts = setup("owner");
    await screen.findByRole("region", { name: "Proposta" });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar etapa Proposta" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Editar etapa" });
    const name = within(dialog).getByLabelText("Nome da etapa");
    fireEvent.change(name, { target: { value: "novos" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar etapa" }),
    );
    expect(
      await within(dialog).findByText("Já existe uma etapa com esse nome."),
    ).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    fireEvent.change(name, { target: { value: "  Negociação " } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar etapa" }),
    );
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.stages[3]).toEqual({
      stage: "proposal",
      label: "Negociação",
    });
    expect(
      await screen.findByRole("region", { name: "Negociação" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Proposta" })).toBeNull();
    expect(
      within(screen.getByLabelText("Etapa de Bruna Lead")).getByRole("option", {
        name: "Negociação",
      }),
    ).toBeInTheDocument();
  });

  it("adds a final stage in the chosen position and removes a stage", async () => {
    const puts = setup("owner");
    await screen.findByRole("region", { name: "Proposta" });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar etapa" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Adicionar etapa",
    });
    fireEvent.change(within(dialog).getByLabelText("Nome da etapa"), {
      target: { value: "Matrícula" },
    });
    expect(within(dialog).getByLabelText("Posição no funil")).toHaveValue(
      "proposal",
    );
    fireEvent.click(
      within(dialog).getByLabelText("Etapa final do funil (ganhos)"),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar etapa" }),
    );
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.stages.map((item) => item.label)).toEqual([
      "Novos",
      "Em contato",
      "Avaliação",
      "Proposta",
      "Matrícula",
      "Ganhos",
      "Perdidos",
    ]);
    expect(puts[0]!.stages[4]).toEqual({ label: "Matrícula", final: true });
    await screen.findByRole("region", { name: "Matrícula" });
    expect(columns()).toEqual([
      "Novos",
      "Em contato",
      "Avaliação",
      "Proposta",
      "Matrícula",
      "Ganhos",
      "Perdidos",
    ]);

    // A antiga etapa final virou etapa comum e pode ser removida.
    fireEvent.click(
      screen.getByRole("button", { name: "Editar etapa Ganhos" }),
    );
    const edit = await screen.findByRole("dialog", { name: "Editar etapa" });
    fireEvent.click(
      within(edit).getByRole("button", { name: "Remover etapa" }),
    );
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]!.stages.map((item) => item.label)).not.toContain("Ganhos");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Ganhos" })).toBeNull(),
    );
  });

  it("keeps the final and lost stages protected in the form", async () => {
    setup("owner");
    await screen.findByRole("region", { name: "Ganhos" });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar etapa Ganhos" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Editar etapa" });
    expect(
      within(dialog).getByLabelText("Etapa final do funil (ganhos)"),
    ).toBeChecked();
    expect(
      within(dialog).getByLabelText("Etapa final do funil (ganhos)"),
    ).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "Remover etapa" }),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(
      screen.getByRole("button", { name: "Editar etapa Perdidos" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Editar etapa" });
    expect(
      within(dialog).queryByLabelText("Etapa final do funil (ganhos)"),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Remover etapa" }),
    ).toBeNull();
  });

  it("shows the API refusal when the stage still has leads", async () => {
    setup(
      "owner",
      'A etapa "Novos" tem 1 lead. Mova-os para outra etapa antes de removê-la.',
    );
    await screen.findByRole("region", { name: "Novos" });
    fireEvent.click(screen.getByRole("button", { name: "Editar etapa Novos" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar etapa" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remover etapa" }),
    );
    expect(
      await within(dialog).findByText(
        'A etapa "Novos" tem 1 lead. Mova-os para outra etapa antes de removê-la.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Novos" })).toBeInTheDocument();
  });

  it("hides the funnel editing without the explicit permission", async () => {
    setup("reception");
    await screen.findByRole("region", { name: "Novos" });
    expect(
      screen.getByRole("button", { name: "Novo lead" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adicionar etapa" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar etapa/ })).toBeNull();
  });
});
