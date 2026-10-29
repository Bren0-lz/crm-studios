import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("assessment without templates", () => {
  it("creates a template from the new assessment and selects it on return", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
    };
    const templateWrites: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/assessment-templates") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        templateWrites.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...body,
            id: "abababab-abab-4bab-8bab-abababababab",
            clinicId: "11111111-1111-4111-8111-111111111111",
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
            attachments: [],
            addenda: [],
          }
        : url.includes("/patients")
          ? [patient]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar avaliação" }),
    );
    const assessment = screen.getByRole("dialog", {
      name: "Registrar avaliação",
    });
    expect(
      within(assessment).getByText("Nenhum modelo de avaliação"),
    ).toBeInTheDocument();
    expect(
      within(assessment).getByRole("button", { name: "Preencher formulário" }),
    ).toBeDisabled();
    fireEvent.click(
      within(assessment).getByRole("button", { name: "Criar modelo" }),
    );
    const templateDialog = screen.getByRole("dialog", {
      name: "Novo modelo de avaliação",
    });
    // O que falta para publicar fica listado e ligado aos botões (QM14).
    const publish = within(templateDialog).getByRole("button", {
      name: "Publicar modelo",
    });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      "Falta: Nome do modelo (pelo menos 3 caracteres), Pergunta do campo 1.",
    );
    fireEvent.change(within(templateDialog).getByLabelText("Nome do modelo"), {
      target: { value: "Avaliação postural" },
    });
    expect(publish).toHaveAccessibleDescription("Falta: Pergunta do campo 1.");
    fireEvent.change(
      within(templateDialog).getByLabelText("Pergunta ou título"),
      { target: { value: "Queixa principal" } },
    );
    expect(publish).toBeEnabled();
    expect(
      within(templateDialog).queryByText(/Falta:/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(templateDialog).getByRole("button", { name: "Publicar modelo" }),
    );
    // Publicado, o modelo já abre para preenchimento.
    expect(
      await within(assessment).findByText("Avaliação postural · Fisioterapia"),
    ).toBeInTheDocument();
    expect(templateWrites).toHaveLength(1);
    expect(templateWrites[0]).toMatchObject({
      name: "Avaliação postural",
      status: "published",
    });
    expect(
      screen.queryByRole("dialog", { name: "Novo modelo de avaliação" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Queixa principal")).toBeInTheDocument();
    expect(
      within(assessment).getByRole("button", { name: "Registrar avaliação" }),
    ).toBeEnabled();
  });
});
