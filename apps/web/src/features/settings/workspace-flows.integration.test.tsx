import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change, save } from "../../test-support/workflow-ui";

describe("settings workflows through real HTTP handlers", () => {
  it("validates, saves and removes a clinic logo while retaining the remaining settings", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    const input = await screen.findByLabelText("Logotipo");
    fireEvent.change(input, {
      target: {
        files: [new File(["texto"], "logo.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("Use PNG ou JPEG de até 2 MB.");
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      ),
      (char) => char.charCodeAt(0),
    );
    fireEvent.change(input, {
      target: { files: [new File([bytes], "logo.png", { type: "image/png" })] },
    });
    await screen.findByRole("img", { name: "Logotipo da clínica" });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );
    await waitFor(async () =>
      expect(
        (await repository.getClinicSettings(clinicId))?.logoDataUrl,
      ).toMatch(/^data:image\/png;base64,/),
    );
    await screen.findByRole("button", { name: "Salvar configurações" });
    fireEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );
    await waitFor(async () =>
      expect(await repository.getClinicSettings(clinicId)).toMatchObject({
        logoDataUrl: "",
        timezone: "America/Sao_Paulo",
      }),
    );
  });
  it("creates and deactivates a supplier without losing its contact details", async () => {
    const { repository } = await setupApi();
    open("/vendas?aba=fornecedores");
    const panel = await screen.findByRole("region", { name: "Fornecedores" });
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Novo fornecedor" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo fornecedor" });
    change("Nome", "Fornecedor de faixas", dialog);
    change("Tipo", "person", dialog);
    change("CPF", "12345678900", dialog);
    expect(within(dialog).getByLabelText("CPF")).toHaveValue("123.456.789-00");
    fireEvent.blur(within(dialog).getByLabelText("CPF"));
    await within(dialog).findByText("Informe um CPF válido.");
    change("CPF", "52998224725", dialog);
    change("Telefone", "11988887777", dialog);
    expect(within(dialog).getByLabelText("Telefone")).toHaveValue(
      "(11) 98888-7777",
    );
    change("WhatsApp", "11977776666", dialog);
    change("E-mail", "fornecedor@example.com", dialog);
    change("Data de contratação", "2026-09-01", dialog);
    change("Valor contratado (R$)", "1200,00", dialog);
    change("Recorrência", "monthly", dialog);
    change("Forma de pagamento", "boleto", dialog);
    change("Parcelas", "3", dialog);
    await within(dialog).findByText(/3× de R\$\s?400,00/);
    change("Condições de pagamento", "Vencimento todo dia 10", dialog);
    // Pedidos e contratos não são mais texto livre: ficam nas abas Pedidos e Documentos.
    expect(
      within(dialog).queryByRole("textbox", { name: "Pedidos" }),
    ).not.toBeInTheDocument();
    change("Observações", "Contato comercial", dialog);
    await save("Novo fornecedor", "Salvar fornecedor");
    fireEvent.click(within(panel).getByRole("button", { name: "Editar" }));
    dialog = screen.getByRole("dialog", { name: "Editar fornecedor" });
    fireEvent.click(within(dialog).getByLabelText("Ativo"));
    await save("Editar fornecedor", "Salvar fornecedor");
    expect(await repository.listSuppliers(clinicId)).toMatchObject([
      {
        name: "Fornecedor de faixas",
        active: false,
        email: "fornecedor@example.com",
        kind: "person",
        document: "52998224725",
        phone: "11988887777",
        whatsapp: "11977776666",
        hiredOn: "2026-09-01",
        contractAmountInCents: 120000,
        billingCycle: "monthly",
        paymentMethod: "boleto",
        installments: 3,
        paymentTerms: "Vencimento todo dia 10",
        orders: "",
        contracts: "",
      },
    ]);
  });
  it("keeps the old free-text orders and contracts read-only until someone clears them", async () => {
    const { repository } = await setupApi();
    await repository.saveSupplier(clinicId, actorId, {
      name: "Fornecedor antigo",
      kind: "company",
      document: "",
      phone: "",
      whatsapp: "",
      billingCycle: "one_time",
      installments: 1,
      paymentTerms: "",
      orders: "Pedido 99: 10 bolas",
      contracts: "Contrato em papel na pasta azul",
      notes: "",
      active: true,
    });
    open("/vendas?aba=fornecedores");
    const panel = await screen.findByRole("region", { name: "Fornecedores" });
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Editar" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar fornecedor" });
    expect(
      within(dialog).getByLabelText("Pedidos (anotação antiga)"),
    ).toHaveAttribute("readonly");
    expect(
      within(dialog).getByLabelText("Contratos (anotação antiga)"),
    ).toHaveValue("Contrato em papel na pasta azul");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Apagar anotação de pedidos",
      }),
    );
    await save("Editar fornecedor", "Salvar fornecedor");
    expect(await repository.listSuppliers(clinicId)).toMatchObject([
      { orders: "", contracts: "Contrato em papel na pasta azul" },
    ]);
  });
  it("records a supplier order whose new item becomes a product without sale price", async () => {
    const { repository } = await setupApi();
    const supplier = (await repository.saveSupplier(clinicId, actorId, {
      name: "Distribuidora Bem-Estar",
      kind: "company",
      document: "",
      phone: "",
      whatsapp: "",
      billingCycle: "one_time",
      installments: 1,
      paymentTerms: "",
      orders: "",
      contracts: "",
      notes: "",
      active: true,
    }))!;
    const band = await repository.createProduct(clinicId, actorId, {
      name: "Faixa elástica",
      sku: "FAIXA",
      unit: "un",
      costInCents: 1_000,
      salePriceInCents: 2_500,
      initialStock: 1,
    });
    open("/vendas?aba=fornecedores");
    const panel = await screen.findByRole("region", { name: "Fornecedores" });
    fireEvent.click(
      await within(panel).findByRole("button", {
        name: "Pedidos de Distribuidora Bem-Estar",
      }),
    );
    // Quem edita abre o cadastro do fornecedor direto na aba Pedidos.
    const dialog = screen.getByRole("dialog", { name: "Editar fornecedor" });
    const history = within(dialog).getByRole("tabpanel", { name: "Pedidos" });
    expect(
      within(dialog).getByRole("tab", { name: "Pedidos" }),
    ).toHaveAttribute("aria-selected", "true");
    await within(history).findByText("Nenhum pedido");
    fireEvent.click(
      within(history).getByRole("button", { name: "Novo pedido" }),
    );
    await within(dialog).findByRole("option", { name: "Faixa elástica" });
    change("Data do pedido", "2026-10-20", dialog);
    change("Nº do pedido", "123", dialog);
    change("Valor do pedido (R$)", "18000", dialog);
    change("Produto 1", band.id, dialog);
    change("Quantidade 1", "3", dialog);
    change("Custo unitário 1", "1000", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar item" }),
    );
    change("Produto 2", "new", dialog);
    // O cadastro do produto abre por cima do pedido, sem fechá-lo.
    const productDialog = screen.getByRole("dialog", { name: "Novo produto" });
    expect(dialog).toBeInTheDocument();
    expect(
      within(productDialog).queryByLabelText("Estoque inicial"),
    ).not.toBeInTheDocument();
    change("Nome", "Óleo de massagem", productDialog);
    fireEvent.click(
      within(productDialog).getByLabelText(
        "Este produto tem distinção de tamanho",
      ),
    );
    change("Novo tamanho", "100 ml, 250 ml", productDialog);
    fireEvent.click(
      within(productDialog).getByRole("button", { name: "Adicionar" }),
    );
    await save("Novo produto", "Salvar produto");
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Produto 2")).toHaveDisplayValue(
        "Óleo de massagem",
      ),
    );
    expect(
      within(dialog).queryByLabelText("Quantidade 2"),
    ).not.toBeInTheDocument();
    change("Quantidade 100 ml do item 2", "2", dialog);
    change("Quantidade 250 ml do item 2", "3", dialog);
    change("Custo unitário 2", "3000", dialog);
    expect(within(dialog).getByText(/Soma dos itens: R\$\s?180,00/));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar pedido" }),
    );

    expect(
      await within(history).findByText("2× Óleo de massagem · 100 ml"),
    ).toBeInTheDocument();
    expect(
      within(history).getByText("3× Óleo de massagem · 250 ml"),
    ).toBeInTheDocument();
    expect(within(history).getByText("3× Faixa elástica")).toBeInTheDocument();
    expect(within(history).getByText("20/10/2026")).toBeInTheDocument();
    const products = (await repository.getInventoryWorkspace(clinicId))
      .products;
    expect(
      products.find((item) => item.name === "Óleo de massagem"),
    ).toMatchObject({
      salePriceInCents: null,
      currentStock: 5,
      sizes: ["100 ml", "250 ml"],
    });
    expect(products.find((item) => item.id === band.id)?.currentStock).toBe(4);
    expect(
      await repository.listSupplierOrders(clinicId, supplier.id),
    ).toMatchObject([{ number: "123", totalInCents: 18_000 }]);
  });
  it("creates and renames a shared lead source", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
    // Só os grupos que aparecem na aba (fornecedores e produtos ficam em Vendas).
    expect(
      await screen.findByText(
        "Listas compartilhadas do comercial e do clínico.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Adicionar em Origens" }),
    );
    change("Nome", "Indicação de parceiro", screen.getByRole("dialog"));
    await save("Novo cadastro");
    const row = (
      await screen.findByText("Indicação de parceiro", { exact: true })
    ).closest(".table-row")!;
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Editar" }),
    );
    change("Nome", "Parceria local", screen.getByRole("dialog"));
    await save("Editar cadastro");
    expect(
      (await repository.listClinicCatalog(clinicId, "lead_source")).map(
        (item) => item.name,
      ),
    ).toContain("Parceria local");
    expect(
      await screen.findByText("Parceria local", { exact: true }),
    ).toBeInTheDocument();
  });

  it.each(["service", "room", "professional"] as const)(
    "edits %s and keeps historical registry entries",
    async (kind) => {
      const { repository } = await setupApi();
      open("/configuracoes");
      fireEvent.click(
        await screen.findByRole("tab", { name: "Serviços e salas" }),
      );
      const section = screen.getByRole("tabpanel", {
        name: "Serviços e salas",
      });
      fireEvent.click(
        within(section).getByRole("tab", {
          name: {
            service: "Serviços",
            room: "Salas",
            professional: "Profissionais",
          }[kind],
        }),
      );
      const edit = await within(section).findAllByRole("button", {
        name: "Editar cadastro",
      });
      fireEvent.click(edit[0]!);
      const dialog = screen.getByRole("dialog", { name: "Editar cadastro" });
      change(
        kind === "professional" ? "Nome completo" : "Nome",
        "Cadastro revisado",
        dialog,
      );
      await save("Editar cadastro", "Salvar cadastro");
      const registry = await repository.getAdministrativeRegistry(clinicId);
      const entries =
        kind === "service"
          ? registry.services
          : kind === "room"
            ? registry.rooms
            : registry.professionals;
      expect(
        entries.some(
          (item) =>
            ("fullName" in item ? item.fullName : item.name) ===
            "Cadastro revisado",
        ),
      ).toBe(true);
    },
  );
  it("cadastra e edita a linha do serviço no painel de vendas", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    fireEvent.click(
      await screen.findByRole("tab", { name: "Serviços e salas" }),
    );
    const section = screen.getByRole("tabpanel", { name: "Serviços e salas" });
    fireEvent.click(
      await within(section).findByRole("button", { name: "Novo cadastro" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cadastro" });
    expect(within(dialog).getByLabelText("Linha no painel")).toHaveValue(
      "studio",
    );
    change("Nome", "Depilação facial", dialog);
    change("Linha no painel", "aesthetics", dialog);
    await save("Novo cadastro", "Salvar cadastro");
    const created = (
      await repository.getAdministrativeRegistry(clinicId)
    ).services.find((item) => item.name === "Depilação facial");
    expect(created?.businessLine).toBe("aesthetics");

    const row = (
      await within(section).findByText("Depilação facial", { exact: true })
    ).closest(".table-row")!;
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Editar cadastro",
      }),
    );
    const edit = screen.getByRole("dialog", { name: "Editar cadastro" });
    expect(within(edit).getByLabelText("Linha no painel")).toHaveValue(
      "aesthetics",
    );
    change("Linha no painel", "studio", edit);
    await save("Editar cadastro", "Salvar cadastro");
    expect(
      (await repository.getAdministrativeRegistry(clinicId)).services.find(
        (item) => item.id === created?.id,
      )?.businessLine,
    ).toBe("studio");
  });
});
