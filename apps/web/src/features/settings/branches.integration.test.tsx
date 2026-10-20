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
    change("Endereço", "Rua das Flores, 10", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar filial" }),
    );
    await within(panel).findByText("Filial cadastrada.");
    expect(within(panel).getByText("Centro")).toBeInTheDocument();
    const centro = (await repository.listBranches(clinicId)).find(
      (branch) => branch.name === "Centro",
    )!;
    expect(centro.address).toBe("Rua das Flores, 10");

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
