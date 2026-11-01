import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const admin = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Aryana Dutra",
  email: "admin@movimenta.local",
  role: "owner",
};
const patient = {
  cpf: "52998224725",
  id: "99999999-9999-4999-8999-999999999999",
  recordNumber: "PAC-00001",
  fullName: "Helena Almeida",
  phone: "11987654321",
  tags: [],
  status: "active",
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function mockApi() {
  vi.mocked(fetch).mockImplementation(async (_input, init) =>
    init?.method === "PUT"
      ? jsonResponse({ ...patient, ...JSON.parse(String(init.body)) })
      : jsonResponse([patient]),
  );
}

const updateBody = () => {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, options]) => options?.method === "PUT");
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
};

async function openEdit() {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem("crm.auth.user", storedUser(admin));
  mockApi();
  render(
    <MemoryRouter initialEntries={["/clientes"]}>
      <App />
    </MemoryRouter>,
  );
  const row = await screen.findByRole("button", {
    name: "Abrir ficha de Helena Almeida",
  });
  fireEvent.click(
    within(row).getByRole("button", { name: "Editar Helena Almeida" }),
  );
  return screen.getByRole("dialog");
}

async function save(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Salvar alterações" }),
  );
  await vi.waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(true),
  );
}

describe("client edit reason", () => {
  it("sends the optional reason with the client edit", async () => {
    const dialog = await openEdit();
    fireEvent.change(
      within(dialog).getByLabelText("Motivo da alteração (opcional)"),
      { target: { value: "  Cliente trocou de número  " } },
    );
    await save(dialog);
    expect(updateBody()).toMatchObject({
      fullName: "Helena Almeida",
      changeReason: "Cliente trocou de número",
    });
  });

  it("does not send an empty reason", async () => {
    const dialog = await openEdit();
    await save(dialog);
    expect(updateBody()).not.toHaveProperty("changeReason");
  });

  it("does not ask for a reason when registering a new client", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByLabelText(
        "Motivo da alteração (opcional)",
      ),
    ).not.toBeInTheDocument();
  });
});
