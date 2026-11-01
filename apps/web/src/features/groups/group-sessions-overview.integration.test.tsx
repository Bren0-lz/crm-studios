import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
const enrollment = (index: number, patientName: string, status = "active") => ({
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
  attendance: (url: string) => {
    ok: boolean;
    status: number;
    body: unknown;
  } = (url) => ({
    ok: true,
    status: 200,
    body: { id: url, status: "present" },
  }),
  workspaceFor: (url: string) => Promise<Response> | undefined = () =>
    undefined,
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
    const custom = url.includes("/groups/workspace?")
      ? workspaceFor(url)
      : undefined;
    if (custom) return custom;
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

async function openOperations() {
  fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
  fireEvent.click(screen.getByRole("tab", { name: "Frequência e reposições" }));
}

const attendanceCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url, options]) =>
        options?.method === "PUT" && String(url).includes("/attendance/"),
    );

const calendarGrid = () => screen.getByRole("table", { name: /^Aulas de / });
const calendarSessions = () =>
  within(calendarGrid())
    .getAllByRole("button", { name: /Pilates Turma A ·/ })
    .map(
      (item) => item.getAttribute("aria-label")?.match(/\d{2} de \w+\./)?.[0],
    );
const workspaceCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([url]) => String(url))
    .filter((url) => url.includes("/groups/workspace?"));
const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

async function openSession(name: RegExp) {
  fireEvent.click(
    within(await screen.findByRole("table", { name: /^Aulas de / })).getByRole(
      "button",
      { name },
    ),
  );
}

beforeEach(() => {
  // 18/10/2026 ao meio-dia em São Paulo.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("group sessions overview", () => {
  it("shows only the groups outside the modal, with clear seat counts", async () => {
    renderGroups();
    const row = (
      await screen.findByRole("button", { name: "Abrir turma" })
    ).closest("tr")!;
    expect(row).toHaveTextContent("3 de 5");
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("2");
    expect(row).not.toHaveTextContent("3/5 vagas");
    expect(
      screen.queryByRole("heading", {
        name: "Frequência e reposições",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Próximas" }),
    ).not.toBeInTheDocument();
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
    const slots = within(summary).getAllByRole("listitem");
    expect(slots).toHaveLength(2);
    expect(slots[0]).toHaveTextContent("Terça 18:00–19:00");
    expect(slots[1]).toHaveTextContent("Quinta 18:00–19:00");
    expect(summary).toHaveTextContent("3 matriculados · 2 vagas livres");
  });

  it("shows a monthly calendar of the group, starting today, with the day's classes below", async () => {
    renderGroups();
    await openOperations();
    expect(
      await screen.findByRole("heading", { name: "Outubro de 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Próximas" }),
    ).not.toBeInTheDocument();
    // Grade de 28/09 a 01/11: só os encontros de outubro aparecem.
    expect(calendarSessions()).toEqual([
      "01 de out.",
      "03 de out.",
      "06 de out.",
      "08 de out.",
      "13 de out.",
      "15 de out.",
      "18 de out.",
      "20 de out.",
      "22 de out.",
      "27 de out.",
      "29 de out.",
    ]);
    const todayButton = within(calendarGrid()).getByRole("button", {
      name: "Domingo, 18 de outubro, hoje, 1 aula",
    });
    expect(todayButton).toHaveAttribute("aria-current", "date");
    expect(todayButton).toHaveAttribute("aria-pressed", "true");
    expect(
      within(calendarGrid()).getByRole("button", {
        name: "Pilates Turma A · 18 de out. · 08:00 · Agendado",
      }),
    ).toHaveTextContent("08:00Agendado");
    const day = screen.getByRole("region", {
      name: "Domingo, 18 de outubro · hoje",
    });
    expect(
      within(day).getByRole("button", {
        name: "Pilates Turma A · 18 de out. · 08:00 · Agendado",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(calendarGrid()).getByRole("button", {
        name: "Segunda-feira, 19 de outubro, sem aulas",
      }),
    );
    expect(
      within(
        screen.getByRole("region", { name: "Segunda-feira, 19 de outubro" }),
      ).getByText("Nenhuma aula neste dia."),
    ).toBeInTheDocument();
    expect(todayButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(
      await screen.findByRole("table", { name: "Aulas de Novembro de 2026" }),
    ).toBeInTheDocument();
    // A grade de novembro começa em 26/10: esses dias aparecem esmaecidos.
    expect(calendarSessions()).toEqual([
      "27 de out.",
      "29 de out.",
      "03 de nov.",
      "05 de nov.",
    ]);
    expect(
      screen.getByRole("region", { name: "Domingo, 1 de novembro" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(
      await screen.findByRole("region", {
        name: "Domingo, 18 de outubro · hoje",
      }),
    ).toBeInTheDocument();
  });

  it("loads historical months with their whole grid and shows an empty month", async () => {
    renderGroups();
    await openOperations();
    await screen.findByRole("table", { name: "Aulas de Outubro de 2026" });
    for (const month of ["Setembro", "Agosto", "Julho"]) {
      fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
      await screen.findByRole("table", { name: `Aulas de ${month} de 2026` });
    }
    expect(workspaceCalls().at(-1)).toContain(
      "from=2026-06-28T00%3A00%3A00.000Z",
    );
    expect(screen.getByText("Nenhum encontro no período")).toBeInTheDocument();
    // Indicadores gerais continuam no recorte operacional da página.
    expect(
      screen.getByText("Encontros", { selector: "span" }).closest("div"),
    ).toHaveTextContent("13");
  });

  it("ignores stale responses when navigating quickly and retries a failed month", async () => {
    const sessionOn = (date: string) => ({
      ...session(date),
      id: sessionId(date).replace(/^5/, "6"),
    });
    let resolveSeptember!: (response: Response) => void;
    let failAugust = true;
    renderGroups(undefined, (url) => {
      // Setembro (grade a partir de 31/08) responde por último, com dados velhos.
      if (url.includes("from=2026-08-30"))
        return new Promise((resolve) => {
          resolveSeptember = resolve;
        });
      if (url.includes("from=2026-07-26")) {
        if (failAugust) {
          failAugust = false;
          return Promise.resolve(
            json({ code: "BOOM", message: "Falha ao consultar." }, 500),
          );
        }
        return Promise.resolve(
          json({ ...workspace, sessions: [sessionOn("2026-08-04")] }),
        );
      }
      return undefined;
    });
    await openOperations();
    await screen.findByRole("table", { name: "Aulas de Outubro de 2026" });
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(
      screen.getByRole("status", {
        name: "Carregando aulas de Setembro de 2026",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(
      await screen.findByText(
        /Não foi possível carregar Agosto de 2026: Falha ao consultar\./,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("table", { name: "Aulas de Agosto de 2026" });
    await act(async () =>
      resolveSeptember(
        json({ ...workspace, sessions: [sessionOn("2026-08-11")] }),
      ),
    );
    expect(calendarSessions()).toEqual(["04 de ago."]);
    expect(
      screen.queryByRole("button", { name: /11 de ago\./ }),
    ).not.toBeInTheDocument();
  });

  it("places each class on the clinic's date and supports keyboard navigation across months", async () => {
    renderGroups(undefined, () =>
      Promise.resolve(
        json({
          ...workspace,
          sessions: [
            ...workspace.sessions,
            // 22:30 de 31/10 em São Paulo já é 01/11 em UTC.
            {
              ...session("2026-10-31"),
              id: "6aaaaaaa-1111-4111-8111-111111111111",
              startsAt: "2026-11-01T01:30:00Z",
              endsAt: "2026-11-01T02:30:00Z",
            },
          ],
        }),
      ),
    );
    await openOperations();
    const lastDay = await screen.findByRole("button", {
      name: "Sábado, 31 de outubro, 1 aula",
    });
    expect(
      within(calendarGrid()).getByRole("button", {
        name: /^Pilates Turma A · \d{2} de \w+\. · 22:30 · Agendado$/,
      }),
    ).toBeInTheDocument();
    fireEvent.click(lastDay);
    fireEvent.keyDown(lastDay, { key: "ArrowRight" });
    await screen.findByRole("table", { name: "Aulas de Novembro de 2026" });
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Domingo, 1 de novembro/ }),
      ).toHaveFocus(),
    );
  });

  it("marks every current participant without a record as present, after confirming", async () => {
    renderGroups();
    await openOperations();
    await openSession(/18 de out\./);
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
    // A atualização após gravar mantém o mês e o dia escolhidos.
    expect(
      screen.getByRole("button", {
        name: /^Domingo, 18 de outubro, hoje/,
        hidden: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    const calls = attendanceCalls();
    expect(calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining(
        `/group-sessions/${today}/attendance/${patient(1)}`,
      ),
      expect.stringContaining(
        `/group-sessions/${today}/attendance/${patient(2)}`,
      ),
    ]);
    for (const [, options] of calls)
      expect(JSON.parse(String(options?.body))).toEqual({ status: "present" });
    expect(
      screen.queryByRole("dialog", { name: "Marcar todos presentes" }),
    ).not.toBeInTheDocument();
  });

  it("keeps 'Marcar todos presentes' disabled with a hint before the session starts", async () => {
    renderGroups();
    await openOperations();
    await openSession(/20 de out\./);
    const meeting = screen.getByRole("dialog", { name: group.name });
    const button = within(meeting).getByRole("button", {
      name: "Marcar todos presentes",
    });
    expect(button).toBeDisabled();
    // QC3: 15 min antes do início (18:00 → 17:45, fuso da clínica).
    expect(button).toHaveAccessibleDescription(
      "Disponível a partir de 20/10 às 17:45",
    );
    expect(
      within(meeting).getByText("Disponível a partir de 20/10 às 17:45"),
    ).toBeInTheDocument();
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
    await openOperations();
    await openSession(/18 de out\./);
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
