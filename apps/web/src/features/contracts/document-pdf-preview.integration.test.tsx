import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentPdfPreview } from "./DocumentPdfPreview";
import { generateDocumentPdf } from "./document-pdf";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";

vi.mock("./document-pdf", () => ({ generateDocumentPdf: vi.fn() }));

describe("PDF preview lifecycle", () => {
  it("discards late PDFs, uses the displayed file for download and releases its URL", async () => {
    installDocumentBrowserMocks();
    const create = vi.spyOn(URL, "createObjectURL");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    let finishFirst: ((blob: Blob) => void) | undefined;
    vi.mocked(generateDocumentPdf)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue(
        new Blob(["%PDF-current"], { type: "application/pdf" }),
      );
    const { rerender, unmount } = render(
      <DocumentPdfPreview
        title="Primeiro documento"
        body="Conteúdo anterior do contrato."
      />,
    );
    await waitFor(() => expect(generateDocumentPdf).toHaveBeenCalledTimes(1));
    rerender(
      <DocumentPdfPreview
        title="Documento atualizado"
        body="Conteúdo atualizado do contrato."
      />,
    );
    const download = await screen.findByRole("link", { name: "Salvar PDF" });
    expect(download).toHaveAttribute("download", "Documento atualizado.pdf");
    expect(screen.getByTitle("Prévia do PDF")).toHaveAttribute(
      "src",
      download.getAttribute("href"),
    );
    await act(async () => {
      finishFirst!(new Blob(["%PDF-old"]));
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Salvar PDF" })).toHaveAttribute(
      "download",
      "Documento atualizado.pdf",
    );
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:test-contract");
  });
  it("keeps the document readable after an error and retries generating the PDF", async () => {
    installDocumentBrowserMocks();
    vi.mocked(generateDocumentPdf)
      .mockReset()
      .mockRejectedValueOnce(new Error("Fonte indisponível."))
      .mockResolvedValue(new Blob(["%PDF-retry"], { type: "application/pdf" }));
    render(
      <DocumentPdfPreview
        title="Contrato"
        body="O conteúdo do contrato continua disponível."
      />,
    );
    expect(
      await screen.findByText(/Não foi possível gerar o PDF/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ler conteúdo do documento"));
    expect(
      screen.getByText("O conteúdo do contrato continua disponível."),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Tentar gerar novamente" }),
    );
    expect(
      await screen.findByRole("link", { name: "Salvar PDF" }),
    ).toHaveAttribute("download", "Contrato.pdf");
    expect(generateDocumentPdf).toHaveBeenCalledTimes(2);
  });
});
