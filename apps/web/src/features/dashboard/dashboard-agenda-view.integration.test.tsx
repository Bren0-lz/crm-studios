import type {
  DashboardViewSummary,
  GroupSession,
  PermissionKey,
} from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { localIsoDate } from "../../shared/lib/formatting";
import "../../test-support/legacy-setup";

const userId = "55555555-5555-4555-8555-555555555555";

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const session: GroupSession = {
  id: "s1",
  clinicId: "clinic",
  groupId: "g1",
  groupName: "Pilates da Rita",
  professionalId: "p3",
  professionalName: "Rita",
  roomId: "room",
  roomName: "Sala 2",
  startsAt: todayAt(9),
  endsAt: todayAt(10),
  status: "scheduled",
  attendanceCount: 0,
  createdAt: todayAt(0),
};

function renderDashboard(permissions: PermissionKey[]) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    JSON.stringify({
      id: userId,
      fullName: "Carla Consulta",
      email: "carla@movimenta.local",
      role: "user",
      modules: ["agenda"],
      editModules: [],
      permissions,
    }),
  );
  const summary: DashboardViewSummary = {
    date: localIsoDate(),
    appointmentsToday: 0,
    nonCancelledAppointmentsToday: 0,
    pendingToday: 0,
    awaitingConfirmationToday: 0,
    completedToday: 0,
    noShowsThisMonth: 0,
    nextAppointments: [],
  };
  const dashboardUrls: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/dashboard")) dashboardUrls.push(url);
    const body = url.includes("/dashboard")
      ? summary
      : url.includes("/group-sessions")
        ? [session]
        : url.includes("/professionals")
          ? [
              {
                id: "p1",
                fullName: "Clara Mendes",
                color: "#9a6bc4",
                active: true,
              },
              {
                id: "p2",
                fullName: "Bia Souza",
                color: "#3f7fbf",
                active: true,
              },
              {
                id: "p3",
                fullName: "Rita Lima",
                color: "#c96f50",
                active: true,
              },
              {
                id: "p4",
                fullName: "Inativa",
                color: "#748079",
                active: false,
              },
            ]
          : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  return dashboardUrls;
}

describe("visualização da agenda no início", () => {
  it("escolhe profissionais específicos num modal e volta para todos", async () => {
    localStorage.removeItem(`crm.dashboard.agendaProfessionals.${userId}`);
    const urls = renderDashboard(["agenda.view", "agenda.view_all"]);
    expect(await screen.findByText("Pilates da Rita")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Visualização da agenda: Todos os profissionais",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Escolher profissionais" }),
    );
    expect(
      within(dialog).queryByRole("button", { name: "Inativa" }),
    ).not.toBeInTheDocument();
    const apply = within(dialog).getByRole("button", { name: "Aplicar" });
    expect(apply).toBeDisabled();
    const clara = within(dialog).getByRole("button", { name: "Clara Mendes" });
    fireEvent.click(clara);
    fireEvent.click(within(dialog).getByRole("button", { name: "Bia Souza" }));
    expect(clara).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("2 selecionados")).toBeInTheDocument();
    fireEvent.click(apply);

    expect(
      await screen.findByText("Mostrando: 2 profissionais"),
    ).toBeInTheDocument();
    expect(urls.at(-1)).toContain("professionalIds=p1,p2");
    // Aula de outra profissional sai da "Agenda de hoje".
    expect(screen.queryByText("Pilates da Rita")).not.toBeInTheDocument();
    expect(
      localStorage.getItem(`crm.dashboard.agendaProfessionals.${userId}`),
    ).toBe(JSON.stringify(["p1", "p2"]));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Visualização da agenda: 2 profissionais",
      }),
    );
    const again = await screen.findByRole("dialog");
    fireEvent.click(
      within(again).getByRole("button", { name: "Todos os profissionais" }),
    );
    fireEvent.click(within(again).getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByText("Pilates da Rita")).toBeInTheDocument();
    expect(urls.at(-1)).not.toContain("professionalIds");
    expect(screen.queryByText(/^Mostrando:/)).not.toBeInTheDocument();
  });

  it("sem 'ver agenda de todos' não mostra a escolha", async () => {
    renderDashboard(["agenda.view"]);
    expect(await screen.findByText("Agenda de hoje")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Visualização da agenda/ }),
    ).not.toBeInTheDocument();
  });
});
