import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { supplierInputSchema } from "@crm/contracts";
import { api } from "../../api";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";
import { change, open } from "../../test-support/workflow-ui";

vi.mock("../contracts/document-pdf", () => ({
  generateDocumentPdf: vi.fn(
    async () => new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
  ),
}));

async function suppliersPanel() {
  // Desde o #228 os fornecedores ficam em Vendas de produtos › Fornecedores.
  open("/vendas?aba=fornecedores");
  return screen.findByRole("region", { name: "Fornecedores" });
}

async function newSupplierDialog() {
  const panel = await suppliersPanel();
  fireEvent.click(
    await within(panel).findByRole("button", { name: "Novo fornecedor" }),
  );
  return screen.getByRole("dialog", { name: "Novo fornecedor" });
}

function openTab(dialog: HTMLElement, name: string) {
  fireEvent.click(within(dialog).getByRole("tab", { name }));
  return within(dialog).getByRole("tabpanel", { name });
}

async function withProduct() {
  const context = await setupApi();
  const band = await context.repository.createProduct(clinicId, actorId, {
    name: "Faixa elástica",
    sku: "FAIXA",
    unit: "un",
    costInCents: 1_000,
    salePriceInCents: 2_500,
    initialStock: 1,
  });
  return { ...context, band };
}

async function fillFirstOrder(dialog: HTMLElement, productId: string) {
  const orders = openTab(dialog, "Pedidos");
  fireEvent.click(
    within(orders).getByRole("button", { name: "Incluir primeiro pedido" }),
  );
  await within(orders).findByRole("option", { name: "Faixa elástica" });
  change("Valor do pedido (R$)", "3000", orders);
  change("Produto 1", productId, orders);
  change("Quantidade 1", "3", orders);
  return orders;
}

describe("supplier registration in a single flow", () => {
  it("registers the supplier together with its first order and puts the items in stock", async () => {
    const { repository, band } = await withProduct();
    const dialog = await newSupplierDialog();
    change("Nome", "Distribuidora Bem-Estar", dialog);
    await fillFirstOrder(dialog, band.id);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar fornecedor" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo fornecedor" }),
      ).not.toBeInTheDocument(),
    );
    const [supplier] = await repository.listSuppliers(clinicId);
    expect(supplier).toMatchObject({ name: "Distribuidora Bem-Estar" });
    expect(
      await repository.listSupplierOrders(clinicId, supplier!.id),
    ).toMatchObject([{ totalInCents: 3_000 }]);
    const products = (await repository.getInventoryWorkspace(clinicId))
      .products;
    expect(products.find((item) => item.id === band.id)?.currentStock).toBe(4);
  });

  it("asks for the supplier name before saving, even from another tab", async () => {
    const { repository, band } = await withProduct();
    const dialog = await newSupplierDialog();
    await fillFirstOrder(dialog, band.id);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar fornecedor" }),
    );
    expect(
      await within(dialog).findByText(/Informe o nome do fornecedor/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Dados" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await repository.listSuppliers(clinicId)).toEqual([]);
  });

  it("keeps the modal open in edit mode with the order draft when only the order fails", async () => {
    const { repository, band } = await withProduct();
    const create = vi
      .spyOn(api, "createSupplierOrder")
      .mockRejectedValueOnce(new Error("Sem conexão."));
    const dialog = await newSupplierDialog();
    change("Nome", "Distribuidora Bem-Estar", dialog);
    await fillFirstOrder(dialog, band.id);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar fornecedor" }),
    );
    expect(
      await within(dialog).findByText(
        /O fornecedor foi salvo, mas o pedido não foi registrado. Sem conexão./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Editar fornecedor" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Produto 1")).toHaveDisplayValue(
      "Faixa elástica",
    );
    expect(await repository.listSuppliers(clinicId)).toHaveLength(1);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar pedido" }),
    );
    const orders = within(dialog).getByRole("tabpanel", { name: "Pedidos" });
    expect(await within(orders).findByText("3× Faixa elástica")).toBeVisible();
    expect(create).toHaveBeenCalledTimes(2);
    // Um fornecedor só: a nova tentativa não regravou o cadastro.
    expect(await repository.listSuppliers(clinicId)).toHaveLength(1);
  });
});

describe("supplier documents by WhatsApp", () => {
  it("compares the chosen template with the data filled in and points to what is missing", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato de manutenção",
      kind: "contract",
      body: "Contrato com {{fornecedor_nome}}, valor {{fornecedor_valor}}, desde {{fornecedor_contratacao}}. Plano {{plano_nome}}.",
    });
    const dialog = await newSupplierDialog();
    change("Nome", "Manutenção Total", dialog);
    const documents = openTab(dialog, "Documentos");
    const field = within(documents).getByLabelText(
      "Documento para o fornecedor assinar",
    );
    await within(field).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Documento para o fornecedor assinar", template.id, documents);

    const check = within(documents).getByRole("status", {
      name: "Conferência do modelo",
    });
    expect(
      within(check).getByText("Falta no cadastro para este modelo:"),
    ).toBeVisible();
    const items = within(check)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "Valor contratadoPreencher",
      "Data de contrataçãoPreencher",
    ]);
    expect(within(check).getByText(/Plano\. Eles saem como/)).toBeVisible();

    fireEvent.click(
      within(check).getAllByRole("button", { name: "Preencher" })[0]!,
    );
    expect(within(dialog).getByRole("tab", { name: "Dados" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const amount = within(dialog).getByLabelText("Valor contratado (R$)");
    expect(amount).toHaveFocus();
    change("Valor contratado (R$)", "2400,00", dialog);
    change("Data de contratação", "2026-10-01", dialog);

    openTab(dialog, "Documentos");
    expect(
      within(documents).queryByText("Falta no cadastro para este modelo:"),
    ).not.toBeInTheDocument();
  });

  it("sends a chosen document to a registered supplier's WhatsApp and resends it later", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const supplier = (await repository.saveSupplier(
      clinicId,
      actorId,
      supplierInputSchema.parse({
        name: "Limpeza Brilho",
        kind: "company",
        whatsapp: "19988887777",
      }),
    ))!;
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato de limpeza",
      kind: "contract",
      body: "Contrato de limpeza com {{fornecedor_nome}}.",
    });
    const panel = await suppliersPanel();
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Editar" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar fornecedor" });
    const documents = openTab(dialog, "Documentos");
    await within(documents).findByText(
      "Nenhum documento enviado para assinatura.",
    );
    const field = within(documents).getByLabelText(
      "Documento para o fornecedor assinar",
    );
    await within(field).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Documento para o fornecedor assinar", template.id, documents);
    expect(
      within(documents).getByText(
        "Os dados do fornecedor que o modelo usa estão preenchidos.",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(documents).getByRole("button", { name: "Enviar pelo WhatsApp" }),
    );
    const whatsapp = await within(dialog).findByRole("link", {
      name: "Abrir WhatsApp",
    });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/5519988887777");
    const [document] = await repository.listIssuedDocuments(clinicId);
    expect(document).toMatchObject({
      status: "issued",
      supplierId: supplier.id,
      templateId: template.id,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Editar fornecedor" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "Editar" }));
    const again = screen.getByRole("dialog", { name: "Editar fornecedor" });
    const list = openTab(again, "Documentos");
    fireEvent.click(
      await within(list).findByRole("button", {
        name: "Reenviar Contrato de limpeza pelo WhatsApp",
      }),
    );
    const resend = screen.getByRole("dialog", {
      name: "Enviar para assinatura",
    });
    expect(
      (
        await within(resend).findByRole("link", { name: "Abrir WhatsApp" })
      ).getAttribute("href"),
    ).toContain("wa.me/5519988887777");
  });

  it("sends a supplier document from the Contracts page", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const supplier = (await repository.saveSupplier(
      clinicId,
      actorId,
      supplierInputSchema.parse({
        name: "Equipamentos Pilates",
        kind: "company",
        whatsapp: "19977776666",
      }),
    ))!;
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato de fornecimento",
      kind: "contract",
      body: "Contrato com {{fornecedor_nome}}, valor {{fornecedor_valor}}.",
    });
    open("/contratos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar pelo WhatsApp" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Enviar para assinatura",
    });
    change("Quem assina", "supplier", dialog);
    await within(dialog).findByRole("option", { name: supplier.name });
    change("Fornecedor", supplier.id, dialog);
    change("Modelo do contrato", template.id, dialog);
    expect(
      await within(dialog).findByText(
        /Sem dado no cadastro: Valor contratado com o fornecedor/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Plano vinculado"),
    ).not.toBeInTheDocument();
    const send = within(dialog).getByRole("button", {
      name: "Emitir e gerar link",
    });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    const whatsapp = await within(dialog).findByRole("link", {
      name: /Abrir WhatsApp/,
    });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/5519977776666");
    expect(await repository.listIssuedDocuments(clinicId)).toMatchObject([
      { supplierId: supplier.id, templateId: template.id, status: "issued" },
    ]);
  });
});
