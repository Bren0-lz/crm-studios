import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("edits group capacity and weekly hours in a centered modal", async () => {
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
      serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      capacity: 4,
      activeEnrollments: 2,
      waitlistCount: 0,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
      active: true,
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body =
        options?.method === "PUT"
          ? { ...group, capacity: 5 }
          : url.includes("/groups/workspace?")
            ? {
                groups: [group],
                enrollments: [],
                sessions: [],
                attendance: [],
                replacementCredits: [],
              }
            : url.includes("/rooms")
              ? [{ id: group.roomId, name: group.roomName, capacity: 8 }]
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
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Serviço"), {
      target: { value: group.serviceId },
    });
    expect(screen.getByText("Pilates Turma B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.getByText("Turma de terça da noite")).toBeInTheDocument();
    expect(screen.getByText("Terça · 18:00–19:00")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    const dialog = screen.getByRole("dialog", { name: "Pilates Turma A" });
    expect(dialog).toHaveClass("modal-wide");
    expect(
      within(dialog).getByRole("heading", { name: "Participantes" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Máximo de pessoas"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar horário" }));
    fireEvent.change(screen.getAllByLabelText("Dia")[1]!, {
      target: { value: "4" },
    });
    fireEvent.change(screen.getAllByLabelText("Término")[1]!, {
      target: { value: "10:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PUT");
      expect(call?.[0]).toContain(`/groups/${group.id}`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        capacity: 5,
        weeklySlots: [
          { weekday: 2, startTime: "18:00", endTime: "19:00" },
          { weekday: 4, startTime: "09:00", endTime: "10:30" },
        ],
      });
    });
  });
});
