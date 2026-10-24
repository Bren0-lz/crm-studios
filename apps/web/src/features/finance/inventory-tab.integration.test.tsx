import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, expand, open, save } from "../../test-support/workflow-ui";

async function openInventoryTab() {
  open("/financeiro");
  fireEvent.click(await screen.findByRole("button", { name: "Estoque" }));
  return screen.getByRole("region", { name: "Estoque" });
}

describe("aba Estoque do Financeiro (QM9)", () => {
  it("lista, cadastra, ajusta e edita produtos no Financeiro", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 5,
      minimumStock: 1,
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
    change("Custo (R$)", "10", dialog);
    change("Preço de venda (R$)", "20", dialog);
    change("Estoque inicial", "10", dialog);
    change("Estoque mínimo", "2", dialog);
    change("Categoria", category!.id, dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "FAIXA")!;
    expect(product).toMatchObject({
      salePriceInCents: 2000,
      currentStock: 10,
      categoryId: category!.id,
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
    await within(panel).findByText(/^12 un/);
    const history = expand("Histórico de estoque");
    expect(
      within(history).getByText(/Faixa terapêutica · \+2 · saldo 12/),
    ).toBeInTheDocument();

    const row = within(panel)
      .getByText("Faixa terapêutica", { exact: true })
      .closest<HTMLElement>(".table-row")!;
    fireEvent.click(within(row).getByRole("button", { name: "Editar" }));
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
      expect(within(panel).getByText(/inativo/)).toBeInTheDocument(),
    );
  });

  it("não mostra a aba Estoque sem permissão de consultar o estoque", async () => {
    const { repository, app } = await setupApi();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Financeiro sem estoque",
        email: "financeiro.sem.estoque@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: ["finance.view"],
      },
      "hash-de-teste",
    );
    const token = app.jwt.sign({ sub: user.id, clinicId, role: "user" });
    const me = await app.inject({
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    localStorage.setItem("crm.auth.token", token);
    localStorage.setItem("crm.auth.user", me.body);
    open("/financeiro");
    await screen.findByRole("button", { name: /Contas a receber/ });
    expect(
      screen.queryByRole("button", { name: "Estoque" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Estoque" }),
    ).not.toBeInTheDocument();
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
      minimumStock: 1,
    });
    const panel = await openInventoryTab();
    await within(panel).findByText("Óleo de massagem", { exact: true });
    fireEvent.click(
      within(panel).getByRole("link", { name: "Registrar venda" }),
    );
    const sale = await screen.findByRole("region", { name: "Nova venda" });
    expect(
      within(sale).getByRole("option", { name: "Óleo de massagem · 5 un" }),
    ).toBeInTheDocument();
  });
});
