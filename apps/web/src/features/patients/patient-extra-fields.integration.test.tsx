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
import { clickMoreAction } from "../../test-support/patient-actions";

const patient = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId: "11111111-1111-4111-8111-111111111111",
  recordNumber: "PAC-00001",
  fullName: "Lia Planilha",
  phone: "11966660001",
  cpf: "52998224725",
  tags: [],
  status: "active",
  extraFields: { "Tamanho do pé": "37", "Como conheceu": "Instagram" },
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

function login() {
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
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('"Outros" da importação (entrega 10)', () => {
  it("mostra a seção Outros na ficha do cliente", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith(`/patients/${patient.id}`) ? patient : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt(`/clientes/${patient.id}`);
    const section = await screen.findByRole("region", { name: "Outros" });
    expect(
      within(section).getByText("Tamanho do pé").closest("div"),
    ).toHaveTextContent("37");
    expect(
      within(section).getByText("Como conheceu").closest("div"),
    ).toHaveTextContent("Instagram");
  });

  it("deixa escolher Outros em várias colunas e atualizar quem já está cadastrado", async () => {
    login();
    const columns = [
      { index: 0, title: "nome", samples: ["Lia Planilha"] },
      { index: 1, title: "telefone", samples: ["11966660001"] },
      { index: 2, title: "Tamanho do pé", samples: ["38"] },
      { index: 3, title: "Turma", samples: ["Manhã"] },
    ];
    const input = {
      fullName: "Lia Planilha",
      phone: "11966660001",
      tags: [],
      extraFields: { "Tamanho do pé": "38", Turma: "Manhã" },
    };
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      const path = String(url);
      const sent = options?.body
        ? (JSON.parse(String(options.body)) as { mapping?: string[] })
        : {};
      const mapping = sent.mapping ?? ["fullName", "phone", null, null];
      const merging = mapping.filter((field) => field === "extra").length > 0;
      const body = path.endsWith("/patients/import/preview")
        ? {
            columns,
            mapping,
            rows: [
              {
                line: 2,
                status: "duplicate",
                fullName: "Lia Planilha",
                phone: "11966660001",
                input: merging ? input : { ...input, extraFields: undefined },
                duplicateOf: {
                  kind: "existing",
                  field: "phone",
                  patientId: patient.id,
                  fullName: "Lia Planilha",
                },
              },
            ],
            errors: [],
            totals: { valid: 0, error: 0, duplicate: 1 },
          }
        : path.endsWith("/patients/import")
          ? { created: 0, skipped: 0, errors: 0, updated: 1 }
          : /\/patients(\?|$)/.test(path)
            ? [patient]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt("/clientes");
    await screen.findByRole("button", { name: "Editar Lia Planilha" });
    clickMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [
          new File(["nome;telefone\n"], "clientes.csv", { type: "text/csv" }),
        ],
      },
    });
    const footSize =
      await within(dialog).findByLabelText(/coluna Tamanho do pé/);
    const importButton = within(dialog).getByRole("button", {
      name: /^Importar 0 clientes/,
    });
    expect(importButton).toBeDisabled();

    fireEvent.change(footSize, { target: { value: "extra" } });
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/coluna Tamanho do pé/)).toHaveValue(
        "extra",
      ),
    );
    fireEvent.change(within(dialog).getByLabelText(/coluna Turma/), {
      target: { value: "extra" },
    });
    // "Outros" fica nas duas colunas (os demais campos tiram o anterior).
    expect(within(dialog).getByLabelText(/coluna Tamanho do pé/)).toHaveValue(
      "extra",
    );
    expect(within(dialog).getByLabelText(/coluna Turma/)).toHaveValue("extra");
    expect(
      await within(dialog).findByText(
        "Já cadastrado: Lia Planilha (mesmo telefone) · “Outros” será atualizado",
      ),
    ).toBeVisible();
    const confirm = within(dialog).getByRole("button", {
      name: "Importar 0 clientes e atualizar 1",
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(
      await within(dialog).findByText(
        "0 clientes importados, 1 cliente atualizado em “Outros”, 0 ignorados por duplicidade e 0 com erro.",
      ),
    ).toBeVisible();
    const sent = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/patients/import"));
    expect(JSON.parse(String(sent?.[1]?.body)).mapping).toEqual([
      "fullName",
      "phone",
      "extra",
      "extra",
    ]);
  });
});
