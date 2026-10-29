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
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
    const catalogs = screen.getByRole("tabpanel", { name: "Cadastros" });
    fireEvent.click(
      within(catalogs).getByRole("tab", { name: "Fornecedores" }),
    );
    const panel = within(catalogs).getByRole("tabpanel", {
      name: "Fornecedores",
    });
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
    change("Valor contratado (R$)", "1200", dialog);
    change("Recorrência", "monthly", dialog);
    change("Forma de pagamento", "boleto", dialog);
    change("Parcelas", "3", dialog);
    await within(dialog).findByText(/3× de R\$\s?400,00/);
    change("Condições de pagamento", "Vencimento todo dia 10", dialog);
    change("Pedidos", "Pedido 123: 20 faixas elásticas", dialog);
    change("Contratos", "Contrato 2026/01, vigência de 12 meses", dialog);
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
        orders: "Pedido 123: 20 faixas elásticas",
        contracts: "Contrato 2026/01, vigência de 12 meses",
      },
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
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
    const catalogs = screen.getByRole("tabpanel", { name: "Cadastros" });
    fireEvent.click(
      within(catalogs).getByRole("tab", { name: "Fornecedores" }),
    );
    const panel = within(catalogs).getByRole("tabpanel", {
      name: "Fornecedores",
    });
    fireEvent.click(
      await within(panel).findByRole("button", {
        name: "Pedidos de Distribuidora Bem-Estar",
      }),
    );
    const history = screen.getByRole("dialog", {
      name: "Pedidos de Distribuidora Bem-Estar",
    });
    await within(history).findByText("Nenhum pedido");
    fireEvent.click(
      within(history).getByRole("button", { name: "Novo pedido" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo pedido" });
    await within(dialog).findByRole("option", { name: "Faixa elástica" });
    change("Data do pedido", "2026-10-20", dialog);
    change("Nº do pedido", "123", dialog);
    change("Valor do pedido (R$)", "180", dialog);
    change("Produto 1", band.id, dialog);
    change("Quantidade 1", "3", dialog);
    change("Custo unitário 1", "10", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar item" }),
    );
    change("Produto 2", "new", dialog);
    change("Nome do produto 2", "Óleo de massagem", dialog);
    change("Quantidade 2", "5", dialog);
    change("Custo unitário 2", "30", dialog);
    expect(within(dialog).getByText(/Soma dos itens: R\$\s?180,00/));
    await save("Novo pedido", "Registrar pedido");

    expect(
      await within(history).findByText("5× Óleo de massagem"),
    ).toBeInTheDocument();
    expect(within(history).getByText("3× Faixa elástica")).toBeInTheDocument();
    expect(within(history).getByText("20/10/2026")).toBeInTheDocument();
    const products = (await repository.getInventoryWorkspace(clinicId))
      .products;
    expect(
      products.find((item) => item.name === "Óleo de massagem"),
    ).toMatchObject({ salePriceInCents: null, currentStock: 5 });
    expect(products.find((item) => item.id === band.id)?.currentStock).toBe(4);
    expect(
      await repository.listSupplierOrders(clinicId, supplier.id),
    ).toMatchObject([{ number: "123", totalInCents: 18_000 }]);
  });
  it("creates and renames a shared lead source", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
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
});
