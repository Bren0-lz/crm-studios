import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const ana = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const bia = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const pilates = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const danca = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function setup() {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    JSON.stringify(
      withPermissions({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Usuário",
        email: "user@example.com",
        role: "user",
        modules: ["groups"],
        editModules: ["groups"],
        permissions: ["groups.view", "groups.create"],
      }),
    ),
  );
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/groups/workspace?")
      ? {
          groups: [],
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        }
      : url.includes("/professionals")
        ? [
            { id: ana, fullName: "Ana Martins" },
            { id: bia, fullName: "Bia Souza" },
          ]
        : url.includes("/services")
          ? [
              { id: pilates, name: "Pilates", professionalIds: [ana] },
              { id: danca, name: "Dançaterapia", professionalIds: [bia] },
            ]
          : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
}

function professionalOptions(dialog: HTMLElement) {
  return within(within(dialog).getByLabelText("Profissional"))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("new group professionals", () => {
  it("lists only the professionals who serve the chosen service", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    const dialog = screen.getByRole("dialog", { name: "Nova turma" });
    fireEvent.change(within(dialog).getByLabelText("Serviço"), {
      target: { value: pilates },
    });
    expect(professionalOptions(dialog)).toEqual(["Selecione", "Ana Martins"]);
    fireEvent.change(within(dialog).getByLabelText("Profissional"), {
      target: { value: ana },
    });
    fireEvent.change(within(dialog).getByLabelText("Serviço"), {
      target: { value: danca },
    });
    expect(professionalOptions(dialog)).toEqual(["Selecione", "Bia Souza"]);
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue("");
  });
});
