import { act } from "@testing-library/react";
import {
  documentEditor,
  setDocumentText,
  installDocumentBrowserMocks,
} from "../../test-support/document-editor";
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

describe("document template editor", () => {
  it("inserts fields at the cursor, previews the final text and clears the form after creating", async () => {
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
    const created: unknown[] = [];
    let finishCreate: (() => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/document-templates") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        created.push(body);
        await new Promise<void>((resolve) => {
          finishCreate = resolve;
        });
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...body,
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            version: 1,
            active: true,
            createdAt: new Date().toISOString(),
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Criar modelo" }));
    installDocumentBrowserMocks();
    fireEvent.click(screen.getByText("Inserir campo automático"));
    const fields = await screen.findByRole("group", { name: "Inserir campo" });
    const form = fields.closest("form") as HTMLFormElement;
    const name = within(form).getByLabelText("Nome");
    const body = within(form).getByLabelText("Conteúdo");
    // O editor abre com o contrato padrão; "Começar em branco" limpa nome e conteúdo.
    expect(name).toHaveValue("Contrato de prestação de serviços");
    expect(body).toHaveTextContent("CNPJ");
    fireEvent.click(
      within(form).getByRole("button", { name: "Começar em branco" }),
    );
    expect(name).toHaveValue("");
    await waitFor(() => expect(body.textContent).toBe(""));
    // Sem nome e conteúdo, "Criar modelo" diz o que falta (QM14).
    const createTemplate = within(form).getByRole("button", {
      name: "Criar modelo",
    });
    expect(createTemplate).toBeDisabled();
    expect(createTemplate).toHaveAccessibleDescription(
      "Falta: Nome, Conteúdo.",
    );

    fireEvent.change(name, { target: { value: "Termo de adesão" } });
    setDocumentText(body, "Eu, , aceito os termos da clínica.");
    expect(createTemplate).toBeEnabled();
    expect(within(form).queryByText(/Falta:/)).not.toBeInTheDocument();
    act(() => {
      body.focus();
      documentEditor(body).commands.setTextSelection(5);
    });
    fireEvent.click(
      within(fields).getByRole("button", { name: "Nome do cliente" }),
    );
    expect(body).toHaveTextContent(
      "Eu, Nome do cliente, aceito os termos da clínica.",
    );
    act(() => {
      documentEditor(body).commands.setTextSelection(
        documentEditor(body).state.doc.content.size - 2,
      );
    });
    fireEvent.click(
      within(fields).getByRole("button", { name: "Nome da clínica" }),
    );
    expect(body).toHaveTextContent(
      "Eu, Nome do cliente, aceito os termos da clínicaNome da clínica.",
    );
    const preview = within(form).getByRole("region", {
      name: "Prévia do documento final",
    });
    expect(preview).toHaveTextContent(
      "Eu, Maria da Silva, aceito os termos da clínicaStudios Aryana.",
    );

    const submit = within(form).getByRole("button", { name: "Criar modelo" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(created).toHaveLength(1));
    expect(
      within(form).getByRole("button", { name: "Criando…" }),
    ).toBeDisabled();
    finishCreate!();
    expect(
      await screen.findByText(
        "Modelo “Termo de adesão” criado com a versão 1.",
      ),
    ).toBeInTheDocument();
    expect(name).toHaveValue("");
    await waitFor(() => expect(body.textContent).toBe(""));
    expect(created).toEqual([
      expect.objectContaining({
        name: "Termo de adesão",
        body: "Eu, {{paciente_nome}}, aceito os termos da clínica{{clinica_nome}}.",
      }),
    ]);
  });

  it("opens with the standard contract and previews it with the clinic data", async () => {
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
      const url = String(input);
      const body = url.endsWith("/clinic/branding")
        ? {
            name: "Studios Aryana",
            logoDataUrl: "",
            timezone: "America/Sao_Paulo",
            legalName: "Aryana Fisioterapia Ltda.",
            taxId: "11.222.333/0001-81",
            address: "",
            phone: "19999990000",
            email: "contato@aryana.com.br",
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Criar modelo" }));
    const preview = await screen.findByRole("region", {
      name: "Prévia do documento final",
    });
    await waitFor(() =>
      expect(preview).toHaveTextContent(
        "CONTRATADA: Aryana Fisioterapia Ltda., nome fantasia Studios Aryana, inscrita no CNPJ sob o nº 11.222.333/0001-81",
      ),
    );
    expect(preview).toHaveTextContent("telefone (19) 99999-0000");
    expect(preview).toHaveTextContent("CPF sob o nº 529.982.247-25");
    expect(preview).toHaveTextContent(
      "Aryana Fisioterapia Ltda.CNPJ 11.222.333/0001-81",
    );
    // O endereço não está cadastrado: a prévia avisa onde preencher.
    expect(preview).toHaveAccessibleDescription(
      "Sem cadastro em Configurações › Clínica: Endereço da clínica. Na emissão, aparece “não informado”.",
    );
    expect(
      screen.getByRole("button", { name: "Usar contrato padrão" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ampliar prévia" }));
    expect(screen.queryByLabelText("Conteúdo")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar editor" }));
    expect(screen.getByLabelText("Conteúdo")).toBeVisible();
  });
});
