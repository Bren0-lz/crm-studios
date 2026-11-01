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

const pilatesId = "77777777-7777-4777-8777-777777777777";
const singleTemplate = {
  id: "b3333333-3333-4333-8333-333333333333",
  name: "Aula avulsa",
  kind: "single",
  active: true,
  totalValueInCents: 9000,
  services: [
    { serviceId: pilatesId, totalSessions: 1, totalValueInCents: 9000 },
  ],
};

/** Respostas da API: cadastro guiado devolve o cliente com o serviço avulso. */
function mockApi(extra: (url: string) => unknown = () => undefined) {
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input);
    const body =
      extra(url) ??
      (options?.method === "POST" && url.includes("/patients/guided")
        ? { patient }
        : options?.method === "POST"
          ? patient
          : url.includes("/plan-templates")
            ? [singleTemplate]
            : url.includes("/services")
              ? [{ id: pilatesId, name: "Pilates" }]
              : []);
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

async function chooseSingleService(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Adicionar serviço avulso" }),
  );
  fireEvent.change(await within(dialog).findByLabelText("Plano cadastrado"), {
    target: { value: singleTemplate.id },
  });
  return within(dialog).getByRole("group", { name: "Serviço avulso" });
}

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

describe("plan discount", () => {
  it("only offers the discount once a plan or service is chosen and sends it with it", async () => {
    login();
    mockApi();
    renderAt("/clientes");
    const dialog = await openNewClient();
    // Só o cadastro: nada de desconto (ele é do plano, não do cliente).
    expect(
      within(dialog).queryByRole("group", { name: "Desconto" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Configurar desconto" }),
    ).toBeNull();
    const block = await chooseSingleService(dialog);
    expect(
      within(block).getByText("Sem desconto neste serviço."),
    ).toBeVisible();
    fireEvent.click(
      within(block).getByRole("button", { name: "Configurar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do plano",
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
    expect(
      within(discount).getByLabelText(
        "Quantas cobranças (parcelas ou renovações)",
      ),
    ).toBeInvalid();
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
        screen.queryByRole("dialog", { name: "Desconto do plano" }),
      ).toBeNull(),
    );
    expect(
      within(block).getByText("12,5% de desconto · nas próximas 3 cobranças"),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e criar serviço avulso",
      }),
    );
    await waitFor(() =>
      expect(sentBody("POST", "/patients/guided")).toMatchObject({
        next: "single",
        plan: {
          planTemplateId: singleTemplate.id,
          discount: {
            type: "percentage",
            percent: 12.5,
            scope: "next",
            charges: 3,
          },
        },
      }),
    );
    expect(sentBody("POST", "/patients/guided").patient).not.toHaveProperty(
      "discount",
    );
  });

  it("removes the plan discount before saving", async () => {
    login();
    mockApi();
    renderAt("/clientes");
    const dialog = await openNewClient();
    const block = await chooseSingleService(dialog);
    fireEvent.click(
      within(block).getByRole("button", { name: "Configurar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do plano",
    });
    fireEvent.click(within(discount).getByLabelText("Valor (R$)"));
    fireEvent.change(
      within(discount).getByLabelText("Valor do desconto (R$)"),
      { target: { value: "25,00" } },
    );
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    expect(
      await within(block).findByText(
        /R\$\s25,00 de desconto · só no próximo pagamento/,
      ),
    ).toBeVisible();
    fireEvent.click(
      within(block).getByRole("button", { name: "Alterar desconto" }),
    );
    fireEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Desconto do plano" }),
      ).getByRole("button", { name: "Remover desconto" }),
    );
    expect(
      await within(block).findByText("Sem desconto neste serviço."),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e criar serviço avulso",
      }),
    );
    await waitFor(() =>
      expect(sentBody("POST", "/patients/guided")).toBeDefined(),
    );
    expect(sentBody("POST", "/patients/guided").plan).not.toHaveProperty(
      "discount",
    );
  });

  it("no longer shows a discount field when editing the client", async () => {
    login();
    const withDiscount = {
      ...patient,
      discount: { type: "percentage", percent: 10, scope: "permanent" },
    };
    mockApi((url) =>
      url.endsWith(`/patients/${patient.id}`)
        ? withDiscount
        : /\/patients(\?|$)/.test(url)
          ? [withDiscount]
          : undefined,
    );
    renderAt(`/clientes/${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: /Editar cadastro|Editar/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar cliente",
    });
    expect(
      within(dialog).queryByRole("button", { name: "Alterar desconto" }),
    ).toBeNull();
  });
});
