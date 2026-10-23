import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import "../../test-support/legacy-setup";
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

describe("view-only modules", () => {
  it("shows appointment details without cancel, reschedule or satisfaction when the agenda is view-only", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["agenda", "patients"],
        editModules: [],
      }),
    );
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const base = {
      patientId: "99999999-9999-4999-8999-999999999999",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
    };
    const scheduled = {
      ...base,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      status: "scheduled",
    };
    const completed = {
      ...base,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      patientName: "Bruno Costa",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body =
        url.includes("/appointments?") || url.includes("/appointments/options?")
          ? [scheduled, completed]
          : url.includes("/satisfaction")
            ? { surveys: [] }
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("note")).toHaveTextContent(
      "Seu acesso a Agenda é só de consulta",
    );
    expect(
      screen.queryByRole("button", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Bloquear horário" }),
    ).not.toBeInTheDocument();
    expect(
      (await screen.findAllByLabelText("Status do atendimento"))[0],
    ).toBeDisabled();

    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    let dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Sala Movimento", { exact: false }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Cancelar atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Remarcar atendimento" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Detalhes de Bruno Costa" }),
    );
    dialog = screen.getByRole("dialog");
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("/satisfaction")),
      ).toBe(true),
    );
    expect(
      within(dialog).queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, init]) => init?.method && init.method !== "GET"),
    ).toBe(false);
  });

  it("shows the CRM history without lead actions or activity forms when the CRM is view-only", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["crm"],
        editModules: [],
      }),
    );
    const lead = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Bruna Lead",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "contacted",
      tags: [],
      openTasks: 1,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const activity = {
      tasks: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          clinicId: lead.clinicId,
          leadId: lead.id,
          title: "Ligar de volta",
          dueAt: "2026-10-05T12:00:00.000Z",
          status: "open",
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        },
      ],
      contacts: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          clinicId: lead.clinicId,
          leadId: lead.id,
          channel: "phone",
          direction: "outbound",
          notes: "Pediu horários à noite",
          actorName: "Joana",
          occurredAt: lead.createdAt,
          createdAt: lead.createdAt,
        },
      ],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = isLeadBoardUrl(url)
        ? leadBoardResponse(url, [lead])
        : url.includes("/activity")
          ? activity
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Bruna Lead")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Seu acesso a CRM comercial é só de consulta",
    );
    expect(
      screen.queryByRole("button", { name: /Novo lead/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Converter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Agendar experimental/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Atividades" }));
    const dialog = screen.getByRole("dialog", { name: "Bruna Lead" });
    expect(
      await within(dialog).findByText("Ligar de volta"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Aberta")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Adicionar tarefa" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Concluir" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Contatos/ }));
    expect(
      within(dialog).getByText(/Pediu horários à noite/),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Registrar contato" }),
    ).not.toBeInTheDocument();
  });
});
