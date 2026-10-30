import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { supplierInputSchema } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";
import { change, open } from "../../test-support/workflow-ui";

vi.mock("../contracts/document-pdf", () => ({
  generateDocumentPdf: vi.fn(
    async () => new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
  ),
}));

function suppliersPanel() {
  open("/configuracoes");
  return (async () => {
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
    const catalogs = screen.getByRole("tabpanel", { name: "Cadastros" });
    fireEvent.click(
      within(catalogs).getByRole("tab", { name: "Fornecedores" }),
    );
    return within(catalogs).getByRole("tabpanel", { name: "Fornecedores" });
  })();
}

describe("supplier contract signature", () => {
  it("saves the supplier and opens the signing link for the supplier's WhatsApp in the same modal", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato de fornecimento",
      kind: "contract",
      body: "Contrato com {{fornecedor_nome}}, valor {{fornecedor_valor}}.",
    });
    const panel = await suppliersPanel();
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Novo fornecedor" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo fornecedor" });
    change("Nome", "Equipamentos Pilates", dialog);
    change("WhatsApp", "19988887777", dialog);
    change("Valor contratado (R$)", "2400,00", dialog);
    const field = within(dialog).getByLabelText(
      "Documento para o fornecedor assinar",
    );
    await within(field).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Documento para o fornecedor assinar", template.id, dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar fornecedor" }),
    );

    const whatsapp = await within(dialog).findByRole("link", {
      name: "Abrir WhatsApp",
    });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/5519988887777");
    expect(
      (within(dialog).getByLabelText("Mensagem") as HTMLTextAreaElement).value,
    ).toContain("contrato firmado entre vocês");
    const [supplier] = await repository.listSuppliers(clinicId);
    const [document] = await repository.listIssuedDocuments(clinicId);
    expect(document).toMatchObject({
      status: "issued",
      supplierId: supplier!.id,
      templateId: template.id,
      patientName: "Equipamentos Pilates",
    });
    expect(document!.snapshotBody).toContain(
      "Contrato com Equipamentos Pilates",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo fornecedor" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the contract signed by the supplier when editing it", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const supplier = (await repository.saveSupplier(
      clinicId,
      actorId,
      supplierInputSchema.parse({ name: "Limpeza Brilho", kind: "company" }),
    ))!;
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato de limpeza",
      kind: "contract",
      body: "Contrato de limpeza com {{fornecedor_nome}}.",
    });
    const draft = await repository.createIssuedDocument(clinicId, actorId, {
      templateId: template.id,
      supplierId: supplier.id,
      title: "Contrato de limpeza",
    });
    await repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued");
    const share = await repository.createDocumentSignatureLink(
      clinicId,
      actorId,
      draft.id,
    );
    await repository.signPublicDocument(
      share!.token,
      {
        signerName: "Responsável Brilho",
        accepted: true,
        signatureImage: "data:image/png;base64,cG5n",
      },
      {},
    );
    const panel = await suppliersPanel();
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Editar" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar fornecedor" });
    expect(
      await within(dialog).findByText("Assinado pelo link"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ver contrato assinado" }),
    );
    const signed = await screen.findByRole("dialog", {
      name: "Contrato assinado",
    });
    expect(
      await within(signed).findByTitle("Prévia do PDF"),
    ).toBeInTheDocument();
  });
});
