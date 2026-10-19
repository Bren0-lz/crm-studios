import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("books a trial class for a lead from the CRM card", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const leadBase = {
      clinicId: "11111111-1111-4111-8111-111111111111",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const lead = {
      ...leadBase,
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "Bruna Lead",
      stage: "contacted",
    };
    const converted = {
      ...leadBase,
      id: "45454545-4545-4545-8545-454545454545",
      fullName: "Carla Convertida",
      stage: "won",
      convertedPatientId: "99999999-9999-4999-8999-999999999999",
    };
    let posted: { url: string; body: Record<string, unknown> } | undefined;
    let conflict = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted = { url, body: JSON.parse(String(init.body)) };
        if (conflict)
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "APPOINTMENT_CONFLICT",
              message: "Profissional já tem atendimento neste horário.",
            }),
          } as Response;
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            leadId: lead.id,
            leadName: lead.fullName,
            patientName: lead.fullName,
            ...posted!.body,
            endsAt: posted!.body.startsAt,
            status: "scheduled",
            serviceName: "Pilates",
            professionalName: "Dra. Ana Martins",
            roomName: "Sala Movimento",
            professionalColor: "#5c6f68",
          }),
        } as Response;
      }
      const body = url.endsWith("/leads")
        ? [lead, converted]
        : url.includes("/professionals")
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                fullName: "Dra. Ana Martins",
                color: "#5c6f68",
              },
            ]
          : url.includes("/rooms")
            ? [
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  name: "Sala Movimento",
                },
              ]
            : url.includes("/services")
              ? [
                  {
                    id: "77777777-7777-4777-8777-777777777777",
                    name: "Pilates",
                    priceInCents: 9000,
                  },
                ]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Bruna Lead" })
    ).closest("article") as HTMLElement;
    const convertedCard = screen
      .getByRole("heading", { name: "Carla Convertida" })
      .closest("article") as HTMLElement;
    expect(
      within(convertedCard).queryByRole("button", {
        name: "Agendar experimental",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(card).getByRole("button", { name: "Agendar experimental" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Agendar experimental",
    });
    const service = await within(dialog).findByLabelText("Serviço");
    expect(service).toHaveValue("77777777-7777-4777-8777-777777777777");
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(within(dialog).getByLabelText("Sala")).toHaveValue(
      "55555555-5555-4555-8555-555555555555",
    );
    const type = within(dialog).getByLabelText("Tipo");
    expect(type).toHaveValue("trial");
    expect(
      within(type)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Experimental", "Avaliação"]);
    fireEvent.change(type, { target: { value: "evaluation" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Data" }));
    const chosenDate = dialog.querySelector<HTMLButtonElement>(
      '[data-date][tabindex="0"]',
    )!.dataset.date!;
    fireEvent.click(
      dialog.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!,
    );
    // Sem horário, Confirmar fica desativado dizendo o que falta (QM14).
    fireEvent.change(within(dialog).getByLabelText("Horário"), {
      target: { value: "" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    ).toHaveAccessibleDescription("Falta: Data e horário.");
    fireEvent.change(within(dialog).getByLabelText("Horário"), {
      target: { value: "09:00" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    ).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Horário")).toHaveValue("09:00");
    expect(
      within(dialog).queryByRole("region", {
        name: "Calendário de agendamento",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    );
    expect(
      await within(dialog).findByText(
        "Profissional já tem atendimento neste horário.",
      ),
    ).toBeInTheDocument();
    expect(posted?.url).toContain(`/leads/${lead.id}/appointments`);
    expect(posted?.body).toEqual({
      professionalId: "33333333-3333-4333-8333-333333333333",
      roomId: "55555555-5555-4555-8555-555555555555",
      serviceId: "77777777-7777-4777-8777-777777777777",
      startsAt: new Date(`${chosenDate}T09:00`).toISOString(),
      notes: "",
      visitType: "evaluation",
    });
    conflict = false;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    );
    expect(
      await screen.findByText(/Avaliação agendada para Bruna Lead/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Agendar experimental" }),
    ).not.toBeInTheDocument();
  });
});
