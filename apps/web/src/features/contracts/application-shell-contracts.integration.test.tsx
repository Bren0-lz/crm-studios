import {
  setDocumentText,
  installDocumentBrowserMocks,
} from "../../test-support/document-editor";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("offers the contracts page in the menu and redirects the old documents route", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/documentos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: "Contratos" }),
    ).toHaveAttribute("href", "/contratos");
    expect(
      await screen.findByRole("heading", { name: "Contratos", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Nenhum modelo")).toBeInTheDocument();
    expect(screen.getByText("Nenhum documento")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Documentos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\{\{atendimento_data\}\}/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\{servico_nome\}\}/)).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).endsWith("/document-templates"),
        ),
    ).toBe(true);
  });

  it("issues a document with an optional professional", async () => {
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
    const template = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Contrato padrão",
      kind: "contract",
      version: 1,
      body: "Contrato",
      active: true,
      createdAt: new Date().toISOString(),
    };
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
    };
    const professional = {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      fullName: "Dra. Ana Martins",
      crefito: "CREFITO-3 123456-F",
      active: true,
    };
    const posted: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/documents/preview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            snapshotBody: "Contrato preparado para Helena Almeida.",
            snapshotContent: {
              version: 1,
              doc: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Contrato preparado para Helena Almeida.",
                      },
                    ],
                  },
                ],
              },
            },
            branding: {
              name: "Studios Aryana",
              logoDataUrl: "",
              timezone: "America/Sao_Paulo",
            },
            missingFields: [],
            templateName: template.name,
            templateVersion: 1,
            patientName: patient.fullName,
          }),
        } as Response;
      }
      if (url.endsWith("/documents") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...JSON.parse(String(init?.body)),
            id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
            status: "draft",
            patientName: patient.fullName,
            templateName: template.name,
            snapshotBody: "Contrato preparado para Helena Almeida.",
          }),
        } as Response;
      }
      const body = url.includes("/document-templates")
        ? [template]
        : url.includes("/patients")
          ? [patient]
          : url.includes("/professionals")
            ? [professional]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Criar modelo" }));
    fireEvent.click(screen.getByText("Inserir campo automático"));
    const fields = await screen.findByRole("group", { name: "Inserir campo" });
    expect(
      within(fields).getByRole("button", { name: "Profissional" }),
    ).toBeInTheDocument();
    expect(
      within(fields).getByRole("button", { name: "CREFITO do profissional" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Documentos" }));
    installDocumentBrowserMocks();
    fireEvent.click(screen.getByRole("button", { name: "Novo documento" }));
    const select = await screen.findByLabelText("Profissional (opcional)");
    expect(
      within(select).getByRole("option", {
        name: "Dra. Ana Martins · CREFITO-3 123456-F",
      }),
    ).toBeInTheDocument();
    const issue = screen.getByRole("button", { name: "Preparar conteúdo" });
    expect(issue).toBeDisabled();
    // Sem cliente, o botão diz o que falta (QM14).
    expect(issue).toHaveAccessibleDescription("Falta: Cliente.");
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: patient.fullName },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: patient.fullName }),
    );
    expect(issue).toBeEnabled();
    expect(issue).not.toHaveAttribute("aria-describedby");
    fireEvent.click(issue);
    fireEvent.click(
      await screen.findByRole("button", { name: "Conferir PDF" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar rascunho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty("professionalId");
    expect(posted[0]).not.toHaveProperty("appointmentId");
    await waitFor(() =>
      expect(screen.getByText("Fechar", { selector: "button" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByText("Fechar", { selector: "button" }));
    fireEvent.click(screen.getByRole("button", { name: "Novo documento" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: patient.fullName },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: patient.fullName }),
    );
    fireEvent.change(screen.getByLabelText("Profissional (opcional)"), {
      target: { value: professional.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Conferir PDF" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar rascunho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({
      templateId: template.id,
      patientId: patient.id,
      professionalId: professional.id,
    });
  });

  it("issues a draft document and prints the issued content", async () => {
    installDocumentBrowserMocks();
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const snapshot =
      "CONTRATO\n\nStudios Aryana e Helena Almeida firmam o presente instrumento.";
    const draft = {
      id: "d-1",
      clinicId: "c-1",
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientId: "99999999-9999-4999-8999-999999999999",
      title: "Contrato de prestação de serviços",
      templateName: "Contrato padrão",
      templateVersion: 1,
      patientName: "Helena Almeida",
      snapshotBody: snapshot,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const patched: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/documents/d-1/status") && init?.method === "PATCH") {
        patched.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...draft,
            status: "issued",
            issuedAt: new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.endsWith("/documents") ? [draft] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Contrato de prestação de serviços", {
        selector: "strong",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Emitir" }));
    const confirmIssue = await screen.findByRole("button", {
      name: "Emitir contrato",
    });
    await waitFor(() => expect(confirmIssue).toBeEnabled());
    fireEvent.click(confirmIssue);
    await vi.waitFor(() => expect(patched).toEqual([{ status: "issued" }]));
    fireEvent.click(await screen.findByRole("button", { name: "Imprimir" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Studios Aryana e Helena Almeida firmam/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Imprimir documento" }),
    );
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("creates a new template version in a modal keeping line breaks", async () => {
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
    const template = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Contrato padrão",
      kind: "contract",
      version: 1,
      body: "CONTRATO\n\n{{clinica_nome}} e {{paciente_nome}} firmam.",
      active: true,
      createdAt: new Date().toISOString(),
    };
    const posted: Array<{ url: string; body: unknown }> = [];
    let failNext = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (
        url.includes("/document-templates/") &&
        url.endsWith("/versions") &&
        init?.method === "POST"
      ) {
        if (failNext) {
          failNext = false;
          return {
            ok: false,
            status: 400,
            json: async () => ({ message: "Conteúdo inválido." }),
          } as Response;
        }
        posted.push({ url, body: JSON.parse(String(init.body)) });
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...template, version: 2 }),
        } as Response;
      }
      const body = url.endsWith("/document-templates") ? [template] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Modelos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nova versão" }));
    const dialog = await screen.findByRole("dialog");
    installDocumentBrowserMocks();
    const textarea = within(dialog).getByLabelText("Conteúdo");
    expect(textarea).toHaveTextContent("CONTRATO");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar versão" }),
    );
    expect(
      await within(dialog).findByText(
        "Altere o conteúdo para criar uma nova versão.",
      ),
    ).toBeInTheDocument();
    const newBody =
      "CONTRATO v2\n\nCláusula 1: {{paciente_nome}} contrata {{plano_nome}}.";
    setDocumentText(textarea, newBody);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar versão" }),
    );
    expect(
      await within(dialog).findByText("Conteúdo inválido."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar versão" }),
    );
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain(
      `/document-templates/${template.id}/versions`,
    );
    expect(posted[0]!.body).toEqual(
      expect.objectContaining({
        body: newBody,
        content: expect.objectContaining({ version: 1 }),
      }),
    );
    expect(
      await screen.findByText("Nova versão de “Contrato padrão” criada."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels a document after confirming in a modal", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const draft = {
      id: "d-1",
      clinicId: "c-1",
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientId: "99999999-9999-4999-8999-999999999999",
      title: "Contrato de prestação de serviços",
      templateName: "Contrato padrão",
      templateVersion: 1,
      patientName: "Helena Almeida",
      snapshotBody: "Contrato",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const patched: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/documents/d-1/status") && init?.method === "PATCH") {
        patched.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...draft,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.endsWith("/documents") ? [draft] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Cancelar documento" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByText(/Contrato de prestação de serviços/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(patched).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancelar documento",
      }),
    );
    await vi.waitFor(() => expect(patched).toEqual([{ status: "cancelled" }]));
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });
});

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nTest contract"], { type: "application/pdf" }),
}));
