import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const serviceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const group = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Pilates Turma A",
  sequence: 1,
  serviceId,
  serviceName: "Pilates",
  professionalName: "Dra. Ana Martins",
  roomName: "Sala Movimento",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  capacity: 4,
  activeEnrollments: 2,
  waitlistCount: 0,
  weeklySlots: [
    { weekday: 1, startTime: "08:00", endTime: "09:00" },
    { weekday: 3, startTime: "08:00", endTime: "09:00" },
  ],
  active: true,
};
const enrollment = (id: string, patientId: string, patientName: string) => ({
  id,
  groupId: group.id,
  patientId,
  patientName,
  status: "active",
  enrolledAt: "2026-01-05T12:00:00.000Z",
  startsOn: "2026-01-05",
  updatedAt: "2026-01-05T12:00:00.000Z",
});
const plan = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  patientId: "11111111-1111-4111-8111-111111111111",
  patientName: "Helena Almeida",
  name: "Pilates 2x por semana",
  status: "active",
  validFrom: "2020-01-01",
  validUntil: "",
  services: [
    {
      serviceId,
      serviceName: "Pilates",
      totalSessions: 8,
      totalValueInCents: 40000,
      remainingSessions: 8,
    },
  ],
};

function renderGroups(role: "owner" | "reception" = "owner") {
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
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/groups/workspace?")
      ? {
          groups: [group],
          enrollments: [
            enrollment(
              "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
              plan.patientId,
              plan.patientName,
            ),
            enrollment(
              "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
              "33333333-3333-4333-8333-333333333333",
              "Marina Souza",
            ),
          ],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        }
      : url.includes("/plans?")
        ? [plan]
        : url.includes("/services")
          ? [{ id: serviceId, name: "Pilates", priceInCents: 7000 }]
          : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("groups overview tab", () => {
  it("tabulates schedule, seats and monthly revenue of every group", async () => {
    renderGroups();
    fireEvent.click(await screen.findByRole("tab", { name: "Visão geral" }));
    const table = await screen.findByRole("table", {
      name: "Visão geral das turmas",
    });
    expect(
      within(table).getByRole("columnheader", { name: "Faturamento atual" }),
    ).toBeInTheDocument();
    const row = within(table)
      .getByText("Pilates Turma A")
      .closest("tr") as HTMLElement;
    expect(row).toHaveTextContent(
      "Segunda · 08:00–09:00, Quarta · 08:00–09:00",
    );
    expect(row).toHaveTextContent("2 de 4");
    // Plano de R$ 400 por 8 sessões × 8 encontros no mês; Marina não tem plano.
    // Potencial: 2 vagas × ticket médio de R$ 400.
    const cells = within(row).getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("2");
    expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument();
    expect(cells[3]).toHaveTextContent("R$ 400,00");
    expect(cells[4]).toHaveTextContent("R$ 1.200,00");
    expect(
      screen.queryByRole("button", { name: "Abrir turma" }),
    ).not.toBeInTheDocument();
  });

  it("lists the enrolled clients of a group without leaving the tab", async () => {
    renderGroups();
    fireEvent.click(await screen.findByRole("tab", { name: "Visão geral" }));
    const toggle = await screen.findByRole("button", {
      name: "Ver matriculados de Pilates Turma A: 2 de 4",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const members = screen.getByRole("list", {
      name: "Matriculados de Pilates Turma A",
    });
    const items = within(members).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Helena Almeida");
    expect(items[0]).toHaveTextContent("Desde 05 de jan.");
    expect(items[0]).toHaveTextContent("R$ 400,00/mês");
    expect(items[1]).toHaveTextContent("Marina Souza");
    expect(items[1]).toHaveTextContent("Sem plano ativo");
    expect(screen.getByRole("tab", { name: "Visão geral" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ocultar matriculados de Pilates Turma A: 2 de 4",
      }),
    );
    expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument();
  });
});
