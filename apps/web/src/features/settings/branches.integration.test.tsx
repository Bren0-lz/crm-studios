import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { change, open } from "../../test-support/workflow-ui";

describe("branches through real HTTP handlers", () => {
  it("creates a branch in the settings and sends the branch chosen in the header", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Filiais" }));
    const panel = await screen.findByRole("tabpanel", { name: "Filiais" });
    await within(panel).findByText("Matriz");
    // Só uma filial: o cabeçalho não mostra o seletor.
    expect(screen.queryByLabelText("Filial ativa")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Nova filial" }));
    const dialog = screen.getByRole("dialog", { name: "Nova filial" });
    change("Nome da filial", "Centro", dialog);
    change("Telefone", "11 3333-4444", dialog);
    expect(within(dialog).getByLabelText("Telefone")).toHaveValue(
      "(11) 3333-4444",
    );
    change("Rua", "Rua das Flores", dialog);
    change("Número", "10", dialog);
    change("Bairro", "Centro", dialog);
    change("Cidade", "Campinas", dialog);
    change("UF", "SP", dialog);
    change("Ponto de referência", "Em frente à praça", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar filial" }),
    );
    await within(panel).findByText("Filial cadastrada.");
    expect(within(panel).getByText("Centro")).toBeInTheDocument();
    const centro = (await repository.listBranches(clinicId)).find(
      (branch) => branch.name === "Centro",
    )!;
    expect(centro).toMatchObject({
      phone: "1133334444",
      street: "Rua das Flores",
      number: "10",
      neighborhood: "Centro",
      city: "Campinas",
      state: "SP",
      reference: "Em frente à praça",
    });
    expect(
      within(panel).getByText(
        "Rua das Flores, 10 · Centro · Campinas/SP · (11) 3333-4444",
      ),
    ).toBeInTheDocument();

    // Com duas filiais o seletor aparece; a escolha vai no cabeçalho das requisições.
    cleanup();
    open("/configuracoes");
    const selector = await screen.findByLabelText("Filial ativa");
    expect(
      within(selector)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todas as filiais", "Matriz", "Centro"]);
    vi.mocked(fetch).mockClear();
    fireEvent.change(selector, { target: { value: centro.id } });
    expect(localStorage.getItem("crm.branch.id")).toBe(centro.id);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0),
    );
    const headers = new Headers(
      vi.mocked(fetch).mock.calls.at(-1)![1]?.headers,
    );
    expect(headers.get("x-branch-id")).toBe(centro.id);
  });
});
