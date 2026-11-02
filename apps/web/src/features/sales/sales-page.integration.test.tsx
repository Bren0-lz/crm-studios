import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PermissionKey } from "@crm/contracts";
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
  });
  const oil = await api.repository.createProduct(clinicId, actorId, {
    name: "Óleo de massagem",
    sku: "OLEO",
    unit: "un",
    costInCents: 1_500,
    salePriceInCents: 3_000,
    initialStock: 2,
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
      target: { value: "25,00" },
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

  it("aplica desconto por produto e desconto geral, como no cadastro do cliente", async () => {
    const { repository, patient, cream, oil } = await seed();
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
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
    expect(within(panel).getByText("Total").textContent).toMatch(/110,00/);

    // Desconto de 10% só no creme (2 × R$ 40,00).
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Configurar desconto do produto 1",
      }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Desconto do produto",
    });
    fireEvent.change(
      within(dialog).getByLabelText("Porcentagem de desconto (%)"),
      { target: { value: "10" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Aplicar desconto" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(within(panel).getByText(/10% de desconto · − R\$\s8,00/));
    expect(within(panel).getByText("Total").textContent).toMatch(/102,00/);

    // Desconto geral de R$ 10,00, dividido entre os dois produtos.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Configurar desconto geral" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Desconto geral" });
    fireEvent.click(within(dialog).getByLabelText("Valor (R$)"));
    fireEvent.change(within(dialog).getByLabelText("Valor do desconto (R$)"), {
      target: { value: "10,00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Aplicar desconto" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const summary = within(panel).getByLabelText("Resumo dos descontos");
    expect(summary).toHaveTextContent(/Subtotal\s*R\$\s110,00/);
    expect(summary).toHaveTextContent(/Descontos dos produtos\s*− R\$\s8,00/);
    expect(summary).toHaveTextContent(/Desconto geral\s*− R\$\s10,00/);
    expect(within(panel).getByText("Total").textContent).toMatch(/92,00/);

    fireEvent.click(
      within(panel).getByRole("button", { name: "Registrar venda" }),
    );
    expect(
      await screen.findByText(/Venda de R\$\s92,00 registrada para Bianca\./),
    ).toBeInTheDocument();
    const inventory = await repository.getInventoryWorkspace(clinicId);
    const sale = inventory.tabs.find((tab) => tab.patientId === patient.id)!;
    expect(sale.totalInCents).toBe(9_200);
    expect(sale.notes).toBe("Venda com R$\u00a018,00 de desconto.");
    // O formulário volta sem descontos para a próxima venda.
    await waitFor(() =>
      expect(
        within(panel).getByText("Sem desconto geral."),
      ).toBeInTheDocument(),
    );
  });

  it("mostra as parcelas da venda e quanto de cada produto entra em cada uma", async () => {
    const { patient, cream, oil } = await seed();
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
    await choosePatient(patient.fullName, panel);
    fireEvent.change(within(panel).getByLabelText("Produto 1"), {
      target: { value: cream.id },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Adicionar produto" }),
    );
    fireEvent.change(within(panel).getByLabelText("Produto 2"), {
      target: { value: oil.id },
    });
    fireEvent.change(within(panel).getByLabelText("Forma de pagamento"), {
      target: { value: "card" },
    });
    fireEvent.change(
      await within(panel).findByLabelText("Parcelamento (Cartão)"),
      { target: { value: "2" } },
    );
    const preview = within(panel).getByText("Ver parcelas").closest("details")!;
    expect(within(preview).getByText("2 × R$ 35,00")).toBeInTheDocument();
    const rows = within(
      within(preview).getByRole("list", { name: "Parcelas previstas" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Parcela 1/2");
    expect(rows[0]).toHaveTextContent("pago na venda · Cartão");
    expect(rows[0]).toHaveTextContent(
      /Creme relaxante · 1 un \(R\$\s40,00\) ÷ 2\s*R\$\s20,00/,
    );
    expect(rows[0]).toHaveTextContent(
      /Óleo de massagem · 1 un \(R\$\s30,00\) ÷ 2\s*R\$\s15,00/,
    );

    // A receber: uma cobrança só, no vencimento escolhido.
    fireEvent.change(within(panel).getByLabelText("Pagamento"), {
      target: { value: "receivable" },
    });
    fireEvent.change(within(panel).getByLabelText("Vencimento"), {
      target: { value: "2099-01-10" },
    });
    expect(
      within(preview).getByText("1 cobrança de R$ 70,00"),
    ).toBeInTheDocument();
    expect(
      within(
        within(preview).getByRole("list", { name: "Parcelas previstas" }),
      ).getByRole("listitem"),
    ).toHaveTextContent("vence 10/01/2099");
  });

  it("bloqueia produto sem preço e cadastra o preço por cima da venda, sem perdê-la", async () => {
    const { repository, patient, cream } = await seed();
    const ball = await repository.createProduct(clinicId, actorId, {
      name: "Bola suíça",
      sku: "BOLA",
      unit: "un",
      costInCents: 3_000,
      salePriceInCents: null,
      initialStock: 4,
    });
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
    await choosePatient(patient.fullName, panel);
    fireEvent.change(within(panel).getByLabelText("Produto 1"), {
      target: { value: cream.id },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Adicionar produto" }),
    );
    fireEvent.change(within(panel).getByLabelText("Produto 2"), {
      target: { value: ball.id },
    });
    fireEvent.change(within(panel).getByLabelText("Observações"), {
      target: { value: "Entregar na recepção" },
    });
    const submit = within(panel).getByRole("button", {
      name: "Registrar venda",
    });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(
      "Falta: preço de venda do produto.",
    );
    const alert = within(panel).getByRole("alert");
    expect(alert).toHaveTextContent(
      "Bola suíça está sem preço de venda e não pode ser vendido.",
    );

    fireEvent.click(
      within(alert).getByRole("button", { name: "Cadastrar preço" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar produto",
    });
    fireEvent.change(within(dialog).getByLabelText("Preço de venda (R$)"), {
      target: { value: "9000" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar produto" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // A venda continua com tudo o que já estava preenchido, agora com o preço novo.
    await waitFor(() =>
      expect(within(panel).queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(within(panel).getByLabelText("Produto 1")).toHaveValue(cream.id);
    expect(within(panel).getByLabelText("Produto 2")).toHaveValue(ball.id);
    expect(within(panel).getByLabelText("Preço unitário 2")).toHaveValue(
      "90,00",
    );
    expect(within(panel).getByLabelText("Observações")).toHaveValue(
      "Entregar na recepção",
    );
    expect(within(panel).getByText("Total").textContent).toMatch(/130,00/);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(
      await screen.findByText(/Venda de R\$\s130,00 registrada para Bianca\./),
    ).toBeInTheDocument();
  });

  it("lista vendas realizadas, abre os detalhes e mostra o resumo do período", async () => {
    const { repository, patient, cream, oil } = await seed();
    await sell(repository, patient.id, cream.id, 2);
    await sell(repository, patient.id, oil.id, 1);
    // Comanda aberta (dado antigo) não entra no histórico de vendas.
    const openTab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient.id,
    });
    await repository.addPatientTabItem(clinicId, actorId, openTab.id, {
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
    expect(
      within(within(history).getByRole("table")).getAllByText("A receber"),
    ).toHaveLength(2);
    fireEvent.change(within(history).getByLabelText("Cliente"), {
      target: { value: "outra pessoa" },
    });
    expect(
      within(history).getByText("Nenhuma venda no período"),
    ).toBeInTheDocument();

    fireEvent.change(within(history).getByLabelText("Cliente"), {
      target: { value: "" },
    });
    fireEvent.click(
      within(history).getAllByRole("button", {
        name: `Ver venda de ${patient.fullName}`,
      })[0]!,
    );
    const details = await screen.findByRole("dialog", {
      name: `Venda · ${patient.fullName}`,
    });
    // As duas vendas podem ter o mesmo horário: a ordem entre elas não é garantida.
    expect(
      within(details).getAllByText(/^(Óleo de massagem|Creme relaxante)$/),
    ).toHaveLength(1);
    fireEvent.click(within(details).getByRole("button", { name: "Fechar" }));

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

  it("filtra as vendas realizadas por vendedor, produto, tamanho, situação e valor", async () => {
    const { repository, patient, cream, oil } = await seed();
    const seller = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Carla Vendedora",
        email: "carla.vendas@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: ["patients.view", "patients.inventory_view"],
      },
      "hash-de-teste",
    );
    const shirt = await repository.createProduct(clinicId, actorId, {
      name: "Camiseta",
      sku: "CAM",
      unit: "un",
      costInCents: 2_000,
      salePriceInCents: 5_000,
      initialStock: 0,
      sizes: ["p", "m", "g"],
      initialSizeStock: [
        { size: "p", quantity: 3 },
        { size: "m", quantity: 3 },
      ],
    });
    await sell(repository, patient.id, cream.id, 2); // R$ 80, Aryana, a receber
    await repository.createProductSale(clinicId, seller.id, {
      patientId: patient.id,
      items: [{ productId: oil.id, quantity: 1 }],
      settlement: "paid",
      paymentMethod: "pix",
      dueDate: "2099-01-10",
    }); // R$ 30, Carla, paga
    await repository.createProductSale(clinicId, seller.id, {
      patientId: patient.id,
      items: [{ productId: shirt.id, size: "m", quantity: 1 }],
      settlement: "receivable",
      dueDate: "2099-01-10",
    }); // R$ 50, Carla, a receber
    await repository.createProductSale(clinicId, actorId, {
      patientId: patient.id,
      items: [{ productId: shirt.id, size: "p", quantity: 2 }],
      settlement: "receivable",
      dueDate: "2099-01-10",
    }); // R$ 100, Aryana, a receber
    open("/vendas?aba=vendas");

    const history = await screen.findByRole("region", {
      name: "Vendas realizadas",
    });
    const rows = () => within(history).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(4);
    expect(
      within(within(history).getByRole("table")).getAllByText(
        "Carla Vendedora",
      ),
    ).toHaveLength(2);

    const sellerFilter = within(history).getByLabelText("Vendedor");
    fireEvent.change(sellerFilter, { target: { value: seller.id } });
    expect(rows()).toHaveLength(2);
    expect(within(history).getByText(/2 vendas de 4 no período/));

    fireEvent.change(within(history).getByLabelText("Situação"), {
      target: { value: "paid" },
    });
    expect(rows()).toHaveLength(1);
    expect(
      within(history).getByText("1× Óleo de massagem"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(history).getByRole("button", { name: "Limpar filtros" }),
    );
    expect(rows()).toHaveLength(4);
    expect(
      within(history).queryByRole("button", { name: "Limpar filtros" }),
    ).toBeNull();

    // Tamanho só aparece com um produto que tem tamanhos, e lista os tamanhos dele.
    expect(within(history).queryByLabelText("Tamanho")).toBeNull();
    const productFilter = within(history).getByLabelText("Produto");
    fireEvent.change(productFilter, { target: { value: cream.id } });
    expect(rows()).toHaveLength(1);
    expect(within(history).queryByLabelText("Tamanho")).toBeNull();
    fireEvent.change(productFilter, { target: { value: shirt.id } });
    expect(rows()).toHaveLength(2);
    const size = within(history).getByLabelText("Tamanho");
    expect(
      within(size)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todos", "P", "M", "G"]);
    fireEvent.change(size, { target: { value: "p" } });
    expect(rows()).toHaveLength(1);
    expect(within(history).getByText("2× Camiseta · P")).toBeInTheDocument();
    fireEvent.change(size, { target: { value: "g" } });
    expect(
      within(history).getByText("Nenhuma venda com esses filtros"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(history).getByRole("button", { name: "Limpar filtros" }),
    );
    fireEvent.change(within(history).getByLabelText("Valor mínimo (R$)"), {
      target: { value: "5000" },
    });
    expect(rows()).toHaveLength(3);
    fireEvent.change(within(history).getByLabelText("Valor máximo (R$)"), {
      target: { value: "8000" },
    });
    expect(rows()).toHaveLength(2);
    fireEvent.change(within(history).getByLabelText("Valor mínimo (R$)"), {
      target: { value: "9000" },
    });
    expect(within(history).getByRole("alert")).toHaveTextContent(
      "O valor mínimo é maior que o máximo.",
    );
  });

  it("vende produto com tamanho e baixa o estoque do tamanho escolhido", async () => {
    const { repository, patient } = await seed();
    const shirt = await repository.createProduct(clinicId, actorId, {
      name: "Camiseta",
      sku: "CAM",
      unit: "un",
      costInCents: 2_000,
      salePriceInCents: 5_000,
      initialStock: 0,
      sizes: ["p", "m", "g"],
      initialSizeStock: [
        { size: "p", quantity: 3 },
        { size: "m", quantity: 2 },
      ],
    });
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
    const submit = within(panel).getByRole("button", {
      name: "Registrar venda",
    });
    await choosePatient(patient.fullName, panel);
    expect(within(panel).queryByLabelText("Tamanho 1")).toBeNull();
    fireEvent.change(within(panel).getByLabelText("Produto 1"), {
      target: { value: shirt.id },
    });
    expect(submit).toHaveAccessibleDescription("Falta: tamanho.");
    const size = within(panel).getByLabelText("Tamanho 1");
    expect(
      within(size).getByRole("option", { name: "G · sem estoque" }),
    ).toBeDisabled();
    fireEvent.change(size, { target: { value: "m" } });
    fireEvent.change(within(panel).getByLabelText("Quantidade 1"), {
      target: { value: "3" },
    });
    expect(submit).toHaveAccessibleDescription(
      "Falta: quantidade dentro do estoque.",
    );
    fireEvent.change(within(panel).getByLabelText("Quantidade 1"), {
      target: { value: "2" },
    });
    // O mesmo produto pode entrar de novo em outro tamanho.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Adicionar produto" }),
    );
    fireEvent.change(within(panel).getByLabelText("Produto 2"), {
      target: { value: shirt.id },
    });
    expect(
      within(within(panel).getByLabelText("Tamanho 2")).getByRole("option", {
        name: "M · 2 un",
      }),
    ).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText("Tamanho 2"), {
      target: { value: "p" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(
      await screen.findByText(/Venda de R\$\s150,00 registrada para Bianca\./),
    ).toBeInTheDocument();
    const inventory = await repository.getInventoryWorkspace(clinicId);
    const sale = inventory.tabs.find((tab) => tab.patientId === patient.id)!;
    expect(sale.items.map((item) => [item.size, item.quantity]).sort()).toEqual(
      [
        ["m", 2],
        ["p", 1],
      ],
    );
    expect(
      inventory.products.find((item) => item.id === shirt.id)?.sizeStock,
    ).toEqual([
      { size: "p", currentStock: 2 },
      { size: "m", currentStock: 0 },
      { size: "g", currentStock: 0 },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Vendas realizadas" }));
    const history = await screen.findByRole("region", {
      name: "Vendas realizadas",
    });
    expect(within(history).getByText(/2× Camiseta · M/)).toBeInTheDocument();
  });

  it("mostra os itens mais vendidos por tipo de item e por tamanho", async () => {
    const { repository, patient } = await seed();
    const category = async (name: string) =>
      (await repository.saveClinicCatalog(
        clinicId,
        actorId,
        "product_category",
        { name, active: true },
      ))!;
    const clothes = await category("Roupas");
    const care = await category("Cuidados");
    const product = (
      name: string,
      categoryId: string,
      salePriceInCents: number,
      sizes: ("p" | "m")[],
    ) =>
      repository.createProduct(clinicId, actorId, {
        name,
        sku: name.toUpperCase(),
        unit: "un",
        costInCents: 1_000,
        salePriceInCents,
        initialStock: sizes.length ? 0 : 10,
        categoryId,
        sizes,
        initialSizeStock: sizes.map((size) => ({ size, quantity: 10 })),
      });
    const shirt = await product("Camiseta", clothes.id, 5_000, ["p", "m"]);
    const legging = await product("Legging", clothes.id, 9_000, ["m"]);
    const balm = await product("Bálsamo", care.id, 3_000, []);
    await repository.createProductSale(clinicId, actorId, {
      patientId: patient.id,
      items: [
        { productId: shirt.id, size: "p", quantity: 3 },
        { productId: shirt.id, size: "m", quantity: 2 },
        { productId: legging.id, size: "m", quantity: 2 },
        { productId: balm.id, quantity: 1 },
      ],
      settlement: "receivable",
      dueDate: "2099-01-10",
    });
    open("/vendas?aba=resumo");
    const ranking = await screen.findByRole("region", {
      name: "Mais vendidos por tipo e tamanho",
    });
    const rows = async () =>
      (await within(ranking).findAllByRole("row")).slice(1).map((row) =>
        within(row)
          .getAllByRole("cell")
          .concat(within(row).queryAllByRole("rowheader"))
          .map((cell) => cell.textContent)
          .filter((text) => !/R\$/.test(text ?? "")),
      );
    expect(await rows()).toEqual([
      ["1", "Roupas", "P", "3", "Camiseta"],
      ["2", "Roupas", "M", "2", "Legging"],
      ["3", "Roupas", "M", "2", "Camiseta"],
      ["4", "Cuidados", "Sem tamanho", "1", "Bálsamo"],
    ]);

    fireEvent.change(within(ranking).getByLabelText("Tamanho"), {
      target: { value: "m" },
    });
    expect((await rows()).map((row) => row[4])).toEqual([
      "Legging",
      "Camiseta",
    ]);
    fireEvent.change(within(ranking).getByLabelText("Tamanho"), {
      target: { value: "" },
    });

    fireEvent.change(within(ranking).getByLabelText("Ver por"), {
      target: { value: "type" },
    });
    expect(await rows()).toEqual([
      ["1", "7", "Roupas"],
      ["2", "1", "Cuidados"],
    ]);
    fireEvent.change(within(ranking).getByLabelText("Ver por"), {
      target: { value: "size" },
    });
    expect(await rows()).toEqual([
      ["1", "4", "M"],
      ["2", "3", "P"],
      ["3", "1", "Sem tamanho"],
    ]);
    fireEvent.change(within(ranking).getByLabelText("Tipo de item"), {
      target: { value: care.id },
    });
    expect(await rows()).toEqual([["1", "1", "Sem tamanho"]]);
  });

  it("não oferece produto sem estoque e conta o que está reservado", async () => {
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
  });

  it("cancela uma venda pelo histórico e devolve o estoque", async () => {
    const { repository, patient, cream } = await seed();
    await sell(repository, patient.id, cream.id, 2);
    open("/vendas?aba=vendas");
    const history = await screen.findByRole("region", {
      name: "Vendas realizadas",
    });
    fireEvent.click(
      within(history).getByRole("button", {
        name: `Ver venda de ${patient.fullName}`,
      }),
    );
    const details = await screen.findByRole("dialog", {
      name: `Venda · ${patient.fullName}`,
    });
    fireEvent.click(
      within(details).getByRole("button", { name: "Cancelar venda" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Cancelar venda",
    });
    const submit = within(confirm).getByRole("button", {
      name: "Cancelar venda",
    });
    expect(submit).toBeDisabled();
    expect(
      within(confirm).getByText(/Falta: Motivo do cancelamento/),
    ).toBeInTheDocument();
    fireEvent.change(within(confirm).getByLabelText("Motivo do cancelamento"), {
      target: { value: "  Cliente desistiu da compra " },
    });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest("form")!);
    await within(details).findByText("Venda cancelada; estoque restituído.");
    expect(
      within(details).queryByRole("button", { name: "Cancelar venda" }),
    ).not.toBeInTheDocument();
    const workspace = await repository.getInventoryWorkspace(clinicId);
    expect(
      workspace.products.find((item) => item.id === cream.id)?.currentStock,
    ).toBe(5);
    expect(workspace.tabs[0]).toMatchObject({
      status: "cancelled",
      cancellationReason: "Cliente desistiu da compra",
    });
  });

  it("mostra o pagamento e estorna ao cancelar uma venda paga", async () => {
    const { repository, patient, cream } = await seed();
    await repository.createProductSale(clinicId, actorId, {
      patientId: patient.id,
      items: [{ productId: cream.id, quantity: 2 }],
      settlement: "paid",
      paymentMethod: "card",
      paymentInstallments: 3,
      dueDate: "2099-01-10",
    });
    open("/vendas?aba=vendas");
    const history = await screen.findByRole("region", {
      name: "Vendas realizadas",
    });
    fireEvent.click(
      within(history).getByRole("button", {
        name: `Ver venda de ${patient.fullName}`,
      }),
    );
    const details = await screen.findByRole("dialog", {
      name: `Venda · ${patient.fullName}`,
    });
    const payment = await within(details).findByRole("region", {
      name: "Pagamento",
    });
    expect(within(payment).getByText("Pago")).toBeInTheDocument();
    expect(within(payment).getByText("Cartão em 3x")).toBeInTheDocument();
    fireEvent.click(
      within(details).getByRole("button", { name: "Cancelar venda" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Cancelar venda",
    });
    const submit = within(confirm).getByRole("button", {
      name: "Estornar e cancelar",
    });
    expect(submit).toBeDisabled();
    fireEvent.change(within(confirm).getByLabelText("Motivo do cancelamento"), {
      target: { value: "Produto com defeito" },
    });
    expect(submit).toBeDisabled();
    fireEvent.click(
      within(confirm).getByRole("checkbox", {
        name: /Estornar o pagamento de/,
      }),
    );
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest("form")!);
    await within(details).findByText(
      "Venda cancelada; pagamento estornado e estoque restituído.",
    );
    // Depois de cancelar: motivo, vendedor e a forma original do pagamento.
    expect(
      within(details).getByText("Motivo do cancelamento: Produto com defeito"),
    ).toBeInTheDocument();
    expect(within(details).getByText(/^Vendedor: /)).toBeInTheDocument();
    const cancelledPayment = await within(details).findByRole("region", {
      name: "Pagamento",
    });
    await within(cancelledPayment).findByText("Cancelado");
    expect(
      within(cancelledPayment).getByText("Cartão em 3x"),
    ).toBeInTheDocument();
    const [tab] = (await repository.getInventoryWorkspace(clinicId)).tabs;
    expect(tab).toMatchObject({
      status: "cancelled",
      cancellationReason: "Produto com defeito",
    });
    expect(
      (await repository.getFinancialSummary(clinicId)).receivables.find(
        (item) => item.id === tab!.receivableId,
      )?.status,
    ).toBe("cancelled");
  });

  it("bloqueia o cancelamento da venda paga sem a permissão de estorno", async () => {
    const { repository, app, patient, cream } = await seed();
    await repository.createProductSale(clinicId, actorId, {
      patientId: patient.id,
      items: [{ productId: cream.id, quantity: 1 }],
      settlement: "paid",
      paymentMethod: "pix",
      dueDate: "2099-01-10",
    });
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Cancela vendas",
        email: "cancela.vendas@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: [
          "patients.view",
          "patients.inventory_view",
          "patients.tabs_cancel",
        ],
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
    open("/vendas?aba=vendas");
    const history = await screen.findByRole("region", {
      name: "Vendas realizadas",
    });
    fireEvent.click(
      within(history).getByRole("button", {
        name: `Ver venda de ${patient.fullName}`,
      }),
    );
    const details = await screen.findByRole("dialog", {
      name: `Venda · ${patient.fullName}`,
    });
    await within(details).findByRole("region", { name: "Pagamento" });
    fireEvent.click(
      within(details).getByRole("button", { name: "Cancelar venda" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Cancelar venda",
    });
    expect(within(confirm).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(confirm).getByRole("button", { name: "Cancelar venda" }),
    ).toBeDisabled();
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
  it("mostra a aba Fornecedores só a quem tem a permissão de fornecedores", async () => {
    const { repository, app } = await setupApi();
    async function signIn(email: string, permissions: PermissionKey[]) {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: "Equipe de vendas",
          email,
          role: "user",
          password: "SenhaForte123",
          permissions,
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
    }
    await signIn("sem.fornecedores@example.com", [
      "patients.view",
      "patients.inventory_view",
    ]);
    const first = open("/vendas?aba=fornecedores");
    expect(
      await screen.findByRole("region", { name: "Vendas realizadas" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fornecedores" }),
    ).not.toBeInTheDocument();
    first.unmount();
    await signIn("fornecedores@example.com", [
      "patients.view",
      "patients.inventory_view",
      "patients.suppliers_manage",
    ]);
    open("/vendas");
    fireEvent.click(
      await screen.findByRole("button", { name: "Fornecedores" }),
    );
    const panel = await screen.findByRole("region", { name: "Fornecedores" });
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Novo fornecedor" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo fornecedor" });
    // Pedidos usam as rotas do Financeiro: sem essa permissão, a aba não aparece.
    expect(
      within(dialog).getByRole("tab", { name: "Dados" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("tab", { name: "Pedidos" }),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "Cosméticos Aryana" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar fornecedor" }),
    );
    await waitFor(async () =>
      expect(
        (await repository.listSuppliers(clinicId)).map((item) => item.name),
      ).toEqual(["Cosméticos Aryana"]),
    );
  });
});
