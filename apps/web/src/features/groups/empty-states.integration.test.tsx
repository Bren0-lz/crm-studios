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

  it("offers to register the first clinical record when there is an appointment", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-records")
        ? []
        : url.includes("/appointments")
          ? [
              {
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                patientName: "Helena Almeida",
                professionalName: "Dra. Ana Martins",
                startsAt: new Date().toISOString(),
                status: "completed",
              },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    const empty = (
      await screen.findByText("Nenhuma evolução registrada")
    ).closest(".empty-state") as HTMLElement;
    expect(empty.querySelector(".empty-state-icon svg")).not.toBeNull();
    const action = await waitFor(() =>
      within(empty).getByRole("button", {
        name: /Registrar primeira evolução/,
      }),
    );
    fireEvent.click(action);
    expect(
      await screen.findByRole("dialog", { name: "Nova evolução clínica" }),
    ).toBeInTheDocument();
  });
});
