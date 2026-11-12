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

const basePatient = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  status: "active",
  tags: [],
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};

// Cadastrada antes da regra (CD1): sem WhatsApp nem contato de emergência.
const legacy = {
  ...basePatient,
  id: "99999999-9999-4999-8999-999999999999",
  recordNumber: "PAC-00001",
  fullName: "Olga Antiga",
  phone: "11955540020",
  cpf: "52998224725",
};

const complete = {
  ...basePatient,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recordNumber: "PAC-00002",
  fullName: "Nina Completa",
  phone: "11955540030",
  whatsapp: "11955540031",
  emergencyContactName: "Rui Completo (pai)",
  emergencyContactPhone: "11955540032",
  emergencyContactWhatsapp: "11955540033",
  cpf: "11144477735",
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
        ? { ...legacy, ...JSON.parse(String(init.body)) }
        : /\/patients(\?|$)/.test(url)
          ? [legacy, complete]
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

describe("WhatsApp e contato de emergência na edição (CD1)", () => {
  it("edita o cadastro antigo sem exigir WhatsApp nem contato de emergência", async () => {
    login();
    mockApi();
    const dialog = await openEdit("Olga Antiga");
    const contact = within(dialog).getByRole("group", { name: "Contato" });
    const emergency = within(dialog).getByRole("group", {
      name: "Contato de emergência",
    });
    expect(within(contact).getByLabelText("WhatsApp")).not.toBeRequired();
    expect(within(emergency).getByLabelText("Nome")).not.toBeRequired();
    expect(within(emergency).getByLabelText("Telefone")).not.toBeRequired();
    expect(within(emergency).getByLabelText("WhatsApp")).not.toBeRequired();
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
        fullName: "Olga Antiga",
        whatsapp: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        emergencyContactWhatsapp: "",
      });
    });
  });

  it("não deixa apagar o WhatsApp nem o contato de emergência de quem já tem", async () => {
    login();
    mockApi();
    const dialog = await openEdit("Nina Completa");
    const contact = within(dialog).getByRole("group", { name: "Contato" });
    const emergency = within(dialog).getByRole("group", {
      name: "Contato de emergência",
    });
    const whatsapp = within(contact).getByLabelText("WhatsApp");
    expect(whatsapp).toBeRequired();
    expect(within(emergency).getByLabelText("Nome")).toBeRequired();
    expect(within(emergency).getByLabelText("WhatsApp")).toBeRequired();
    fireEvent.change(whatsapp, { target: { value: "" } });
    fireEvent.change(within(emergency).getByLabelText("Nome"), {
      target: { value: "" },
    });
    fireEvent.change(within(emergency).getByLabelText("WhatsApp"), {
      target: { value: "" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(
        "Falta: WhatsApp, Nome do contato de emergência, WhatsApp do contato de emergência.",
      ),
    ).toBeVisible();
  });
});
