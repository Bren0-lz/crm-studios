import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const now = new Date();
const later = new Date(now.getTime() + 7 * 86400000).toISOString();
const base = {
  clinicId: "c-1",
  templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  templateVersion: 1,
  snapshotBody: "Contrato",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const documents = [
  {
    ...base,
    id: "d-1",
    patientId: "p-1",
    patientName: "Ana Castro Dias",
    title: "Contrato de prestação de serviços",
    templateName: "Contrato de prestação de serviços",
    status: "issued",
    issuedAt: now.toISOString(),
    signatureLink: {
      token: "t-1",
      createdAt: now.toISOString(),
      createdByName: "Aryana Dutra",
      expiresAt: later,
      viewCount: 0,
    },
  },
  {
    ...base,
    id: "d-2",
    patientId: "p-2",
    patientName: "Alice Nogueira Pinto",
    title: "Contrato de prestação de serviços",
    templateName: "Contrato de prestação de serviços",
    status: "issued",
    issuedAt: now.toISOString(),
    signatureLink: {
      token: "t-2",
      createdAt: now.toISOString(),
      createdByName: "Aryana Dutra",
      expiresAt: later,
      signedAt: now.toISOString(),
      signerName: "Alice Nogueira Pinto",
      viewCount: 3,
    },
  },
  {
    ...base,
    id: "d-3",
    patientId: "p-3",
    patientName: "Lúcia Andrade",
    title: "Termo de consentimento",
    templateName: "Consentimento",
    status: "draft",
  },
];

function rows() {
  return screen
    .getAllByRole("button", { name: /Ver detalhes de/ })
    .map(
      (button) =>
        button.closest("article")!.querySelector("strong")!.textContent,
    );
}

describe("contracts list", () => {
  it("searches and filters documents and keeps the actions in Ver detalhes", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).endsWith("/documents") ? documents : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findAllByRole("button", { name: /Ver detalhes de/ });
    expect(rows()).toEqual([
      "Ana Castro Dias",
      "Alice Nogueira Pinto",
      "Lúcia Andrade",
    ]);
    // A linha mostra só o resumo: as ações ficam no modal de detalhes.
    expect(
      screen.queryByRole("button", { name: "Salvar PDF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Assinado", { selector: ".status-pill" }),
    ).toBeInTheDocument();

    // Busca sem acento e por partes do nome.
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar documentos" }),
      {
        target: { value: "lucia" },
      },
    );
    expect(rows()).toEqual(["Lúcia Andrade"]);
    expect(screen.getByText("1 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    fireEvent.change(screen.getByLabelText("Situação"), {
      target: { value: "awaiting_signature" },
    });
    expect(rows()).toEqual(["Ana Castro Dias"]);

    fireEvent.change(screen.getByLabelText("Situação"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "Consentimento" },
    });
    expect(rows()).toEqual(["Lúcia Andrade"]);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar documentos" }),
      {
        target: { value: "ana" },
      },
    );
    expect(screen.getByText("Nenhum documento encontrado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(rows()).toHaveLength(3);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ver detalhes de Contrato de prestação de serviços · Alice Nogueira Pinto",
      }),
    );
    const details = await screen.findByRole("dialog", {
      name: "Contrato de prestação de serviços",
    });
    expect(within(details).getByText(/Assinado pelo link/)).toBeInTheDocument();
    expect(
      within(details).getByRole("button", { name: "Ver contrato assinado" }),
    ).toBeInTheDocument();
    expect(
      within(details).getByRole("button", { name: /Salvar PDF/ }),
    ).toBeInTheDocument();
    expect(
      within(details).getByRole("button", { name: "Cancelar documento" }),
    ).toBeInTheDocument();
    // Assinado: não oferece reenviar o link pelo WhatsApp.
    expect(
      within(details).queryByRole("button", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
  });
});
