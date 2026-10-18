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
  capacity: 4,
  activeEnrollments: 1,
  waitlistCount: 0,
  weeklySlots: [
    { weekday: 2, startTime: "18:00", endTime: "19:00" },
    { weekday: 4, startTime: "18:00", endTime: "19:00" },
  ],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const sessionId = {
  "2026-10-13": "51111111-1111-4111-8111-111111111111",
  "2026-10-15": "52222222-2222-4222-8222-222222222222",
  "2026-10-20": "53333333-3333-4333-8333-333333333333",
  "2026-10-22": "54444444-4444-4444-8444-444444444444",
};
const session = (date: keyof typeof sessionId) => ({
  id: sessionId[date],
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
const bruna = "f1111111-1111-4111-8111-111111111111";
const replacement = (
  index: number,
  date: keyof typeof sessionId,
  outcome: string,
) => ({
  id: `a${index}111111-1111-4111-8111-111111111111`,
  clinicId,
  sessionId: sessionId[date],
  patientId: `f${index}222222-2222-4222-8222-222222222222`,
  patientName: `Cliente ${index}`,
  status: "replacement",
  outcome,
  accountingEnabled: true,
  recordedAt: "2026-10-10T12:00:00Z",
});
const credit = {
  id: "c1111111-1111-4111-8111-111111111111",
  clinicId,
  patientId: bruna,
  patientName: "Bruna Souza",
  sourceSessionId: sessionId["2026-10-13"],
  status: "available",
  createdAt: "2026-10-13T22:00:00Z",
};
const workspace = (credits: unknown[]) => ({
  groups: [group],
  enrollments: [
    {
      id: "e1111111-1111-4111-8111-111111111111",
      clinicId,
      groupId: group.id,
      patientId: bruna,
      patientName: "Bruna Souza",
      status: "active",
      enrolledAt: "2026-10-01T12:00:00Z",
      startsOn: "2026-10-01",
      updatedAt: "2026-10-01T12:00:00Z",
    },
    {
      id: "e2222222-2222-4222-8222-222222222222",
      clinicId,
      groupId: group.id,
      patientId: "f2222222-2222-4222-8222-222222222222",
      patientName: "Carla Antiga",
      status: "cancelled",
      enrolledAt: "2026-10-01T12:00:00Z",
      startsOn: "2026-10-01",
      endedOn: "2026-10-16",
      updatedAt: "2026-10-16T12:00:00Z",
    },
  ],
  sessions: [
    session("2026-10-13"),
    session("2026-10-15"),
    session("2026-10-20"),
    session("2026-10-22"),
  ],
  // 20/10: reposição cancelada não ocupa vaga. 22/10: Bruna + 3 reposições = lotado.
  attendance: [
    replacement(1, "2026-10-20", "cancelled"),
    replacement(2, "2026-10-22", "scheduled"),
    replacement(3, "2026-10-22", "scheduled"),
    replacement(4, "2026-10-22", "scheduled"),
  ],
  replacementCredits: credits,
});

function renderGroups(
  credits: unknown[],
  book: () => { ok: boolean; status: number; body: unknown } = () => ({
    ok: true,
    status: 200,
    body: {
      attendance: replacement(5, "2026-10-20", "scheduled"),
      credit: { ...credit, status: "used" },
    },
  }),
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
    if (options?.method === "POST" && url.includes("/group-replacements/book")) {
      const result = book();
      return {
        ok: result.ok,
        status: result.status,
        json: async () => result.body,
      } as Response;
    }
    const body = url.includes("/groups/workspace?") ? workspace(credits) : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // 18/10/2026 ao meio-dia em São Paulo: 13/10 e 15/10 já passaram.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("replacement booking", () => {
  it("offers only future sessions with seats, other than the source, and confirms with a toast", async () => {
    renderGroups([credit]);
    fireEvent.change(await screen.findByLabelText("Crédito de reposição"), {
      target: { value: credit.id },
    });
    const target = screen.getByLabelText("Encontro de reposição");
    expect(
      within(target)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Selecione", "20/10 · 18:00 · 3 vagas"]);
    fireEvent.change(target, { target: { value: sessionId["2026-10-20"] } });
    fireEvent.click(screen.getByRole("button", { name: "Reservar reposição" }));
    const toast = await vi.waitFor(() => {
      const found = document.querySelector(".toast-success");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(toast).toHaveTextContent("Reposição de Bruna marcada para 20/10");
    expect(document.querySelector(".success-banner")).toHaveTextContent(
      "Reposição de Bruna marcada para 20/10",
    );
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      creditId: credit.id,
      sessionId: sessionId["2026-10-20"],
    });
  });

  it("shows the API error inline and in a toast", async () => {
    renderGroups([credit], () => ({
      ok: false,
      status: 409,
      body: {
        code: "GROUP_SESSION_FULL",
        message: "A sessão está lotada.",
      },
    }));
    fireEvent.change(await screen.findByLabelText("Crédito de reposição"), {
      target: { value: credit.id },
    });
    fireEvent.change(screen.getByLabelText("Encontro de reposição"), {
      target: { value: sessionId["2026-10-20"] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar reposição" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A sessão está lotada.",
    );
    expect(document.querySelector(".form-error")).toHaveTextContent(
      "A sessão está lotada.",
    );
  });

  it("shows an empty state when there is no replacement credit", async () => {
    renderGroups([{ ...credit, status: "used" }]);
    expect(
      await screen.findByText("Nenhum crédito de reposição disponível"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Crédito de reposição"),
    ).not.toBeInTheDocument();
  });
});
