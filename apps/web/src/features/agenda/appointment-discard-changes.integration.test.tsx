import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

async function openNewAppointment() {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Recepção",
      email: "r@test.local",
      role: "reception",
    }),
  );
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    return response(
      url.includes("/professionals")
        ? [
            {
              id: "33333333-3333-4333-8333-333333333333",
              fullName: "Ana",
              color: "#5c6f68",
            },
          ]
        : url.includes("/rooms")
          ? [{ id: "55555555-5555-4555-8555-555555555555", name: "Sala" }]
          : url.includes("/services")
            ? [
                {
                  id: "77777777-7777-4777-8777-777777777777",
                  name: "Pilates",
                  priceInCents: 10000,
                },
              ]
            : [],
    );
  });
  render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText("Dia disponível");
  fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
  return screen.getByRole("dialog", { name: "Novo atendimento" });
}

function typeNotes(dialog: HTMLElement, value: string) {
  fireEvent.change(within(dialog).getByLabelText("Observação"), {
    target: { value },
  });
}

function discardPrompt() {
  return screen.getByRole("dialog", { name: "Descartar alterações?" });
}

function noAppointmentDialog() {
  return screen.queryByRole("dialog", { name: "Novo atendimento" });
}

describe("Novo atendimento: descartar alterações (QM11)", () => {
  it("closes an untouched form directly with Escape, X or Cancelar", async () => {
    for (const close of [
      () => fireEvent.keyDown(window, { key: "Escape" }),
      (dialog: HTMLElement) =>
        fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" })),
      (dialog: HTMLElement) =>
        fireEvent.click(
          within(dialog).getByRole("button", { name: "Cancelar" }),
        ),
    ]) {
      const dialog = await openNewAppointment();
      close(dialog);
      expect(noAppointmentDialog()).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Descartar alterações?" }),
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("asks on Escape, and Escape on the prompt closes only the prompt", async () => {
    const dialog = await openNewAppointment();
    typeNotes(dialog, "Trazer exames");
    fireEvent.keyDown(window, { key: "Escape" });
    const prompt = discardPrompt();
    expect(prompt).toHaveTextContent("Descartar");
    expect(
      within(prompt).getByRole("button", { name: "Continuar editando" }),
    ).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Descartar alterações?" }),
    ).not.toBeInTheDocument();
    expect(noAppointmentDialog()).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Observação")).toHaveValue(
      "Trazer exames",
    );
  });

  it("asks on X and keeps the data when continuing to edit", async () => {
    const dialog = await openNewAppointment();
    typeNotes(dialog, "Trazer exames");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    fireEvent.click(
      within(discardPrompt()).getByRole("button", {
        name: "Continuar editando",
      }),
    );
    expect(noAppointmentDialog()).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Observação")).toHaveValue(
      "Trazer exames",
    );
  });

  it("asks on Cancelar and closes after Descartar", async () => {
    const dialog = await openNewAppointment();
    typeNotes(dialog, "Trazer exames");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(discardPrompt()).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    fireEvent.click(
      within(discardPrompt()).getByRole("button", { name: "Descartar" }),
    );
    expect(noAppointmentDialog()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Descartar alterações?" }),
    ).not.toBeInTheDocument();
  });

  it("treats a value typed back to the original as untouched", async () => {
    const dialog = await openNewAppointment();
    typeNotes(dialog, "Trazer exames");
    typeNotes(dialog, "");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(noAppointmentDialog()).not.toBeInTheDocument();
  });
});
