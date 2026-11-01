import type { GroupClass, GroupSession, GroupWorkspace } from "@crm/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "f1111111-1111-4111-8111-111111111111";
const groupA: GroupClass = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pilates Turma A",
  sequence: 1,
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  serviceName: "Pilates",
  professionalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  professionalName: "Ana Martins",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomName: "Sala Movimento",
  capacity: 4,
  activeEnrollments: 1,
  waitlistCount: 0,
  weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const groupB: GroupClass = {
  ...groupA,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb",
  name: "Pilates Turma B",
  sequence: 2,
};
const groupC: GroupClass = {
  ...groupA,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc",
  name: "Dançaterapia Turma A",
  serviceId: "cccccccc-cccc-4ccc-8ccc-dddddddddddd",
  serviceName: "Dançaterapia",
};
const session = (
  group: GroupClass,
  index: number,
  date: string,
): GroupSession => ({
  id: `51111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
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
  createdAt: group.createdAt,
});
const targetB = session(groupB, 10, "2026-10-20");
const data: GroupWorkspace = {
  groups: [groupA, groupB, groupC],
  enrollments: [groupA, groupB].map((group) => ({
    id: group.id,
    clinicId,
    groupId: group.id,
    patientId,
    patientName: "Ana Compartilhada",
    status: "active",
    startsOn: "2026-09-01",
    enrolledAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  })),
  sessions: [
    ...["20", "21", "22", "23", "24", "25"].map((day, index) =>
      session(groupA, index, `2026-10-${day}`),
    ),
    targetB,
    session(groupB, 11, "2026-10-10"),
    session(groupC, 12, "2026-10-20"),
  ],
  attendance: [],
  replacementCredits: [groupA, groupB].map((group, index) => ({
    id: `c1111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    clinicId,
    patientId,
    patientName: "Ana Compartilhada",
    sourceSessionId: `51111111-1111-4111-8111-${String(index + 100).padStart(12, "0")}`,
    sourceGroupId: group.id,
    status: "available",
    createdAt: "2026-08-01T12:00:00Z",
  })),
};

function setup({
  initialEntry = "/turmas",
  readOnly = false,
  workspace = structuredClone(data),
  write,
}: {
  initialEntry?: string;
  readOnly?: boolean;
  workspace?: GroupWorkspace;
  write?: () => Promise<Response>;
} = {}) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    readOnly
      ? JSON.stringify(
          withPermissions({
            id: patientId,
            fullName: "Leitura",
            email: "leitura@movimenta.local",
            role: "user",
            modules: ["groups"],
            editModules: [],
          }),
        )
      : storedUser({
          id: patientId,
          fullName: "Aryana Dutra",
          email: "admin@movimenta.local",
          role: "owner",
        }),
  );
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input);
    if (options?.method && options.method !== "GET") {
      if (write) return write();
      if (url.includes("/group-replacements/book")) {
        const body = JSON.parse(String(options.body)) as {
          creditId: string;
          sessionId: string;
        };
        workspace.replacementCredits.find(
          (item) => item.id === body.creditId,
        )!.status = "used";
        workspace.attendance.push({
          id: body.creditId,
          clinicId,
          sessionId: body.sessionId,
          patientId,
          patientName: "Ana Compartilhada",
          status: "replacement",
          outcome: "scheduled",
          recordedAt: "2026-10-18T15:00:00Z",
        });
      }
      if (url.endsWith("/complete"))
        workspace.sessions.find((item) => url.includes(item.id))!.status =
          "completed";
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    const body = url.includes("/groups/workspace?")
      ? workspace
      : url.includes("/rooms")
        ? [{ id: groupA.roomId, name: groupA.roomName, capacity: 10 }]
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

async function openGroup(name: string) {
  const row = (await screen.findByText(name)).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Abrir turma" }));
  return screen.getByRole("dialog", { name });
}

const calendarGrid = () => screen.getByRole("table", { name: /^Aulas de / });

function openOperations() {
  fireEvent.click(screen.getByRole("tab", { name: "Frequência e reposições" }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("group modal tabs", () => {
  it("supports keyboard tabs and preserves edits and the discard guard", async () => {
    setup();
    const dialog = await openGroup(groupA.name);
    const details = within(dialog).getByRole("tab", { name: "Dados da turma" });
    const operations = within(dialog).getByRole("tab", {
      name: "Frequência e reposições",
    });
    expect(details).toHaveFocus();
    expect(details).toHaveAttribute("aria-selected", "true");
    fireEvent.change(within(dialog).getByLabelText("Máximo de pessoas"), {
      target: { value: "5" },
    });
    fireEvent.keyDown(details, { key: "ArrowRight" });
    expect(operations).toHaveFocus();
    expect(within(dialog).getByRole("tabpanel")).toHaveAccessibleName(
      "Frequência e reposições",
    );
    expect(
      screen.queryByRole("heading", { name: "Participantes" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(operations, { key: "Home" });
    expect(details).toHaveFocus();
    expect(within(dialog).getByLabelText("Máximo de pessoas")).toHaveValue(5);
    fireEvent.keyDown(details, { key: "End" });
    expect(operations).toHaveFocus();
    fireEvent.keyDown(operations, { key: "ArrowLeft" });
    expect(details).toHaveFocus();
    openOperations();
    fireEvent.keyDown(window, { key: "Escape" });
    const discard = screen.getByRole("dialog", {
      name: "Descartar alterações?",
    });
    fireEvent.click(
      within(discard).getByRole("button", { name: "Continuar editando" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Dados da turma" }));
    expect(within(dialog).getByLabelText("Máximo de pessoas")).toHaveValue(5);
  });

  it("isolates sessions and old credits for a client enrolled in both groups and resets the selection", async () => {
    const workspace = structuredClone(data);
    // Duas aulas da Turma A no mesmo dia (07:00 e 18:00 de 20/10).
    workspace.sessions.push({
      ...session(groupA, 20, "2026-10-20"),
      startsAt: "2026-10-20T07:00:00-03:00",
      endsAt: "2026-10-20T08:00:00-03:00",
    });
    setup({ initialEntry: `/turmas?patientId=${patientId}`, workspace });
    await openGroup(groupA.name);
    openOperations();
    expect(
      within(calendarGrid()).getAllByRole("button", {
        name: /Pilates Turma A/,
      }),
    ).toHaveLength(7);
    expect(
      within(calendarGrid()).queryByRole("button", { name: /Pilates Turma B/ }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Crédito de reposição"))
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["", data.replacementCredits[0]!.id]);
    fireEvent.click(
      within(calendarGrid()).getByRole("button", {
        name: "Terça-feira, 20 de outubro, 2 aulas",
      }),
    );
    expect(
      within(screen.getByRole("region", { name: "Terça-feira, 20 de outubro" }))
        .getAllByRole("button")
        .map((item) => item.textContent),
    ).toEqual([
      "Pilates Turma A · 20 de out. · 07:00 · Agendado",
      "Pilates Turma A · 20 de out. · 18:00 · Agendado",
    ]);
    fireEvent.keyDown(window, { key: "Escape" });
    await openGroup(groupB.name);
    openOperations();
    expect(
      within(calendarGrid())
        .getAllByRole("button", { name: /Pilates Turma/ })
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual([
      "Pilates Turma B · 10 de out. · 18:00 · Agendado",
      "Pilates Turma B · 20 de out. · 18:00 · Agendado",
    ]);
    expect(
      within(screen.getByLabelText("Crédito de reposição"))
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["", data.replacementCredits[1]!.id]);
    expect(
      within(calendarGrid()).getByRole("button", {
        name: /^Domingo, 18 de outubro, hoje/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    await openGroup(groupA.name);
    openOperations();
    expect(
      within(calendarGrid()).getByRole("button", {
        name: /^Domingo, 18 de outubro, hoje/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Crédito de reposição")).toHaveValue("");
  });

  it("keeps the visible month and day after concluding a class from the calendar", async () => {
    const workspace = structuredClone(data);
    workspace.sessions.push(session(groupA, 30, "2026-11-10"));
    setup({ workspace });
    await openGroup(groupA.name);
    openOperations();
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    const november = await screen.findByRole("table", {
      name: "Aulas de Novembro de 2026",
    });
    fireEvent.click(
      within(november).getByRole("button", {
        name: "Terça-feira, 10 de novembro, 1 aula",
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Terça-feira, 10 de novembro" }),
      ).getByRole("button", { name: /10 de nov\. · 18:00 · Agendado/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Concluir encontro" }));
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Concluir encontro" }),
      ).not.toBeInTheDocument(),
    );
    await vi.waitFor(() =>
      expect(
        screen.getByLabelText("Profissional deste encontro"),
      ).toBeEnabled(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("heading", { name: "Novembro de 2026" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Terça-feira, 10 de novembro" }),
      ).getByRole("button", { name: /10 de nov\. · 18:00 · Concluído/ }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(([url]) => String(url))
        .filter((url) => url.includes("/groups/workspace?"))
        .at(-1),
    ).toContain("to=2027-02-15");
  });

  it("books an old credit into another group of the same service and displays it at the destination", async () => {
    setup();
    await openGroup(groupA.name);
    openOperations();
    fireEvent.change(screen.getByLabelText("Crédito de reposição"), {
      target: { value: data.replacementCredits[0]!.id },
    });
    const target = screen.getByLabelText("Encontro de reposição");
    expect(within(target).getAllByRole("option")).toHaveLength(8);
    expect(
      within(target).getByRole("option", {
        name: "Pilates Turma B · 20/10 · 18:00 · 3 vagas",
      }),
    ).toBeInTheDocument();
    expect(
      within(target).queryByRole("option", { name: /Dançaterapia/ }),
    ).not.toBeInTheDocument();
    expect(
      within(target).queryByRole("option", { name: /10\/10/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(target, { target: { value: targetB.id } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar reposição" }));
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Reservar reposição" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    await openGroup(groupB.name);
    openOperations();
    fireEvent.click(
      within(calendarGrid()).getByRole("button", { name: /20 de out\./ }),
    );
    expect(screen.getByRole("dialog", { name: groupB.name })).toHaveTextContent(
      "Ana Compartilhada · Reposição",
    );
  });

  it("opens the linked group and meeting, refreshes it, and closes only the upper modal", async () => {
    setup({ initialEntry: `/turmas?sessionId=${targetB.id}` });
    const meeting = await screen.findByRole("button", {
      name: "Concluir encontro",
    });
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);
    fireEvent.click(meeting);
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Concluir encontro" }),
      ).not.toBeInTheDocument(),
    );
    await vi.waitFor(() =>
      expect(
        screen.getByLabelText("Profissional deste encontro"),
      ).toBeEnabled(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    const dialog = screen.getByRole("dialog", { name: groupB.name });
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
    expect(
      within(dialog).getByRole("tab", { name: "Frequência e reposições" }),
    ).toHaveAttribute("aria-selected", "true");
    // O calendário abre no dia do encontro vinculado.
    expect(
      within(dialog).getByRole("button", {
        name: "Terça-feira, 20 de outubro, 1 aula",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(
        within(dialog).getByRole("region", {
          name: "Terça-feira, 20 de outubro",
        }),
      ).getByRole("button", { name: /Pilates Turma B.*Concluído/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("tab", { name: "Dados da turma" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Máximo de pessoas"), {
      target: { value: "5" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole("button", { name: "Abrir turma" })).toHaveLength(
      3,
    );
  });

  it("blocks closing and switching tabs while a replacement is being saved", async () => {
    let resolveWrite!: (response: Response) => void;
    setup({
      write: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    });
    const dialog = await openGroup(groupA.name);
    openOperations();
    fireEvent.change(screen.getByLabelText("Crédito de reposição"), {
      target: { value: data.replacementCredits[0]!.id },
    });
    fireEvent.change(screen.getByLabelText("Encontro de reposição"), {
      target: { value: targetB.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar reposição" }));
    expect(
      within(dialog).getByRole("tab", { name: "Dados da turma" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    await act(async () =>
      resolveWrite({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response),
    );
    await vi.waitFor(() =>
      expect(
        within(dialog).getByRole("tab", { name: "Dados da turma" }),
      ).toBeEnabled(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves read-only access inside both tabs", async () => {
    setup({ readOnly: true });
    await openGroup(groupA.name);
    expect(
      screen.queryByRole("button", { name: "Salvar alterações" }),
    ).not.toBeInTheDocument();
    openOperations();
    expect(
      screen.queryByRole("button", { name: "Reservar reposição" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(calendarGrid()).getAllByRole("button", {
        name: /Pilates Turma A/,
      })[0]!,
    );
    expect(
      screen.queryByRole("button", { name: "Concluir encontro" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Frequência de Ana Compartilhada"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Profissional deste encontro"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when only other groups have sessions", async () => {
    const workspace = structuredClone(data);
    workspace.sessions = workspace.sessions.filter(
      (item) => item.groupId !== groupA.id,
    );
    workspace.replacementCredits = workspace.replacementCredits.filter(
      (item) => item.sourceGroupId !== groupA.id,
    );
    setup({ workspace });
    await openGroup(groupA.name);
    openOperations();
    expect(screen.getByText("Nenhum encontro no período")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum crédito de reposição disponível"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pilates Turma B.*Agendado/ }),
    ).not.toBeInTheDocument();
  });
});
