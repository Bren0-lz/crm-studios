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
    const fields = await screen.findByRole("group", { name: "Inserir campo" });
    const form = fields.closest("form") as HTMLFormElement;
    const name = within(form).getByLabelText("Nome");
    const body = within(form).getByLabelText("Conteúdo") as HTMLTextAreaElement;
    expect(name).toHaveValue("");
    expect(body).toHaveValue("");

    fireEvent.change(name, { target: { value: "Termo de adesão" } });
    fireEvent.change(body, {
      target: { value: "Eu, , aceito os termos da clínica." },
    });
    body.setSelectionRange(4, 4);
    fireEvent.click(
      within(fields).getByRole("button", { name: "Nome do cliente" }),
    );
    expect(body).toHaveValue(
      "Eu, {{paciente_nome}}, aceito os termos da clínica.",
    );
    body.setSelectionRange(body.value.length - 1, body.value.length - 1);
    fireEvent.click(
      within(fields).getByRole("button", { name: "Nome da clínica" }),
    );
    expect(body).toHaveValue(
      "Eu, {{paciente_nome}}, aceito os termos da clínica{{clinica_nome}}.",
    );
    const preview = within(form).getByRole("region", {
      name: "Prévia com cliente de exemplo",
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
    expect(body).toHaveValue("");
    expect(created).toEqual([
      expect.objectContaining({
        name: "Termo de adesão",
        body: "Eu, {{paciente_nome}}, aceito os termos da clínica{{clinica_nome}}.",
      }),
    ]);
  });
});
