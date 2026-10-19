import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("issued document sharing", () => {
  it("offers WhatsApp and Save PDF only on issued documents", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = /\/documents(\?|$)/.test(url) ? documents : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
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
    const whatsapp = within(issued).getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp).toHaveAttribute(
      "href",
      `https://wa.me/?text=${encodeURIComponent('Olá, Viviane! Segue o documento "Contrato Pilates" emitido pela clínica. Qualquer dúvida, é só responder esta mensagem.')}`,
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(
      within(draft).queryByRole("link", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
    expect(
      within(draft).queryByRole("button", { name: /Salvar PDF/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(issued).getByRole("button", { name: /Salvar PDF/ }));
    const dialog = screen.getByRole("dialog", { name: "Contrato Pilates" });
    expect(dialog).toHaveTextContent("escolha “Salvar como PDF”");
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    print.mockRestore();
  });
});
