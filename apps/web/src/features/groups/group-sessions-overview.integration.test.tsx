import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  capacity: 5,
  activeEnrollments: 3,
  waitlistCount: 1,
  weeklySlots: [
    { weekday: 2, startTime: "18:00", endTime: "19:00" },
    { weekday: 4, startTime: "18:00", endTime: "19:00" },
  ],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const dates = [
  "2026-10-01",
  "2026-10-03",
  "2026-10-06",
  "2026-10-08",
  "2026-10-13",
  "2026-10-15",
  // Hoje (18/10), às 08:00: já começou, mas ainda é "a partir de hoje".
  "2026-10-18",
  "2026-10-20",
  "2026-10-22",
  "2026-10-27",
  "2026-10-29",
  "2026-11-03",
  "2026-11-05",
];
const sessionId = (date: string) =>
  `5${date.slice(5, 7)}${date.slice(8, 10)}111-1111-4111-8111-111111111111`;
const session = (date: string) => ({
  id: sessionId(date),
  clinicId,
  groupId: group.id,
  groupName: group.name,
  professionalId: group.professionalId,
  professionalName: group.professionalName,
  roomId: group.roomId,
  roomName: group.roomName,
  startsAt: `${date}T${date === "2026-10-18" ? "08" : "18"}:00:00-03:00`,
  endsAt: `${date}T${date === "2026-10-18" ? "09" : "19"}:00:00-03:00`,
  status: "scheduled",
  attendanceCount: 0,
  createdAt: "2026-09-01T12:00:00Z",
});
const today = sessionId("2026-10-18");
const patient = (index: number) =>
  `f${index}111111-1111-4111-8111-111111111111`;
const enrollment = (
  index: number,
  patientName: string,
  status = "active",
) => ({
  id: `e${index}111111-1111-4111-8111-111111111111`,
  clinicId,
  groupId: group.id,
  patientId: patient(index),
  patientName,
  status,
  enrolledAt: "2026-09-01T12:00:00Z",
  startsOn: "2026-09-01",
  updatedAt: "2026-09-01T12:00:00Z",
});
const workspace = {
  groups: [group],
  enrollments: [
    enrollment(1, "Ana Lima"),
    enrollment(2, "Bia Rocha"),
    enrollment(3, "Caio Reis"),
    enrollment(4, "Dani Espera", "waitlisted"),
  ],
  sessions: dates.map(session),
  // Caio já tem registro no encontro de hoje: "Marcar todos presentes" não o altera.
  attendance: [
    {
      id: "a1111111-1111-4111-8111-111111111111",
      clinicId,
      sessionId: today,
      patientId: patient(3),
      patientName: "Caio Reis",
      status: "absent",
      accountingEnabled: true,
      recordedAt: "2026-10-18T12:00:00Z",
    },
  ],
  replacementCredits: [],
};

function renderGroups(
  attendance: (url: string) => { ok: boolean; status: number; body: unknown } = (
    url,
  ) => ({ ok: true, status: 200, body: { id: url, status: "present" } }),
) {
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
    if (options?.method === "PUT" && url.includes("/attendance/")) {
      const result = attendance(url);
      return {
        ok: result.ok,
        status: result.status,
        json: async () => result.body,
      } as Response;
    }
    const body = url.includes("/groups/workspace?")
      ? workspace
      : url.includes("/rooms")
        ? [{ id: group.roomId, name: group.roomName, capacity: 8 }]
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
}

const attendanceCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url, options]) =>
        options?.method === "PUT" && String(url).includes("/attendance/"),
    );

const sessionButtons = (list: HTMLElement) =>
  within(list)
    .getAllByRole("button", { name: /Pilates Turma A ·/ })
    .map((item) => item.textContent?.match(/\d{2} de \w+\./)?.[0]);

beforeEach(() => {
  // 18/10/2026 ao meio-dia em São Paulo.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("group sessions overview", () => {
  it("shows the groups before the sessions, with clear seat counts", async () => {
    renderGroups();
    const card = (
      await screen.findByRole("button", { name: "Abrir turma" })
    ).closest("article")!;
    expect(card).toHaveTextContent("3 matriculados · 2 vagas livres");
    expect(card).not.toHaveTextContent("3/5 vagas");
    const groupsHeading = screen.getByRole("heading", {
      level: 2,
      name: "Turmas",
    });
    const sessionsHeading = screen.getByRole("heading", {
      name: "Frequência e reposições",
    });
    expect(
      groupsHeading.compareDocumentPosition(sessionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens a group with its data at the top", async () => {
    renderGroups();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    const dialog = screen.getByRole("dialog", { name: group.name });
    const headings = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((item) => item.textContent);
    expect(headings[0]).toBe("Dados da turma");
    const summary = within(dialog)
      .getByRole("heading", { name: "Dados da turma" })
      .closest("section")!;
    expect(summary).toHaveTextContent("Pilates");
    expect(summary).toHaveTextContent("Dra. Ana Martins");
    expect(summary).toHaveTextContent("Sala Movimento");
    expect(summary).toHaveTextContent("Terça · 18:00–19:00");
    expect(summary).toHaveTextContent("Quinta · 18:00–19:00");
    expect(summary).toHaveTextContent("3 matriculados · 2 vagas livres");
  });

  it("splits sessions into upcoming and collapsed past ones, four at a time", async () => {
    renderGroups();
    const upcoming = await screen.findByRole("region", { name: "Próximas" });
    expect(sessionButtons(upcoming)).toEqual([
      "18 de out.",
      "20 de out.",
      "22 de out.",
      "27 de out.",
    ]);
    fireEvent.click(
      within(upcoming).getByRole("button", { name: "Mostrar mais" }),
    );
    expect(sessionButtons(upcoming)).toEqual([
      "18 de out.",
      "20 de out.",
      "22 de out.",
      "27 de out.",
      "29 de out.",
      "03 de nov.",
      "05 de nov.",
    ]);
    expect(
      within(upcoming).queryByRole("button", { name: "Mostrar mais" }),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Anteriores/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /15 de out/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const past = screen.getByRole("region", { name: "Anteriores" });
    expect(sessionButtons(past)).toEqual([
      "15 de out.",
      "13 de out.",
      "08 de out.",
      "06 de out.",
    ]);
    fireEvent.click(within(past).getByRole("button", { name: "Mostrar mais" }));
    expect(sessionButtons(past)).toEqual([
      "15 de out.",
      "13 de out.",
      "08 de out.",
      "06 de out.",
      "03 de out.",
      "01 de out.",
    ]);
  });

  it("marks every current participant without a record as present, after confirming", async () => {
    renderGroups();
    fireEvent.click(await screen.findByRole("button", { name: /18 de out/ }));
    const meeting = screen.getByRole("dialog", { name: group.name });
    fireEvent.click(
      within(meeting).getByRole("button", { name: "Marcar todos presentes" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Marcar todos presentes",
    });
    expect(confirm).toHaveTextContent("2 clientes");
    expect(attendanceCalls()).toHaveLength(0);
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Marcar presentes" }),
    );
    const toast = await vi.waitFor(() => {
      const found = document.querySelector(".toast-success");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(toast).toHaveTextContent("2 presenças registradas");
    const calls = attendanceCalls();
    expect(calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining(`/group-sessions/${today}/attendance/${patient(1)}`),
      expect.stringContaining(`/group-sessions/${today}/attendance/${patient(2)}`),
    ]);
    for (const [, options] of calls)
      expect(JSON.parse(String(options?.body))).toEqual({ status: "present" });
    expect(
      screen.queryByRole("dialog", { name: "Marcar todos presentes" }),
    ).not.toBeInTheDocument();
  });

  it("keeps 'Marcar todos presentes' disabled with a hint before the session starts", async () => {
    renderGroups();
    fireEvent.click(await screen.findByRole("button", { name: /20 de out/ }));
    const meeting = screen.getByRole("dialog", { name: group.name });
    const button = within(meeting).getByRole("button", {
      name: "Marcar todos presentes",
    });
    expect(button).toBeDisabled();
    // QC3: 15 min antes do início (18:00 → 17:45, fuso da clínica).
    expect(button).toHaveAccessibleDescription(
      "Disponível a partir de 20/10 às 17:45",
    );
    expect(within(meeting).getByText("Disponível a partir de 20/10 às 17:45"))
      .toBeInTheDocument();
    fireEvent.click(button);
    expect(
      screen.queryByRole("dialog", { name: "Marcar todos presentes" }),
    ).not.toBeInTheDocument();
    expect(attendanceCalls()).toHaveLength(0);
  });

  it("reports partial failures when marking everyone present", async () => {
    renderGroups((url) =>
      url.includes(patient(2))
        ? {
            ok: false,
            status: 409,
            body: {
              code: "REPLACEMENT_ALREADY_USED",
              message: "A reposição desta falta já foi utilizada.",
            },
          }
        : { ok: true, status: 200, body: { id: url, status: "present" } },
    );
    fireEvent.click(await screen.findByRole("button", { name: /18 de out/ }));
    const meeting = screen.getByRole("dialog", { name: group.name });
    fireEvent.click(
      within(meeting).getByRole("button", { name: "Marcar todos presentes" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Marcar todos presentes" }),
      ).getByRole("button", { name: "Marcar presentes" }),
    );
    const failure = await vi.waitFor(() => {
      const found = document.querySelector(".toast-error");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(failure).toHaveTextContent(
      "1 presença não pôde ser registrada: A reposição desta falta já foi utilizada.",
    );
    expect(document.querySelector(".toast-success")).toHaveTextContent(
      "1 presença registrada",
    );
  });
});
