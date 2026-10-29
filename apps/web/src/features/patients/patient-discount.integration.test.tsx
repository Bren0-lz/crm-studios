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

const patient = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId: "11111111-1111-4111-8111-111111111111",
  recordNumber: "PAC-00001",
  fullName: "Maria Aparecida Lima",
  cpf: "52998224725",
  phone: "11987654321",
  tags: [],
  status: "active",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

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

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function sentBody(method: string, suffix: string) {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([url, options]) =>
        options?.method === method && String(url).endsWith(suffix),
    );
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

async function openNewClient() {
  fireEvent.click(await screen.findByRole("button", { name: "Novo cliente" }));
  const dialog = await screen.findByRole("dialog", { name: "Novo cliente" });
  fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
    target: { value: patient.fullName },
  });
  fireEvent.change(within(dialog).getByLabelText("CPF"), {
    target: { value: patient.cpf },
  });
  fireEvent.change(
    within(
      within(dialog).getByRole("group", { name: "Contato" }),
    ).getByLabelText("Telefone"),
    { target: { value: patient.phone } },
  );
  return dialog;
}

describe("client discount", () => {
  it("configures a percentage discount in a modal and sends it with the registration", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (_input, options) => {
      const body = options?.method === "POST" ? patient : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt("/clientes");
    const dialog = await openNewClient();
    expect(within(dialog).getByText("Sem desconto configurado.")).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Configurar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do cliente",
    });
    fireEvent.change(
      within(discount).getByLabelText("Porcentagem de desconto (%)"),
      { target: { value: "150" } },
    );
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    expect(
      await within(discount).findByText("A porcentagem pode ser de até 100%."),
    ).toBeVisible();
    fireEvent.change(
      within(discount).getByLabelText("Porcentagem de desconto (%)"),
      { target: { value: "12,5" } },
    );
    // Alcance: nas próximas cobranças pede quantas (mínimo 2).
    fireEvent.click(within(discount).getByLabelText("Nas próximas cobranças"));
    fireEvent.change(
      within(discount).getByLabelText(
        "Quantas cobranças (parcelas ou renovações)",
      ),
      { target: { value: "1" } },
    );
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    // Menos de 2 cobranças não passa da validação do campo (para uma só, "Só no próximo pagamento").
    expect(
      within(discount).getByLabelText(
        "Quantas cobranças (parcelas ou renovações)",
      ),
    ).toBeInvalid();
    expect(
      screen.getByRole("dialog", { name: "Desconto do cliente" }),
    ).toBeInTheDocument();
    fireEvent.change(
      within(discount).getByLabelText(
        "Quantas cobranças (parcelas ou renovações)",
      ),
      { target: { value: "3" } },
    );
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Desconto do cliente" }),
      ).toBeNull(),
    );
    expect(
      within(dialog).getByText("12,5% de desconto · nas próximas 3 cobranças"),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    );
    await waitFor(() =>
      expect(sentBody("POST", "/patients")).toMatchObject({
        discount: {
          type: "percentage",
          percent: 12.5,
          scope: "next",
          charges: 3,
        },
      }),
    );
  });

  it("configures an amount discount", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (_input, options) => {
      const body = options?.method === "POST" ? patient : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt("/clientes");
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Configurar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do cliente",
    });
    fireEvent.click(within(discount).getByLabelText("Valor (R$)"));
    fireEvent.change(
      within(discount).getByLabelText("Valor do desconto (R$)"),
      {
        target: { value: "25,00" },
      },
    );
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    expect(
      await within(dialog).findByText(
        /R\$\s25,00 de desconto · só no próximo pagamento/,
      ),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    );
    await waitFor(() =>
      expect(sentBody("POST", "/patients")).toMatchObject({
        discount: { type: "amount", amountInCents: 2500, scope: "once" },
      }),
    );
  });

  it("removes the saved discount when editing the client", async () => {
    login();
    const withDiscount = {
      ...patient,
      discount: {
        type: "percentage",
        percent: 10,
        scope: "permanent",
        usedCharges: 4,
      },
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body =
        options?.method === "PUT"
          ? patient
          : url.endsWith(`/patients/${patient.id}`)
            ? withDiscount
            : /\/patients(\?|$)/.test(url)
              ? [withDiscount]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt(`/clientes/${patient.id}`);
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    expect(
      within(summary).getByText("Desconto").closest("div"),
    ).toHaveTextContent("10% de desconto · permanente");
    fireEvent.click(
      await screen.findByRole("button", { name: /Editar cadastro|Editar/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar cliente",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Alterar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do cliente",
    });
    expect(
      within(discount).getByLabelText("Porcentagem de desconto (%)"),
    ).toHaveValue("10");
    expect(
      within(discount).getByLabelText("Permanente (até remover)"),
    ).toBeChecked();
    expect(
      within(discount).getByText(/Já usado em 4 cobranças\./),
    ).toBeInTheDocument();
    fireEvent.click(
      within(discount).getByRole("button", { name: "Remover desconto" }),
    );
    expect(
      await within(dialog).findByText("Sem desconto configurado."),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    await waitFor(() =>
      expect(sentBody("PUT", `/patients/${patient.id}`)).toMatchObject({
        discount: null,
      }),
    );
  });
});
