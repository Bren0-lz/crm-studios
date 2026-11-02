import { MISSING_CPF_TAG } from "@crm/contracts";
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

const basePatient = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  status: "active",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

const imported = {
  ...basePatient,
  id: "99999999-9999-4999-8999-999999999999",
  recordNumber: "PAC-00001",
  fullName: "Gina Importada",
  phone: "11955540020",
  tags: [MISSING_CPF_TAG],
};

const withCpf = {
  ...basePatient,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recordNumber: "PAC-00002",
  fullName: "Davi Com Documento",
  phone: "11955540030",
  cpf: "52998224725",
  tags: [],
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

function mockApi() {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const body =
      init?.method === "PUT"
        ? { ...imported, ...JSON.parse(String(init.body)) }
        : /\/patients(\?|$)/.test(url)
          ? [imported, withCpf]
          : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

async function openEdit(name: string) {
  render(
    <MemoryRouter initialEntries={["/clientes"]}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: `Editar ${name}` }),
  );
  return screen.findByRole("dialog", { name: "Editar cliente" });
}

describe("cliente sem CPF (B6-05)", () => {
  it("mostra 'Falta CPF' na lista e no filtro e edita o cliente sem exigir o CPF", async () => {
    login();
    mockApi();
    const dialog = await openEdit("Gina Importada");
    const cpf = within(dialog).getByLabelText("CPF");
    expect(cpf).not.toBeRequired();
    expect(cpf).toHaveAccessibleDescription(
      `Cliente sem CPF: preencha quando tiver. A etiqueta “${MISSING_CPF_TAG}” sai sozinha.`,
    );
    // A etiqueta automática não aparece para marcar no cadastro.
    const choices = within(dialog).getByRole("group", { name: "Etiquetas" });
    expect(
      within(choices).queryByRole("button", { name: MISSING_CPF_TAG }),
    ).not.toBeInTheDocument();

    const save = within(dialog).getByRole("button", {
      name: "Salvar alterações",
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => {
      const put = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PUT");
      expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
        fullName: "Gina Importada",
        cpf: "",
        tags: [],
      });
    });
  });

  it("valida o CPF digitado na edição de quem não tinha CPF", async () => {
    login();
    mockApi();
    const dialog = await openEdit("Gina Importada");
    fireEvent.change(within(dialog).getByLabelText("CPF"), {
      target: { value: "11111111111" },
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Salvar alterações" })
        .closest("form")!,
    );
    expect(
      await within(dialog).findByText("Informe um CPF válido.", {
        selector: ".form-error",
      }),
    ).toBeVisible();
    expect(
      vi.mocked(fetch).mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
  });

  it("não deixa apagar o CPF de quem já tem", async () => {
    login();
    mockApi();
    const dialog = await openEdit("Davi Com Documento");
    const cpf = within(dialog).getByLabelText("CPF");
    expect(cpf).toBeRequired();
    fireEvent.change(cpf, { target: { value: "" } });
    expect(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    ).toBeDisabled();
    expect(within(dialog).getByText("Falta: CPF.")).toBeVisible();
  });

  it("lista 'Falta CPF' entre as etiquetas automáticas do filtro", async () => {
    login();
    mockApi();
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    const row = (
      await screen.findByRole("button", { name: "Editar Gina Importada" })
    ).closest(".table-row, li, article, tr") as HTMLElement | null;
    expect(
      within(row ?? document.body).getAllByText(MISSING_CPF_TAG).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const filter = await screen.findByRole("group", { name: "Etiquetas" });
    const automatic = within(filter).getByRole("button", {
      name: new RegExp(`^${MISSING_CPF_TAG}`),
    });
    expect(automatic.textContent).toBe(`${MISSING_CPF_TAG}1`);
    expect(automatic).toHaveAttribute(
      "title",
      "Etiqueta automática: cliente sem CPF (importado da planilha). Sai sozinha quando o CPF é preenchido.",
    );
  });

  it("na importação, conta e explica as linhas sem CPF", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/patients/import/preview")
        ? {
            columns: [
              { index: 0, title: "nome", samples: ["Gina Importada"] },
              { index: 1, title: "telefone", samples: ["11955540020"] },
            ],
            mapping: ["fullName", "phone"],
            rows: [
              {
                line: 2,
                status: "valid",
                fullName: "Gina Importada",
                phone: "11955540020",
                input: {
                  fullName: "Gina Importada",
                  phone: "11955540020",
                  tags: [],
                },
              },
              {
                line: 3,
                status: "valid",
                fullName: "Davi Com Documento",
                phone: "11955540030",
                input: {
                  fullName: "Davi Com Documento",
                  phone: "11955540030",
                  cpf: "52998224725",
                  tags: [],
                },
              },
            ],
            errors: [],
            totals: { valid: 2, error: 0, duplicate: 0 },
          }
        : /\/patients(\?|$)/.test(url)
          ? [withCpf]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Davi Com Documento" });
    clickMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    expect(
      within(dialog).getByText(/nome e telefone são obrigatórios/),
    ).toHaveTextContent(`Quem vier sem CPF recebe a etiqueta “${MISSING_CPF_TAG}”`);
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [
          new File(["nome;telefone\n"], "clientes.csv", { type: "text/csv" }),
        ],
      },
    });
    expect(await within(dialog).findByText("1 sem CPF")).toBeVisible();
    expect(
      within(dialog).getByText(
        `Pronta para importar · sem CPF (etiqueta “${MISSING_CPF_TAG}”)`,
      ),
    ).toBeVisible();
    expect(within(dialog).getByText("Pronta para importar")).toBeVisible();
    expect(
      within(dialog).getByRole("combobox", {
        name: "Dado do sistema para a coluna nome",
      }),
    ).toHaveTextContent("Nome (obrigatório)");
    expect(
      within(dialog)
        .getAllByRole("option", { name: "CPF" })
        .length,
    ).toBeGreaterThan(0);
  });
});
