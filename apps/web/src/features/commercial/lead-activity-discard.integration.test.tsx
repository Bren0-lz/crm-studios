import { fireEvent, render, screen, within } from "@testing-library/react";
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
  stage: "contacted",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

async function openActivity() {
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
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/tasks")) {
      const body = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ...body,
          id: "t-new",
          leadId: lead.id,
          status: "open",
          assignedUserName: "Aryana Dutra",
          createdAt: new Date().toISOString(),
        }),
      } as Response;
    }
    const body = url.endsWith("/activity")
      ? { contacts: [], tasks: [] }
      : isLeadBoardUrl(url)
        ? leadBoardResponse(url, [lead])
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
  const card = (await screen.findByText("Bruna Lead")).closest(
    "article",
  ) as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: "Atividades" }));
  const dialog = screen.getByRole("dialog", { name: "Bruna Lead" });
  await within(dialog).findByRole("button", { name: "Adicionar tarefa" });
  return dialog;
}

// QA-I-01: depois de gravar, o formulário limpo não é alteração pendente.
describe("atividades do lead", () => {
  it("fecha direto depois de criar a tarefa", async () => {
    const dialog = await openActivity();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar tarefa" }),
    );
    expect(await within(dialog).findByText("Retornar contato")).toBeVisible();
    expect(within(dialog).getByLabelText("Tarefa")).toHaveValue("");

    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(
      screen.queryByRole("dialog", { name: "Descartar alterações?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Bruna Lead" }),
    ).not.toBeInTheDocument();
  });

  it("ainda pergunta antes de descartar o que foi digitado depois de gravar", async () => {
    const dialog = await openActivity();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar tarefa" }),
    );
    await within(dialog).findByText("Retornar contato");
    fireEvent.change(within(dialog).getByLabelText("Tarefa"), {
      target: { value: "Enviar horários" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(
      await screen.findByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeInTheDocument();
  });
});
