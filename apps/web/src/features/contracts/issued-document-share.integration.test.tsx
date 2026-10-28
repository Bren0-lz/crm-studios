import { installDocumentBrowserMocks } from "../../test-support/document-editor";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { documentSignatureMessage, whatsappLink } from "@crm/contracts";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("issued document sharing", () => {
  it("offers the WhatsApp signing link and Save PDF only on issued documents", async () => {
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
    const base = {
      clinicId: "11111111-1111-4111-8111-111111111111",
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Viviane Araújo",
      templateName: "Contrato padrão",
      templateVersion: 1,
      snapshotBody: "Contrato de Viviane Araújo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const documents = [
      { ...base, id: "d1", title: "Contrato Pilates", status: "issued" },
      { ...base, id: "d2", title: "Declaração de março", status: "draft" },
    ];
    const token = "a".repeat(43);
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const body = url.endsWith("/documents/d1/signature-link")
        ? {
            document: documents[0],
            token,
            patientPhone: "11999991234",
            clinicName: "Studios Aryana",
          }
        : /\/documents(\?|$)/.test(url)
          ? documents
          : [];
      if (url.endsWith("/signature-link")) expect(init?.method).toBe("POST");
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    installDocumentBrowserMocks();
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    const issued = (await screen.findByText("Contrato Pilates")).closest(
      "article",
    ) as HTMLElement;
    const draft = screen
      .getByText("Declaração de março")
      .closest("article") as HTMLElement;
    fireEvent.click(within(issued).getByRole("button", { name: /WhatsApp/ }));
    const sharing = screen.getByRole("dialog", {
      name: "Enviar para assinatura",
    });
    const whatsapp = await within(sharing).findByRole("link", {
      name: /Abrir WhatsApp/,
    });
    expect(whatsapp).toHaveAttribute(
      "href",
      whatsappLink(
        "11999991234",
        documentSignatureMessage({
          patientName: "Viviane Araújo",
          clinicName: "Studios Aryana",
          link: `${window.location.origin}/assinar-contrato/${token}`,
        }),
      ),
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    fireEvent.click(within(sharing).getByRole("button", { name: "Fechar" }));
    expect(
      within(draft).queryByRole("button", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
    expect(
      within(draft).queryByRole("button", { name: /Salvar PDF/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(issued).getByRole("button", { name: /Salvar PDF/ }));
    const dialog = screen.getByRole("dialog", { name: "Contrato Pilates" });
    const link = await within(dialog).findByRole("link", {
      name: "Salvar PDF",
    });
    expect(link).toHaveAttribute("download", "Contrato Pilates.pdf");
    expect(link).toHaveAttribute("href", "blob:test-contract");
    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });
});

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nTest contract"], { type: "application/pdf" }),
}));
