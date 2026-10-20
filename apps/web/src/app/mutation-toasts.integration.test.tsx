import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import App from "../App";
import { storedUser } from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";

/** QM13: toda gravação confirma com um aviso (toast) de sucesso, com nome neutro em gênero. */
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
const enrolled = {
  id: "e1111111-1111-4111-8111-111111111111",
  clinicId,
  groupId: group.id,
  patientId: "f1111111-1111-4111-8111-111111111111",
  patientName: "Ana Nova",
  status: "active",
  enrolledAt: "2026-10-01T12:00:00Z",
  startsOn: "2026-10-01",
  updatedAt: "2026-10-01T12:00:00Z",
};
const workspace = {
  groups: [group],
  enrollments: [enrolled],
  sessions: [
    {
      id: "52222222-2222-4222-8222-222222222222",
      clinicId,
      groupId: group.id,
      groupName: group.name,
      professionalId: group.professionalId,
      professionalName: group.professionalName,
      roomId: group.roomId,
      roomName: group.roomName,
      startsAt: "2026-10-14T18:00:00-03:00",
      endsAt: "2026-10-14T19:00:00-03:00",
      status: "scheduled",
      attendanceCount: 0,
      createdAt: "2026-09-01T12:00:00Z",
    },
  ],
  attendance: [],
  replacementCredits: [],
};

function login(role = "owner") {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role,
    }),
  );
}

async function successToast(text: string) {
  const message = await screen.findByText(text);
  expect(message.closest(".toast")).toHaveClass("toast-success");
  return message;
}

function renderGroups(enrollmentResponse: Record<string, unknown>) {
  login();
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = String(input);
    const body =
      options?.method === "POST" && url.includes("/group-enrollments")
        ? enrollmentResponse
        : options?.method === "POST"
          ? {}
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

async function enrollHelena() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Matricular cliente" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Nova matrícula" });
  fireEvent.change(within(dialog).getByLabelText("Turma"), {
    target: { value: group.id },
  });
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Cliente" }), {
    target: { value: "Helena Almeida" },
  });
  fireEvent.click(
    await within(dialog).findByRole("option", { name: "Helena Almeida" }),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Matricular" }));
}

describe("toasts de sucesso nas gravações", () => {
  it("confirms a group enrollment with the client's first name and the group", async () => {
    renderGroups({
      ...enrolled,
      id: "e3333333-3333-4333-8333-333333333333",
      patientId: "f3333333-3333-4333-8333-333333333333",
      patientName: "Helena Almeida",
    });
    await enrollHelena();
    await successToast("Matrícula de Helena confirmada em Pilates Turma A.");
  });

  it("tells when the enrollment went to the waitlist", async () => {
    renderGroups({
      ...enrolled,
      id: "e3333333-3333-4333-8333-333333333333",
      patientId: "f3333333-3333-4333-8333-333333333333",
      patientName: "Helena Almeida",
      status: "waitlisted",
      queuePosition: 2,
    });
    await enrollHelena();
    await successToast(
      "Helena entrou na lista de espera em Pilates Turma A (posição 2).",
    );
  });

  it("confirms attendance recorded in a group session", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T22:30:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    renderGroups({});
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    fireEvent.click(screen.getByRole("tab", { name: "Frequência e reposições" }));
    fireEvent.click(
      within(
        await screen.findByRole("table", { name: "Aulas de Outubro de 2026" }),
      ).getByRole("button", { name: /14 de out\./ }),
    );
    const dialog = screen.getByRole("dialog", { name: group.name });
    fireEvent.change(within(dialog).getByLabelText("Frequência de Ana Nova"), {
      target: { value: "present" },
    });
    await successToast("Frequência de Ana registrada.");
  });

  it("confirms the NPS answer with the score", async () => {
    login("reception");
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.includes("/satisfaction") && options?.method === "POST")
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "s-1",
            clinicId,
            patientName: appointment.patientName,
            actorUserId: "u-1",
            createdAt: new Date().toISOString(),
            ...(JSON.parse(String(options.body)) as object),
          }),
        } as Response;
      const body =
        url.includes("/appointments?") || url.includes("/appointments/options?")
          ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar satisfação" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Nota 9" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar avaliação" }));
    await successToast("Avaliação de Helena registrada: nota 9.");
  });
});
