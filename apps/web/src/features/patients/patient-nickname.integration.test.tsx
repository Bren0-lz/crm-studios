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
import { fillRequiredContact } from "../../test-support/patient-actions";

const patient = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId: "11111111-1111-4111-8111-111111111111",
  recordNumber: "PAC-00001",
  fullName: "Maria Aparecida Lima",
  nickname: "Cidinha",
  phone: "11987654321",
  tags: [],
  status: "active",
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

describe("client nickname", () => {
  it("sends the nickname typed in the registration", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (_input, options) => {
      const body = options?.method === "POST" ? patient : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt("/clientes");
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Novo cliente" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Maria Aparecida Lima" },
    });
    fireEvent.change(within(dialog).getByLabelText("Apelido"), {
      target: { value: "Cidinha" },
    });
    fireEvent.change(within(dialog).getByLabelText("CPF"), {
      target: { value: "52998224725" },
    });
    fillRequiredContact(dialog);
    fireEvent.change(
      within(
        within(dialog).getByRole("group", { name: "Contato" }),
      ).getByLabelText("Telefone"),
      { target: { value: "11987654321" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    );
    await waitFor(() => {
      const post = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, options]) =>
            options?.method === "POST" && String(url).endsWith("/patients"),
        );
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        fullName: "Maria Aparecida Lima",
        nickname: "Cidinha",
      });
    });
  });

  it("shows the nickname in the list and on the client record", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : /\/patients(\?|$)/.test(url)
          ? [patient]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt("/clientes");
    expect(await screen.findByText('PAC-00001 · "Cidinha"')).toBeVisible();
  });

  it("lists the nickname in the client summary", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith(`/patients/${patient.id}`) ? patient : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderAt(`/clientes/${patient.id}`);
    const summary = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    const item = within(summary).getByText("Apelido").closest("div")!;
    expect(item).toHaveTextContent("Cidinha");
  });
});
