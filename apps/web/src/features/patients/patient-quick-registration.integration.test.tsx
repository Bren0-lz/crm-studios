import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { formatCep } from "../../shared/lib/cep";

function login() {
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
}

async function openNewClient() {
  render(
    <MemoryRouter initialEntries={["/clientes"]}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Novo cliente" }));
  return screen.findByRole("dialog", { name: "Novo cliente" });
}

describe("quick client registration", () => {
  it("keeps the essentials visible and collapses the rest under Mais informações", async () => {
    login();
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    const dialog = await openNewClient();
    for (const label of [
      "Nome completo",
      "Telefone",
      "E-mail",
      "Data de nascimento",
    ])
      expect(within(dialog).getAllByLabelText(label)[0]).toBeVisible();
    const more = within(dialog)
      .getByText("Mais informações")
      .closest("details")!;
    expect(more).not.toHaveAttribute("open");
    expect(more).toContainElement(within(dialog).getByLabelText("CPF"));
    expect(more).toContainElement(within(dialog).getByLabelText("Observações"));
  });

  it("formats the CEP and fills the address from ViaCEP", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://viacep.com.br/ws/01001000/json/"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
            uf: "SP",
          }),
        } as Response;
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    const dialog = await openNewClient();
    fireEvent.change(within(dialog).getByLabelText("CEP"), {
      target: { value: "01001000" },
    });
    expect(within(dialog).getByLabelText("CEP")).toHaveValue("01001-000");
    expect(
      await within(dialog).findByDisplayValue("Praça da Sé"),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Bairro")).toHaveValue("Sé");
    expect(within(dialog).getByLabelText("Cidade")).toHaveValue("São Paulo");
    expect(within(dialog).getByLabelText("UF")).toHaveValue("SP");
  });

  it("masks partial CEPs", () => {
    expect(formatCep("0100")).toBe("0100");
    expect(formatCep("010010")).toBe("01001-0");
    expect(formatCep("01001-000123")).toBe("01001-000");
  });
});
