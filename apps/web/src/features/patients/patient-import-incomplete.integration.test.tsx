import {
  INCOMPLETE_REGISTRATION_TAG,
  MISSING_CPF_TAG,
  MISSING_EMAIL_TAG,
} from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { clickMoreAction } from "../../test-support/patient-actions";

const basePatient = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  status: "active",
  cpf: "52998224725",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

const helena = {
  ...basePatient,
  id: "99999999-9999-4999-8999-999999999999",
  recordNumber: "PAC-00001",
  fullName: "Helena Planilha",
  phone: "11955570001",
  importedAt: "2026-11-04T12:00:00.000Z",
  tags: [INCOMPLETE_REGISTRATION_TAG, MISSING_EMAIL_TAG],
};

const igor = {
  ...basePatient,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recordNumber: "PAC-00002",
  fullName: "Igor Planilha",
  phone: "11955570002",
  whatsapp: "11955570002",
  emergencyContactName: "Mãe",
  emergencyContactPhone: "11955570012",
  importedAt: "2026-11-04T12:00:00.000Z",
  tags: [MISSING_EMAIL_TAG],
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

function renderPatients() {
  render(
    <MemoryRouter initialEntries={["/clientes"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("cliente importado sem WhatsApp, contato de emergência ou e-mail (CD3)", () => {
  it("lista 'Cadastro incompleto' e 'Sem e-mail' entre as etiquetas automáticas do filtro", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = /\/patients(\?|$)/.test(String(input)) ? [helena, igor] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderPatients();
    const row = (
      await screen.findByRole("button", { name: "Editar Helena Planilha" })
    ).closest(".table-row, li, article, tr") as HTMLElement | null;
    expect(
      within(row ?? document.body).getAllByText(INCOMPLETE_REGISTRATION_TAG)
        .length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const filter = await screen.findByRole("group", { name: "Etiquetas" });
    const incomplete = within(filter).getByRole("button", {
      name: new RegExp(`^${INCOMPLETE_REGISTRATION_TAG}`),
    });
    expect(incomplete.textContent).toBe(`${INCOMPLETE_REGISTRATION_TAG}1`);
    expect(incomplete).toHaveAttribute(
      "title",
      "Etiqueta automática: cliente importado da planilha sem WhatsApp ou sem contato de emergência. Sai sozinha quando os dois são preenchidos.",
    );
    const withoutEmail = within(filter).getByRole("button", {
      name: new RegExp(`^${MISSING_EMAIL_TAG}`),
    });
    expect(withoutEmail.textContent).toBe(`${MISSING_EMAIL_TAG}2`);
    expect(withoutEmail).toHaveAttribute(
      "title",
      "Etiqueta automática: cliente importado da planilha sem e-mail. Sai sozinha quando o e-mail é preenchido.",
    );

    fireEvent.click(incomplete);
    expect(
      await screen.findByRole("button", { name: "Editar Helena Planilha" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Editar Igor Planilha" }),
    ).not.toBeInTheDocument();
  });

  it("na importação, conta e explica os cadastros incompletos e sem e-mail", async () => {
    login();
    const row = (
      line: number,
      fullName: string,
      phone: string,
      extra: Record<string, string>,
    ) => ({
      line,
      status: "valid",
      fullName,
      phone,
      input: { fullName, phone, cpf: "52998224725", tags: [], ...extra },
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/patients/import/preview")
        ? {
            columns: [
              { index: 0, title: "nome", samples: ["Helena Planilha"] },
              { index: 1, title: "telefone", samples: ["11955570001"] },
            ],
            mapping: ["fullName", "phone"],
            rows: [
              row(2, "Helena Planilha", "11955570001", {}),
              row(3, "Igor Planilha", "11955570002", {
                whatsapp: "11955570002",
                emergencyContactName: "Mãe",
                emergencyContactPhone: "11955570012",
              }),
              row(4, "Joana Planilha", "11955570003", {
                whatsapp: "11955570003",
                emergencyContactName: "Pai",
                emergencyContactPhone: "11955570013",
                email: "joana@example.com",
              }),
              row(5, "Kaio Planilha", "11955570004", {
                whatsapp: "11955570004",
                emergencyContactName: "Tia",
                email: "kaio@example.com",
              }),
            ],
            errors: [],
            totals: { valid: 4, error: 0, duplicate: 0 },
          }
        : /\/patients(\?|$)/.test(url)
          ? [igor]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderPatients();
    await screen.findByRole("button", { name: "Editar Igor Planilha" });
    clickMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    expect(
      within(dialog).getByText(/nome e telefone são obrigatórios/),
    ).toHaveTextContent(
      `sem WhatsApp ou contato de emergência, “${INCOMPLETE_REGISTRATION_TAG}”; sem e-mail, “${MISSING_EMAIL_TAG}”`,
    );
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [
          new File(["nome;telefone\n"], "clientes.csv", { type: "text/csv" }),
        ],
      },
    });
    expect(
      await within(dialog).findByText("2 cadastros incompletos"),
    ).toBeVisible();
    expect(within(dialog).getByText("2 sem e-mail")).toBeVisible();
    expect(within(dialog).queryByText(/sem CPF$/)).not.toBeInTheDocument();
    const incomplete = `sem WhatsApp ou contato de emergência (etiqueta “${INCOMPLETE_REGISTRATION_TAG}”)`;
    const withoutEmail = `sem e-mail (etiqueta “${MISSING_EMAIL_TAG}”)`;
    expect(
      within(dialog).getByText(
        `Pronta para importar · ${incomplete} · ${withoutEmail}`,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(`Pronta para importar · ${withoutEmail}`),
    ).toBeVisible();
    expect(within(dialog).getByText("Pronta para importar")).toBeVisible();
    expect(
      within(dialog).getByText(`Pronta para importar · ${incomplete}`),
    ).toBeVisible();
    const table = dialog.querySelector(".patient-import-table") as HTMLElement;
    expect(table).not.toHaveTextContent(MISSING_CPF_TAG);
  });
});
