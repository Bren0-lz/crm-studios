import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function seed() {
  const api = await setupApi();
  const patient = await api.repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Bianca Vendas",
    phone: "11988887777",
    tags: [],
  });
  const cream = await api.repository.createProduct(clinicId, actorId, {
    name: "Creme relaxante",
    sku: "CREME",
    unit: "un",
    costInCents: 1_000,
    salePriceInCents: 4_000,
    initialStock: 5,
    minimumStock: 1,
  });
  const oil = await api.repository.createProduct(clinicId, actorId, {
    name: "Óleo de massagem",
    sku: "OLEO",
    unit: "un",
    costInCents: 1_500,
    salePriceInCents: 3_000,
    initialStock: 2,
    minimumStock: 1,
  });
  return { ...api, patient, cream, oil };
}

async function choosePatient(name: string, scope: HTMLElement) {
  fireEvent.change(within(scope).getByRole("combobox", { name: "Cliente" }), {
    target: { value: name.split(" ")[0] },
  });
  fireEvent.click(await screen.findByRole("option", { name }));
}

async function sell(
  repository: Awaited<ReturnType<typeof seed>>["repository"],
  patientId: string,
  productId: string,
  quantity: number,
) {
  return repository.createProductSale(clinicId, actorId, {
    patientId,
    items: [{ productId, quantity }],
    settlement: "receivable",
    dueDate: "2099-01-10",
  });
}

describe("página Vendas de produtos", () => {
  it("registra uma venda paga com preço ajustado em uma etapa", async () => {
    const { repository, patient, cream, oil } = await seed();
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
    expect(screen.getByRole("heading", { name: "Vendas de produtos" }));
    const submit = within(panel).getByRole("button", {
      name: "Registrar venda",
    });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(
      "Falta: cliente, ao menos um produto.",
    );

    await choosePatient(patient.fullName, panel);
    fireEvent.change(within(panel).getByLabelText("Produto 1"), {
      target: { value: cream.id },
    });
    fireEvent.change(within(panel).getByLabelText("Quantidade 1"), {
      target: { value: "2" },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Adicionar produto" }),
    );
    fireEvent.change(within(panel).getByLabelText("Produto 2"), {
      target: { value: oil.id },
    });
    fireEvent.change(within(panel).getByLabelText("Quantidade 2"), {
      target: { value: "3" },
    });
    expect(submit).toHaveAccessibleDescription(
      "Falta: quantidade dentro do estoque.",
    );
    expect(within(panel).getByText(/Estoque disponível: 2 un/));
    fireEvent.change(within(panel).getByLabelText("Quantidade 2"), {
      target: { value: "1" },
    });
    fireEvent.change(within(panel).getByLabelText("Preço unitário 2"), {
      target: { value: "25" },
    });
    expect(within(panel).getByText("Total").textContent).toMatch(/105,00/);
    fireEvent.change(within(panel).getByLabelText("Forma de pagamento"), {
      target: { value: "card" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(
      await screen.findByText(/Venda de R\$\s105,00 registrada para Bianca\./),
    ).toBeInTheDocument();
    const inventory = await repository.getInventoryWorkspace(clinicId);
    const sale = inventory.tabs.find((tab) => tab.patientId === patient.id)!;
    expect(sale).toMatchObject({
      status: "closed",
      paymentStatus: "paid",
      totalInCents: 10_500,
    });
    expect(
      inventory.products.find((item) => item.id === cream.id)?.currentStock,
    ).toBe(3);
    // O formulário volta vazio para a próxima venda.
    await waitFor(() =>
      expect(within(panel).getByLabelText("Produto 1")).toHaveValue(""),
    );
  });

  it("lista vendas realizadas, comandas abertas e o resumo do período", async () => {
    const { repository, patient, cream, oil } = await seed();
    await sell(repository, patient.id, cream.id, 2);
    await sell(repository, patient.id, oil.id, 1);
    const openButton = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient.id,
    });
    await repository.addPatientTabItem(clinicId, actorId, openButton.id, {
      productId: cream.id,
      quantity: 1,
    });
    open("/vendas?aba=vendas");

    const history = await screen.findByRole("region", {
      name: "Vendas realizadas",
    });
    const rows = within(history).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(history).getByText("2× Creme relaxante")).toBeInTheDocument();
    expect(within(history).getAllByText("A receber")).toHaveLength(2);
    fireEvent.change(within(history).getByLabelText("Cliente"), {
      target: { value: "outra pessoa" },
    });
    expect(
      within(history).getByText("Nenhuma venda no período"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Comandas abertas/ }));
    const openTabs = screen.getByRole("region", { name: "Comandas abertas" });
    fireEvent.click(
      within(openTabs).getByRole("button", {
        name: `Continuar comanda de ${patient.fullName}`,
      }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: `Comanda · ${patient.fullName}`,
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: `Comanda · ${patient.fullName}` }),
      ).getByRole("button", { name: "Fechar" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Resumo" }));
    const summary = await screen.findByRole("region", {
      name: "Resumo de vendas",
    });
    const total = within(summary)
      .getByText("Total vendido")
      .closest<HTMLElement>(".metric-card")!;
    expect(total.textContent).toMatch(/110,00/);
    const ticket = within(summary)
      .getByText("Ticket médio")
      .closest<HTMLElement>(".metric-card")!;
    expect(ticket.textContent).toMatch(/55,00/);
    const top = screen.getByRole("region", { name: "Produtos mais vendidos" });
    const [first] = within(top).getAllByRole("row").slice(1);
    expect(within(first!).getByText("Creme relaxante")).toBeInTheDocument();
  });

  it("não oferece produto sem estoque e limita a comanda aberta ao saldo", async () => {
    const { repository, patient, cream, oil } = await seed();
    await sell(repository, patient.id, oil.id, 2);
    const tab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient.id,
    });
    await repository.addPatientTabItem(clinicId, actorId, tab.id, {
      productId: cream.id,
      quantity: 1,
    });
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
    expect(
      within(panel).getByRole("option", {
        name: "Óleo de massagem · sem estoque",
      }),
    ).toBeDisabled();
    expect(
      within(panel).getByRole("option", { name: "Creme relaxante · 4 un" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Comandas abertas/ }));
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Comandas abertas" }),
      ).getByRole("button", {
        name: `Continuar comanda de ${patient.fullName}`,
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: `Comanda · ${patient.fullName}`,
    });
    expect(
      within(dialog).getByRole("option", {
        name: "Óleo de massagem · sem estoque",
      }),
    ).toBeDisabled();
    const add = within(dialog)
      .getAllByRole("button", { name: "Adicionar produto" })
      .at(-1)!;
    fireEvent.change(within(dialog).getByLabelText("Produto"), {
      target: { value: cream.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Quantidade"), {
      target: { value: "5" },
    });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(
      "Falta: quantidade dentro do estoque (4 disponível).",
    );

    // No ajuste, o que já está reservado no item conta como disponível (1 + 4).
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ajustar item" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Quantidade"), {
      target: { value: "6" },
    });
    const saveItem = within(dialog).getByRole("button", {
      name: "Salvar item",
    });
    expect(saveItem).toHaveAccessibleDescription(
      "Falta: quantidade dentro do estoque (5 disponível).",
    );
    fireEvent.change(within(dialog).getByLabelText("Quantidade"), {
      target: { value: "5" },
    });
    expect(saveItem).toBeEnabled();
    fireEvent.click(saveItem);
    await within(dialog).findByText("Item atualizado.");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === cream.id,
      )?.currentStock,
    ).toBe(0);
  });

  it("abre a comanda e segue no mesmo modal para lançar e fechar", async () => {
    const { repository, patient, cream } = await seed();
    open("/vendas");
    await screen.findByRole("region", { name: "Nova venda" });
    fireEvent.click(screen.getByRole("button", { name: /Comandas abertas/ }));
    const section = screen.getByRole("region", { name: "Comandas abertas" });
    fireEvent.click(
      within(section).getByRole("button", { name: "Abrir comanda" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova comanda" });
    const openButton = within(dialog).getByRole("button", {
      name: "Abrir comanda",
    });
    expect(openButton).toBeDisabled();
    await choosePatient(patient.fullName, dialog);
    fireEvent.submit(openButton.closest("form")!);
    // O mesmo modal passa a mostrar a comanda, sem itens e com o total zerado.
    expect(
      await screen.findByRole("dialog", {
        name: `Comanda · ${patient.fullName}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Nova comanda" }),
    ).not.toBeInTheDocument();
    const editor = screen.getByRole("dialog", {
      name: `Comanda · ${patient.fullName}`,
    });
    expect(within(editor).getByText(/Nenhum item ainda/)).toBeInTheDocument();
    expect(
      within(editor).getByRole("button", { name: "Produto" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(within(editor).getByLabelText("Produto"), {
      target: { value: cream.id },
    });
    fireEvent.submit(
      within(editor)
        .getByRole("button", { name: "Adicionar produto" })
        .closest("form")!,
    );
    await within(editor).findByText("Produto reservado na comanda.");
    expect(within(editor).getByText("Creme relaxante")).toBeInTheDocument();
    expect(
      within(editor).getByText("Total").querySelector("strong")?.textContent,
    ).toMatch(/40,00/);
    fireEvent.click(
      within(editor).getByRole("button", { name: "Fechar comanda" }),
    );
    expect(
      within(editor).getByText(/Gera uma conta a receber de R\$\s*40,00/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Confirmar fechamento" }),
    );
    await within(editor).findByText(
      "Comanda fechada com cobrança consolidada.",
    );
    await waitFor(async () =>
      expect(
        (await repository.getInventoryWorkspace(clinicId)).tabs.find(
          (item) => item.patientId === patient.id,
        )?.status,
      ).toBe("closed"),
    );
  });

  it("esconde a nova venda de quem não pode fechar comandas", async () => {
    const { repository, app } = await setupApi();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Consulta de vendas",
        email: "consulta.vendas@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: ["patients.view", "patients.inventory_view"],
      },
      "hash-de-teste",
    );
    const token = app.jwt.sign({ sub: user.id, clinicId, role: "user" });
    const me = await app.inject({
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    localStorage.setItem("crm.auth.token", token);
    localStorage.setItem("crm.auth.user", me.body);
    open("/vendas");
    expect(
      await screen.findByRole("region", { name: "Vendas realizadas" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nova venda" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Vendas de produtos/ }),
    ).toBeInTheDocument();
  });
});
