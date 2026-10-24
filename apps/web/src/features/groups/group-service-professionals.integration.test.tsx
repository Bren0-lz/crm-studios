import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { GroupClass, GroupSession } from "@crm/contracts";
import {
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const ana = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const bia = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const pilates = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const danca = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const carla = "abababab-abab-4bab-8bab-abababababab";
const clinicId = "11111111-1111-4111-8111-111111111111";
const group: GroupClass = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pilates Turma A",
  sequence: 1,
  serviceId: pilates,
  serviceName: "Pilates",
  professionalId: carla,
  professionalName: "Carla Lima",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomName: "Sala Movimento",
  capacity: 4,
  activeEnrollments: 0,
  waitlistCount: 0,
  weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const meeting: GroupSession = {
  id: "51111111-1111-4111-8111-000000000001",
  clinicId,
  groupId: group.id,
  groupName: group.name,
  professionalId: carla,
  professionalName: "Carla Lima",
  roomId: group.roomId,
  roomName: group.roomName,
  startsAt: "2026-10-20T18:00:00-03:00",
  endsAt: "2026-10-20T19:00:00-03:00",
  status: "scheduled",
  attendanceCount: 0,
  createdAt: group.createdAt,
};

function setup(initialEntry = "/turmas", owner = false) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    owner
      ? storedUser({
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Aryana Dutra",
          email: "admin@movimenta.local",
          role: "owner",
        })
      : JSON.stringify(
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
          groups: owner ? [group] : [],
          enrollments: [],
          sessions: owner ? [meeting] : [],
          attendance: [],
          replacementCredits: [],
        }
      : url.includes("/professionals")
        ? [
            { id: ana, fullName: "Ana Martins" },
            { id: bia, fullName: "Bia Souza" },
            { id: carla, fullName: "Carla Lima" },
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
    <MemoryRouter initialEntries={[initialEntry]}>
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
    expect(within(dialog).queryByText("Carla Lima")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Profissional"), {
      target: { value: ana },
    });
    fireEvent.change(within(dialog).getByLabelText("Serviço"), {
      target: { value: danca },
    });
    expect(professionalOptions(dialog)).toEqual(["Selecione", "Bia Souza"]);
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue("");
  });

  it("lists only who serves the group's service when changing a meeting's professional", async () => {
    setup(`/turmas?sessionId=${meeting.id}`, true);
    const select = await screen.findByLabelText("Profissional deste encontro");
    // Carla segue na lista por ser a profissional atual do encontro; Bia não atende Pilates.
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Ana Martins", "Carla Lima"]);
  });
});
