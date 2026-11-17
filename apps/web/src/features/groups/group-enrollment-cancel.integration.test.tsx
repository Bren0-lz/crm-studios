import type { GroupClass, GroupWorkspace } from "@crm/contracts";
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

const clinicId = "11111111-1111-4111-8111-111111111111";
const group: GroupClass = {
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
  waitlistCount: 1,
  weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const activeId = "e1111111-1111-4111-8111-111111111111";
const waitlistedId = "e2222222-2222-4222-8222-222222222222";

function setup() {
  const workspace: GroupWorkspace = {
    groups: [group],
    enrollments: [
      {
        id: activeId,
        clinicId,
        groupId: group.id,
        patientId: "f1111111-1111-4111-8111-111111111111",
        patientName: "Ana Matriculada",
        status: "active",
        startsOn: "2026-09-01",
        enrolledAt: "2026-09-01T12:00:00Z",
        updatedAt: "2026-09-01T12:00:00Z",
      },
      {
        id: waitlistedId,
        clinicId,
        groupId: group.id,
        patientId: "f2222222-2222-4222-8222-222222222222",
        patientName: "Bia Espera",
        status: "waitlisted",
        queuePosition: 1,
        startsOn: "2026-09-01",
        enrolledAt: "2026-09-02T12:00:00Z",
        updatedAt: "2026-09-02T12:00:00Z",
      },
    ],
    sessions: [],
    attendance: [],
    replacementCredits: [],
  };
  const cancelled: string[] = [];
  let release: (() => void) | undefined;
  const hold = { enabled: false };
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
    const match = /\/group-enrollments\/([^/]+)\/cancel/.exec(url);
    if (options?.method === "POST" && match) {
      if (hold.enabled)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      const enrollment = workspace.enrollments.find(
        (item) => item.id === match[1],
      )!;
      cancelled.push(enrollment.id);
      enrollment.status = "cancelled";
      return {
        ok: true,
        status: 200,
        json: async () => enrollment,
      } as Response;
    }
    const body = url.includes("/groups/workspace")
      ? structuredClone(workspace)
      : url.includes("/rooms")
        ? [{ id: group.roomId, name: group.roomName, capacity: 10 }]
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
  return { cancelled, hold, release: () => release?.() };
}

async function openGroup() {
  const card = (await screen.findByText(group.name)).closest("article")!;
  fireEvent.click(within(card).getByRole("button", { name: "Abrir turma" }));
  return screen.getByRole("dialog", { name: group.name });
}

/** O modal da turma fica inerte sob a confirmação e volta a receber o foco ao fechá-la. */
function expectGroupBlocked(details: HTMLElement, blocked: boolean) {
  const backdrop = details.closest(".modal-backdrop")!;
  if (blocked) {
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveAttribute("inert");
  } else {
    expect(backdrop).not.toHaveAttribute("aria-hidden");
    expect(backdrop).not.toHaveAttribute("inert");
    expect(details).toContainElement(document.activeElement as HTMLElement);
  }
}

describe("cancelar matrícula em Turmas", () => {
  it("pede confirmação: Voltar não cancela e confirmar cancela", async () => {
    const { cancelled } = setup();
    const details = await openGroup();
    fireEvent.click(
      within(details).getByRole("button", {
        name: "Cancelar matrícula de Ana Matriculada",
      }),
    );
    let confirm = await screen.findByRole("dialog", {
      name: "Cancelar matrícula",
    });
    expect(confirm).toHaveTextContent(
      "Cancelar a matrícula de Ana Matriculada nesta turma?",
    );
    expect(confirm).toHaveTextContent(
      "A matrícula termina hoje e a vaga na turma fica livre.",
    );
    expectGroupBlocked(details, true);
    fireEvent.click(within(confirm).getByRole("button", { name: "Voltar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cancelar matrícula" }),
      ).not.toBeInTheDocument(),
    );
    expect(cancelled).toEqual([]);
    expect(within(details).getByText(/Ana Matriculada/)).toBeInTheDocument();
    expectGroupBlocked(details, false);

    // Esc fecha só a confirmação; a turma continua aberta e recebe o foco.
    fireEvent.click(
      within(details).getByRole("button", {
        name: "Cancelar matrícula de Ana Matriculada",
      }),
    );
    await screen.findByRole("dialog", { name: "Cancelar matrícula" });
    expectGroupBlocked(details, true);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cancelar matrícula" }),
      ).not.toBeInTheDocument(),
    );
    expect(details).toBeInTheDocument();
    expect(cancelled).toEqual([]);
    expectGroupBlocked(details, false);

    fireEvent.click(
      within(details).getByRole("button", {
        name: "Cancelar matrícula de Ana Matriculada",
      }),
    );
    confirm = await screen.findByRole("dialog", {
      name: "Cancelar matrícula",
    });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Cancelar matrícula" }),
    );
    await waitFor(() => expect(cancelled).toEqual([activeId]));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cancelar matrícula" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText("Matrícula de Ana cancelada."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(details).queryByText(/Ana Matriculada/),
      ).not.toBeInTheDocument(),
    );
    expectGroupBlocked(details, false);
  });

  it("trava Voltar durante o salvamento e explica a saída da espera", async () => {
    const { cancelled, hold, release } = setup();
    const details = await openGroup();
    fireEvent.click(
      within(details).getByRole("button", {
        name: "Cancelar matrícula de Bia Espera",
      }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Cancelar matrícula",
    });
    expect(confirm).toHaveTextContent(
      "Tirar Bia Espera da lista de espera desta turma?",
    );
    hold.enabled = true;
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Cancelar matrícula" }),
    );
    await waitFor(() =>
      expect(
        within(confirm).getByRole("button", { name: "Voltar" }),
      ).toBeDisabled(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("dialog", { name: "Cancelar matrícula" }),
    ).toBeInTheDocument();
    expectGroupBlocked(details, true);
    release();
    await waitFor(() => expect(cancelled).toEqual([waitlistedId]));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cancelar matrícula" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expectGroupBlocked(details, false));
  });
});
