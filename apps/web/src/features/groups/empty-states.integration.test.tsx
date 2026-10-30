import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

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

describe("empty states with illustration and main action (V11)", () => {
  it("offers to create the first group on an empty Turmas page", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/groups/workspace")
        ? {
            groups: [],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    const empty = (await screen.findByText("Nenhuma turma cadastrada")).closest(
      ".empty-state",
    ) as HTMLElement;
    expect(empty.querySelector(".empty-state-icon svg")).not.toBeNull();
    fireEvent.click(
      within(empty).getByRole("button", { name: /Criar primeira turma/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Nova turma" }),
    ).toBeInTheDocument();
  });

  it("asks to choose a client on the clinical records page", async () => {
    login();
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    const empty = (await screen.findByText("Escolha um cliente")).closest(
      ".empty-state",
    ) as HTMLElement;
    expect(empty.querySelector(".empty-state-icon svg")).not.toBeNull();
    expect(
      screen.queryByText("Nenhuma evolução registrada"),
    ).not.toBeInTheDocument();
  });
});
