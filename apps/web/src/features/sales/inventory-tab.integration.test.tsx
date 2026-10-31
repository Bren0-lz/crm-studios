import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, expand, open, save } from "../../test-support/workflow-ui";

async function openInventoryTab() {
  open("/vendas");
  fireEvent.click(await screen.findByRole("button", { name: "Estoque" }));
  return screen.getByRole("region", { name: "Estoque" });
}

describe("aba Estoque de Vendas de produtos (QM9)", () => {
  it("lista, cadastra, ajusta e edita produtos em Vendas de produtos", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 5,
    });
    const category = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "product_category",
      { name: "Terapia", active: true },
    );
    const panel = await openInventoryTab();
    expect(
      await within(panel).findByText("Óleo de massagem", { exact: true }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo produto" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo produto" });
    change("Nome", "Faixa terapêutica", dialog);
    change("Código do produto", "FAIXA", dialog);
    change("Custo (R$)", "10,00", dialog);
    change("Preço de venda (R$)", "20,00", dialog);
    change("Estoque inicial", "10", dialog);
    // O aviso de reposição é opcional e vem desligado.
    expect(
      within(dialog).getByLabelText<HTMLInputElement>(
        "Avisar quando for hora de repor",
      ).checked,
    ).toBe(false);
    expect(
      within(dialog).queryByLabelText("Avisar quando restarem"),
    ).not.toBeInTheDocument();
    // As categorias carregam junto com o modal.
    await within(dialog).findByRole("option", { name: "Terapia" });
    change("Categoria", category!.id, dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "FAIXA")!;
    expect(product).toMatchObject({
      salePriceInCents: 2000,
      currentStock: 10,
      categoryId: category!.id,
      restockAlertAt: null,
    });
    await within(panel).findByText("Faixa terapêutica", { exact: true });

    fireEvent.click(
      within(panel).getByRole("button", { name: "Ajustar estoque" }),
    );
    dialog = screen.getByRole("dialog", { name: "Ajustar estoque" });
    change("Produto", product.id, dialog);
    change("Quantidade", "2", dialog);
    change("Motivo", "Compra de reposição", dialog);
    await save("Ajustar estoque", "Salvar ajuste");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(12);
    await within(panel).findByText("12 un");
    const history = expand("Histórico de estoque");
    const movement = within(history)
      .getByText("Compra de reposição")
      .closest<HTMLElement>("tr")!;
    expect(within(movement).getByText("Faixa terapêutica")).toBeInTheDocument();
    expect(within(movement).getByText("+2")).toBeInTheDocument();
    expect(within(movement).getByText("12")).toBeInTheDocument();

    const row = within(panel)
      .getByText("Faixa terapêutica", { exact: true })
      .closest<HTMLElement>("tr")!;
    expect(within(row).getByText("Ativo")).toBeInTheDocument();
    fireEvent.click(
      within(row).getByRole("button", { name: "Editar Faixa terapêutica" }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    change("Unidade", "kit", dialog);
    fireEvent.click(within(dialog).getByLabelText("Ativo"));
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ unit: "kit", active: false, currentStock: 12 });
    await waitFor(() =>
      expect(within(row).getByText("Inativo")).toBeInTheDocument(),
    );
  });

  it("liga e desliga o aviso de reposição do produto", async () => {
    const { repository } = await setupApi();
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 4,
    });
    await repository.createProduct(clinicId, actorId, {
      name: "Faixa elástica",
      sku: "FAIXA",
      unit: "un",
      costInCents: 500,
      salePriceInCents: 1500,
      initialStock: 0,
    });
    const panel = await openInventoryTab();
    const row = (name: string) =>
      within(panel)
        .getByText(name, { exact: true })
        .closest<HTMLElement>("tr")!;
    await within(panel).findByText("Óleo de massagem", { exact: true });
    expect(
      within(row("Óleo de massagem")).getByText("Ativo"),
    ).toBeInTheDocument();
    expect(
      within(row("Faixa elástica")).getByText("Sem estoque"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Óleo de massagem" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Editar produto" });
    fireEvent.click(
      within(dialog).getByLabelText("Avisar quando for hora de repor"),
    );
    change("Avisar quando restarem", "5", dialog);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ restockAlertAt: 5, lowStock: true });
    expect(
      await within(row("Óleo de massagem")).findByText("Repor estoque"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Óleo de massagem" }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    const checkbox = within(dialog).getByLabelText<HTMLInputElement>(
      "Avisar quando for hora de repor",
    );
    expect(checkbox.checked).toBe(true);
    expect(
      within(dialog).getByLabelText<HTMLInputElement>("Avisar quando restarem")
        .value,
    ).toBe("5");
    fireEvent.click(checkbox);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ restockAlertAt: null, lowStock: false });
    expect(
      await within(row("Óleo de massagem")).findByText("Ativo"),
    ).toBeInTheDocument();
  });

  it("avisa a reposição pelo tamanho que chegou ao limite, não só pelo total", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Camiseta do estúdio",
      sku: "CAM",
      unit: "un",
      costInCents: 2000,
      salePriceInCents: 5000,
      initialStock: 0,
      sizes: ["P", "M", "G"],
      initialSizeStock: [
        { size: "P", quantity: 0 },
        { size: "M", quantity: 3 },
        { size: "G", quantity: 20 },
      ],
      restockAlertAt: 5,
    });
    const panel = await openInventoryTab();
    const row = (
      await within(panel).findByText("Camiseta do estúdio", { exact: true })
    ).closest<HTMLElement>("tr")!;
    // Total 23 está acima do aviso (5), mas P zerou e M tem 3.
    expect(within(row).getByText("Repor estoque")).toBeInTheDocument();
    expect(within(row).getByText("Esgotado: P")).toBeInTheDocument();
    expect(within(row).getByText("Repor: M")).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Camiseta do estúdio" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar produto" });
    expect(
      within(dialog).getByText(/Vale para cada tamanho/),
    ).toBeInTheDocument();
  });

  it("usa os tamanhos definidos na categoria do produto", async () => {
    const { repository } = await setupApi();
    const category = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "product_category",
      { name: "Calçados", active: true, sizes: ["37", "38", "39"] },
    );
    const panel = await openInventoryTab();
    await within(panel).findByText("Nenhum produto");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo produto" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo produto" });
    expect(
      within(dialog).queryByRole("group", { name: "Tamanhos deste produto" }),
    ).not.toBeInTheDocument();
    change("Nome", "Tênis do estúdio", dialog);
    change("Código do produto", "TEN", dialog);
    await within(dialog).findByRole("option", { name: "Calçados" });
    change("Categoria", category!.id, dialog);
    // A categoria traz todos os seus tamanhos marcados; o usuário desmarca os que faltam.
    const sizes = within(dialog).getByRole("group", {
      name: "Tamanhos deste produto",
    });
    for (const label of ["37", "38", "39"]) {
      const box = within(sizes).getByLabelText<HTMLInputElement>(label);
      expect(box.checked).toBe(true);
      fireEvent.click(box);
    }
    expect(within(sizes).queryByLabelText("PP")).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar produto" }),
    );
    expect(
      await within(dialog).findByText("Marque ao menos um tamanho."),
    ).toBeInTheDocument();
    fireEvent.click(within(sizes).getByLabelText("37"));
    fireEvent.click(within(sizes).getByLabelText("38"));
    expect(within(dialog).queryByLabelText("Estoque inicial")).toBeNull();
    change("Estoque inicial 37", "2", dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "TEN")!;
    expect(product).toMatchObject({ sizes: ["37", "38"], currentStock: 2 });
    expect(await within(panel).findByText("37: 2 · 38: 0")).toBeInTheDocument();
    expect(within(panel).getByText("Esgotado: 38")).toBeInTheDocument();

    // Ajuste de estoque pede o tamanho do produto.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Ajustar estoque" }),
    );
    dialog = screen.getByRole("dialog", { name: "Ajustar estoque" });
    change("Produto", product.id, dialog);
    expect(
      within(dialog).getByRole("option", { name: "38 · 0 un" }),
    ).toBeInTheDocument();
    change("Tamanho", "38", dialog);
    change("Quantidade", "4", dialog);
    change("Motivo", "Compra de tênis", dialog);
    await save("Ajustar estoque", "Salvar ajuste");
    expect(await within(panel).findByText("37: 2 · 38: 4")).toBeInTheDocument();
    const history = expand("Histórico de estoque");
    const movement = within(history)
      .getByText("Compra de tênis")
      .closest<HTMLElement>("tr")!;
    expect(
      within(movement).getByText("Tênis do estúdio · 38"),
    ).toBeInTheDocument();

    // Sem categoria, o produto fica sem tamanhos; o saldo antigo segue visível até ser baixado.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Tênis do estúdio" }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    await within(dialog).findByRole("option", { name: "Calçados" });
    change("Categoria", "", dialog);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ sizes: [], currentStock: 6 });
    expect(await within(panel).findByText("37: 2 · 38: 4")).toBeInTheDocument();
  });

  it("define a quantidade de cada tamanho ao editar o produto", async () => {
    const { repository } = await setupApi();
    const category = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "product_category",
      { name: "Camisetas", active: true, sizes: ["P", "M"] },
    );
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Camiseta do estúdio",
      sku: "CAM",
      unit: "un",
      categoryId: category!.id,
      costInCents: 2000,
      salePriceInCents: 5000,
      initialStock: 0,
      sizes: ["P"],
      initialSizeStock: [{ size: "P", quantity: 2 }],
    });
    const panel = await openInventoryTab();
    fireEvent.click(
      await within(panel).findByRole("button", {
        name: "Editar Camiseta do estúdio",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar produto" });
    const quantities = within(dialog).getByRole("group", {
      name: "Quantidade por tamanho",
    });
    expect(
      within(quantities).getByLabelText<HTMLInputElement>("Quantidade P").value,
    ).toBe("2");
    // Tamanho novo da categoria aparece desmarcado no produto já cadastrado.
    const sizes = await within(dialog).findByRole("group", {
      name: "Tamanhos deste produto",
    });
    const medium = await within(sizes).findByLabelText<HTMLInputElement>("M");
    expect(medium.checked).toBe(false);
    fireEvent.click(medium);
    change("Quantidade M", "3", dialog);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({
      sizes: ["P", "M"],
      currentStock: 5,
      sizeStock: [
        { size: "P", currentStock: 2 },
        { size: "M", currentStock: 3 },
      ],
    });
    expect(await within(panel).findByText("P: 2 · M: 3")).toBeInTheDocument();
  });

  it("mostra os tamanhos antigos (escala fixa) de um produto sem categoria", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Regata",
      sku: "REG",
      unit: "un",
      costInCents: 2000,
      salePriceInCents: 5000,
      initialStock: 0,
      sizes: ["p", "baby_look_m"],
      initialSizeStock: [{ size: "baby_look_m", quantity: 1 }],
    });
    const panel = await openInventoryTab();
    expect(
      await within(panel).findByText("P: 0 · Baby look M: 1"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Regata" }),
    );
    const sizes = within(
      screen.getByRole("dialog", { name: "Editar produto" }),
    ).getByRole("group", { name: "Tamanhos deste produto" });
    expect(
      within(sizes).getByLabelText<HTMLInputElement>("Baby look M").checked,
    ).toBe(true);
  });

  it("cadastra categoria e marca sem fechar o formulário do produto", async () => {
    const { repository } = await setupApi();
    const panel = await openInventoryTab();
    await within(panel).findByText("Nenhum produto");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo produto" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo produto" });
    change("Nome", "Meia antiderrapante", dialog);
    change("Categoria", "__new__", dialog);
    const category = screen.getByRole("dialog", { name: "Nova categoria" });
    change("Nome", "Meias", category);
    fireEvent.click(
      within(category).getByLabelText("Os itens desta categoria têm tamanhos"),
    );
    change("Novo tamanho", "Infantil, Adulto", category);
    fireEvent.click(
      within(category).getByRole("button", { name: "Adicionar" }),
    );
    fireEvent.click(
      within(category).getByRole("button", { name: "Cadastrar" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova categoria" }),
      ).not.toBeInTheDocument(),
    );
    // O produto continua aberto, com o que já foi preenchido e a categoria nova escolhida.
    expect(within(dialog).getByLabelText<HTMLInputElement>("Nome").value).toBe(
      "Meia antiderrapante",
    );
    expect(
      within(dialog).getByRole("option", { name: "Meias" }),
    ).toHaveProperty("selected", true);
    const sizes = within(dialog).getByRole("group", {
      name: "Tamanhos deste produto",
    });
    expect(
      within(sizes).getByLabelText<HTMLInputElement>("Infantil").checked,
    ).toBe(true);
    expect(
      within(sizes).getByLabelText<HTMLInputElement>("Adulto").checked,
    ).toBe(true);

    change("Marca", "__new__", dialog);
    const brand = screen.getByRole("dialog", { name: "Nova marca" });
    change("Nome", "Toesox", brand);
    fireEvent.click(within(brand).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole("option", { name: "Toesox" }),
      ).toHaveProperty("selected", true),
    );
    change("Código do produto", "MEIA", dialog);
    await save("Novo produto", "Salvar produto");
    const [meias] = await repository.listClinicCatalog(
      clinicId,
      "product_category",
    );
    const [toesox] = await repository.listClinicCatalog(
      clinicId,
      "product_brand",
    );
    expect(meias!.sizes).toEqual(["Infantil", "Adulto"]);
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products[0],
    ).toMatchObject({
      categoryId: meias!.id,
      brandId: toesox!.id,
      sizes: ["Infantil", "Adulto"],
    });
  });

  it("tira o Estoque do Financeiro, mesmo com permissão de consultar", async () => {
    await setupApi();
    open("/financeiro");
    await screen.findByRole("button", { name: /Contas a receber/ });
    expect(
      screen.queryByRole("button", { name: "Estoque" }),
    ).not.toBeInTheDocument();
  });

  it("abre o Estoque por link direto e cadastra categorias e marcas de produtos", async () => {
    const { repository } = await setupApi();
    open("/vendas?aba=estoque");
    await screen.findByRole("region", { name: "Estoque" });

    fireEvent.click(
      screen.getByRole("button", { name: "Categorias e marcas" }),
    );
    const catalogs = screen.getByRole("region", {
      name: "Categorias e marcas",
    });
    const categories = await within(catalogs).findByRole("region", {
      name: "Categorias de produtos",
    });
    fireEvent.click(
      within(categories).getByRole("button", {
        name: "Adicionar em Categorias de produtos",
      }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo cadastro" });
    change("Nome", "Óleos", dialog);
    await save("Novo cadastro", "Salvar");
    expect(
      await repository.listClinicCatalog(clinicId, "product_category"),
    ).toEqual([
      expect.objectContaining({ name: "Óleos", active: true, sizes: [] }),
    ]);

    // Categoria com tamanhos: lista montada pelo usuário, do jeito que os itens são medidos.
    fireEvent.click(
      within(categories).getByRole("button", {
        name: "Adicionar em Categorias de produtos",
      }),
    );
    dialog = screen.getByRole("dialog", { name: "Novo cadastro" });
    change("Nome", "Calçados", dialog);
    expect(within(dialog).queryByLabelText("Novo tamanho")).toBeNull();
    fireEvent.click(
      within(dialog).getByLabelText("Os itens desta categoria têm tamanhos"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(
      await within(dialog).findByText(
        "Adicione ao menos um tamanho ou desmarque a opção.",
      ),
    ).toBeInTheDocument();
    change("Novo tamanho", "36, 40", dialog);
    fireEvent.keyDown(within(dialog).getByLabelText("Novo tamanho"), {
      key: "Enter",
    });
    change("Novo tamanho", "38", dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    change("Novo tamanho", "40", dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(
      within(dialog).getByText("“40” já está na lista."),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(
        "Adicione ao menos um tamanho ou desmarque a opção.",
      ),
    ).toBeNull();
    // Reordena pelo teclado na alça de arrastar (o mesmo caminho do arrastar com o mouse).
    fireEvent.keyDown(
      within(dialog).getByRole("button", { name: /^Reordenar 38,/ }),
      { key: "ArrowLeft" },
    );
    expect(
      within(dialog).getByText("38 agora é o 2º de 3."),
    ).toBeInTheDocument();
    fireEvent.keyDown(
      within(dialog).getByRole("button", { name: /^Reordenar 38,/ }),
      { key: "Home" },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover 36" }));
    // Tamanho digitado sem clicar em Adicionar também entra ao salvar.
    change("Novo tamanho", "42", dialog);
    await save("Novo cadastro", "Salvar");
    expect(
      (await repository.listClinicCatalog(clinicId, "product_category")).find(
        (item) => item.name === "Calçados",
      )?.sizes,
    ).toEqual(["38", "40", "42"]);
    expect(
      await within(categories).findByText("· Tamanhos: 38, 40, 42", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      within(catalogs).getByRole("region", { name: "Marcas" }),
    ).toBeInTheDocument();
  });

  it("leva do Estoque para a nova venda, que baixa o saldo do produto", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 5,
    });
    const panel = await openInventoryTab();
    await within(panel).findByText("Óleo de massagem", { exact: true });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Registrar venda" }),
    );
    const sale = await screen.findByRole("region", { name: "Nova venda" });
    expect(
      within(sale).getByRole("option", { name: "Óleo de massagem · 5 un" }),
    ).toBeInTheDocument();
  });
});
