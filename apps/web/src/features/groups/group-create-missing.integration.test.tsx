import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const service = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Pilates" };
const professional = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  fullName: "Dra. Ana Martins",
};
const room = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Sala Movimento",
  capacity: 8,
};

describe("creating a group (QM14)", () => {
  it("keeps 'Criar turma' disabled listing what is missing until everything is filled", async () => {
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
        : url.includes("/rooms")
          ? [room]
          : url.includes("/services")
            ? [service]
            : url.includes("/professionals")
              ? [professional]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova turma" });
    const create = within(dialog).getByRole("button", { name: "Criar turma" });
    expect(create).toBeDisabled();
    expect(create).toHaveAccessibleDescription(
      "Falta: Serviço, Profissional, Sala, Horários semanais.",
    );
    fireEvent.change(await within(dialog).findByLabelText("Serviço"), {
      target: { value: service.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Profissional"), {
      target: { value: professional.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Sala"), {
      target: { value: room.id },
    });
    expect(create).toBeDisabled();
    expect(create).toHaveAccessibleDescription("Falta: Horários semanais.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar horário" }),
    );
    expect(create).toBeEnabled();
    expect(create).not.toHaveAttribute("aria-describedby");
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });

  it("keeps 'Matricular' disabled listing the group and the client", async () => {
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
    const group = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Pilates Turma A",
      sequence: 1,
      serviceId: service.id,
      serviceName: service.name,
      professionalName: professional.fullName,
      roomName: room.name,
      roomId: room.id,
      capacity: 4,
      activeEnrollments: 2,
      waitlistCount: 0,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
      active: true,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/groups/workspace?")
        ? {
            groups: [group],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      (
        await screen.findAllByRole("button", { name: /Matricular cliente/ })
      )[0]!,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    const enroll = within(dialog).getByRole("button", { name: "Matricular" });
    expect(enroll).toBeDisabled();
    expect(enroll).toHaveAccessibleDescription("Falta: Turma, Cliente.");
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    expect(enroll).toBeDisabled();
    expect(enroll).toHaveAccessibleDescription("Falta: Cliente.");
  });

  it("keeps 'Salvar alterações' of a group disabled without weekly hours", async () => {
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
    const group = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Pilates Turma A",
      sequence: 1,
      serviceId: service.id,
      serviceName: service.name,
      professionalName: professional.fullName,
      roomName: room.name,
      roomId: room.id,
      capacity: 4,
      activeEnrollments: 2,
      waitlistCount: 0,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
      active: true,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/groups/workspace?")
        ? {
            groups: [group],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : url.includes("/rooms")
          ? [room]
          : url.includes("/services")
            ? [service]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    const dialog = screen.getByRole("dialog", { name: "Pilates Turma A" });
    const save = within(dialog).getByRole("button", {
      name: "Salvar alterações",
    });
    expect(save).toBeEnabled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remover horário 1" }),
    );
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("Falta: Horários semanais.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar horário" }),
    );
    expect(save).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });
});
