import { saoPauloToday } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const clinicId = "11111111-1111-4111-8111-111111111111";
const group = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pilates Turma A",
  sequence: 1,
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  serviceName: "Pilates",
  professionalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  professionalName: "Dra. Ana Martins",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomName: "Sala Movimento",
  capacity: 4,
  activeEnrollments: 1,
  waitlistCount: 0,
  weeklySlots: [{ weekday: 3, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const session = (id: string, date: string) => ({
  id,
  clinicId,
  groupId: group.id,
  groupName: group.name,
  professionalId: group.professionalId,
  professionalName: group.professionalName,
  roomId: group.roomId,
  roomName: group.roomName,
  startsAt: `${date}T18:00:00-03:00`,
  endsAt: `${date}T19:00:00-03:00`,
  status: "scheduled",
  attendanceCount: 0,
  createdAt: "2026-09-01T12:00:00Z",
});
const workspace = {
  groups: [group],
  enrollments: [
    {
      id: "e1111111-1111-4111-8111-111111111111",
      clinicId,
      groupId: group.id,
      patientId: "f1111111-1111-4111-8111-111111111111",
      patientName: "Ana Nova",
      status: "active",
      enrolledAt: "2026-10-17T12:00:00Z",
      startsOn: "2026-10-17",
      updatedAt: "2026-10-17T12:00:00Z",
    },
    {
      id: "e2222222-2222-4222-8222-222222222222",
      clinicId,
      groupId: group.id,
      patientId: "f2222222-2222-4222-8222-222222222222",
      patientName: "Bia Antiga",
      status: "cancelled",
      enrolledAt: "2026-10-01T12:00:00Z",
      startsOn: "2026-10-01",
      endedOn: "2026-10-15",
      updatedAt: "2026-10-15T12:00:00Z",
    },
  ],
  sessions: [
    session("51111111-1111-4111-8111-111111111111", "2026-10-14"),
    session("52222222-2222-4222-8222-222222222222", "2026-10-21"),
  ],
  attendance: [],
  replacementCredits: [],
};

function renderGroups() {
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
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input);
    const body =
      options?.method === "POST"
        ? {
            ...workspace.enrollments[0],
            ...JSON.parse(String(options.body)),
          }
        : url.includes("/groups/workspace?")
          ? workspace
          : url.includes("/patients/options")
            ? [
                {
                  id: "f3333333-3333-4333-8333-333333333333",
                  fullName: "Helena Almeida",
                  tags: [],
                },
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

describe("group enrollment period", () => {
  it("lists in each session only the clients enrolled on that date", async () => {
    // 18/10/2026: 14/10 fica em "Anteriores" (recolhida) e 21/10 em "Próximas".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    renderGroups();
    fireEvent.click(await screen.findByRole("button", { name: /Anteriores/ }));
    fireEvent.click(screen.getByRole("button", { name: /14 de out/ }));
    let dialog = screen.getByRole("dialog", { name: group.name });
    expect(
      within(dialog).getByLabelText("Frequência de Bia Antiga"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Frequência de Ana Nova"),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Fechar" })[0]!);

    fireEvent.click(screen.getByRole("button", { name: /21 de out/ }));
    dialog = screen.getByRole("dialog", { name: group.name });
    expect(
      within(dialog).getByLabelText("Frequência de Ana Nova"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Frequência de Bia Antiga"),
    ).not.toBeInTheDocument();
  });

  it("sends the chosen start date in a new enrollment (today by default)", async () => {
    renderGroups();
    fireEvent.click(
      await screen.findByRole("button", { name: "Matricular cliente" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nova matrícula" });
    const start = within(dialog).getByLabelText("Início da matrícula");
    expect(start).toHaveValue(saoPauloToday());
    fireEvent.change(start, { target: { value: "2026-10-17" } });
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
      {
        target: { value: "Helena Almeida" },
      },
    );
    fireEvent.click(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Matricular" }));
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "POST");
      expect(call?.[0]).toContain("/group-enrollments");
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        groupId: group.id,
        patientId: "f3333333-3333-4333-8333-333333333333",
        startsOn: "2026-10-17",
      });
    });
  });
});
