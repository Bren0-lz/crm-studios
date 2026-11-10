import type { GroupClass } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

// QV5: o prefixo fixo ("Sala", "Turma") não se repete quando o nome já começa com ele.
const base: GroupClass = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "11111111-1111-4111-8111-111111111111",
  name: "Turma da manhã",
  sequence: 1,
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  serviceName: "Dançaterapia",
  professionalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  professionalName: "Clara Souza",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomName: "Sala de Dança",
  capacity: 4,
  activeEnrollments: 2,
  waitlistCount: 0,
  weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};

function setup(overrides: Partial<GroupClass> = {}) {
  const group = { ...structuredClone(base), ...overrides };
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
        editModules: [],
        permissions: ["groups.view", "groups.update"],
      }),
    ),
  );
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input);
    if (options?.method === "PATCH")
      return {
        ok: true,
        status: 200,
        json: async () => structuredClone(group),
      } as Response;
    const body = url.includes("/groups/workspace?")
      ? {
          groups: [structuredClone(group)],
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        }
      : url.includes("/rooms")
        ? [{ id: group.roomId, name: group.roomName, capacity: 12 }]
        : url.includes("/professionals")
          ? [{ id: group.professionalId, fullName: group.professionalName }]
          : url.includes("/services")
            ? [{ id: group.serviceId, name: group.serviceName }]
            : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
  return group;
}

async function openGroup(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
  return screen.getByRole("dialog", { name });
}

describe("group labels without repeated prefix", () => {
  it("shows the room name once when it already starts with Sala", async () => {
    setup();
    const dialog = await openGroup("Turma da manhã");
    const note = within(dialog).getByText(/comporta até/);
    expect(note).toHaveTextContent(
      "2 matriculados · Sala de Dança comporta até 12 pessoas",
    );
    expect(dialog).not.toHaveTextContent(/Sala Sala/i);
  });

  it("keeps the Sala prefix for rooms named without it", async () => {
    setup({ roomName: "Estúdio 1" });
    const dialog = await openGroup("Turma da manhã");
    expect(within(dialog).getByText(/comporta até/)).toHaveTextContent(
      "Sala Estúdio 1 comporta até 12 pessoas",
    );
  });

  it("confirms the update without repeating Turma", async () => {
    setup();
    const dialog = await openGroup("Turma da manhã");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    expect(
      await screen.findByText("Turma da manhã atualizada."),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Turma Turma/i);
  });
});
