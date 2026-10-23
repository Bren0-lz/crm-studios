import type { DashboardViewSummary, GroupSession } from "@crm/contracts";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { localIsoDate } from "../../shared/lib/formatting";
import "../../test-support/legacy-setup";

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function session(
  id: string,
  groupName: string,
  hour: number,
  status: GroupSession["status"] = "scheduled",
): GroupSession {
  return {
    id,
    clinicId: "clinic",
    groupId: `group-${id}`,
    groupName,
    professionalId: "professional",
    professionalName: "Carla",
    roomId: "room",
    roomName: "Sala 2",
    startsAt: todayAt(hour),
    endsAt: todayAt(hour + 1),
    status,
    attendanceCount: 0,
    createdAt: todayAt(0),
  };
}

describe("dashboard group sessions", () => {
  function renderDashboard(sessions: GroupSession[] | "error") {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["agenda", "groups"],
        editModules: [],
      }),
    );
    const summary: DashboardViewSummary = {
      date: localIsoDate(),
      appointmentsToday: 1,
      nonCancelledAppointmentsToday: 1,
      pendingToday: 1,
      awaitingConfirmationToday: 1,
      completedToday: 0,
      noShowsThisMonth: 0,
      nextAppointments: [
        {
          id: "a1",
          clinicId: "clinic",
          patientId: "patient",
          professionalId: "professional",
          roomId: "room",
          serviceId: "service",
          visitType: "regular",
          patientName: "Bruno Souza",
          serviceName: "Pilates",
          professionalName: "Carla",
          professionalColor: "#26705f",
          roomName: "Sala 1",
          status: "scheduled",
          startsAt: todayAt(10),
          endsAt: todayAt(11),
          createdAt: todayAt(0),
        } as NonNullable<DashboardViewSummary["nextAppointments"]>[number],
      ],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/group-sessions") && sessions === "error")
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: "Falha" }),
        } as Response;
      const body = url.includes("/dashboard")
        ? summary
        : url.includes("/group-sessions")
          ? sessions
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("lists today's group classes with the appointments, in time order", async () => {
    renderDashboard([
      session("s1", "Pilates em grupo", 9),
      session("s2", "Dançaterapia", 15, "completed"),
      session("s3", "Turma cancelada", 12, "cancelled"),
    ]);
    const first = await screen.findByText("Pilates em grupo");
    const list = first.closest(".appointment-list") as HTMLElement;
    const rows = within(list).getAllByText(
      /Pilates em grupo|Bruno Souza|Dançaterapia/,
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      "Pilates em grupo",
      "Bruno Souza",
      "Dançaterapia",
    ]);
    expect(screen.queryByText("Turma cancelada")).not.toBeInTheDocument();
    expect(
      within(list).getAllByText(/^Aula em grupo · Carla · Sala 2$/),
    ).toHaveLength(2);
    expect(within(list).getByText("Realizada")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir encontro de Pilates em grupo" }),
    ).toHaveAttribute("href", "/turmas?sessionId=s1");
  });

  it("warns when today's group classes cannot be loaded", async () => {
    renderDashboard("error");
    expect(
      await screen.findByText(
        "Não foi possível carregar as aulas de turma de hoje.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
  });
});
