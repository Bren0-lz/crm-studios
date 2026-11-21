import {
  waitFor,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  appointmentPricingWithPlan,
  fillAppointmentForm,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("appointment recurrence on chosen dates", () => {
  function response(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }

  it("sends the manually chosen dates instead of a weekly interval", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Recepção",
        email: "r@test.local",
        role: "reception",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
      tags: [],
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const pricing = appointmentPricingWithPlan(url);
      if (pricing) return pricing;
      if (init?.method === "POST")
        return response({ code: "CONFLICT", message: "Horário ocupado." }, 409);
      return response(
        url.includes("/patients")
          ? [patient]
          : url.includes("/professionals")
            ? [
                {
                  id: "33333333-3333-4333-8333-333333333333",
                  fullName: "Ana",
                  color: "#5c6f68",
                },
              ]
            : url.includes("/rooms")
              ? [{ id: "55555555-5555-4555-8555-555555555555", name: "Sala" }]
              : url.includes("/services")
                ? [
                    {
                      id: "77777777-7777-4777-8777-777777777777",
                      name: "Pilates",
                    },
                  ]
                : [],
      );
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Dia disponível");
    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    await fillAppointmentForm(dialog, patient.fullName);
    const time = within(dialog).getByLabelText("Horário");
    const form = time.closest("form")!;
    fireEvent.change(time, { target: { value: "" } });
    // Exercita a proteção do envio mesmo sem a validação nativa do navegador.
    fireEvent.submit(form);
    expect(
      within(dialog).getByText("Informe a data e o horário do atendimento."),
    ).toBeInTheDocument();
    fireEvent.change(time, { target: { value: "09:00" } });
    fireEvent.click(within(dialog).getByLabelText("Repetir este atendimento"));
    fireEvent.change(within(dialog).getByLabelText("Intervalo"), {
      target: { value: "custom" },
    });
    expect(
      within(dialog).queryByLabelText("Número de ocorrências"),
    ).not.toBeInTheDocument();
    const dates = within(dialog)
      .getByRole("heading", { name: "Outras datas" })
      .closest<HTMLElement>(".recurrence-dates")!;
    // Uma ocorrência já vem pronta, com o horário do atendimento.
    expect(within(dates).getByLabelText("Horário")).toHaveValue("09:00");
    expect(
      within(dates).getByRole("button", { name: "Remover ocorrência 2" }),
    ).toBeDisabled();
    fireEvent.click(within(dates).getByRole("button", { name: "Data" }));
    fireEvent.click(within(dates).getByRole("button", { name: "Próximo mês" }));
    const day = dates.querySelector<HTMLButtonElement>(
      '[data-date][tabindex="0"]',
    )!;
    const chosen = day.dataset.date!;
    fireEvent.click(day);
    fireEvent.click(
      within(dates).getByRole("button", { name: "Adicionar data" }),
    );
    expect(within(dates).getAllByLabelText("Horário")).toHaveLength(2);
    fireEvent.submit(form);
    expect(
      within(dialog).getByText("Informe a data e o horário da ocorrência 3."),
    ).toBeInTheDocument();
    const submissions = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([url, init]) =>
            String(url).includes("/appointments") && init?.method === "POST",
        );
    expect(submissions()).toHaveLength(0);
    fireEvent.click(
      within(dates).getByRole("button", { name: "Remover ocorrência 3" }),
    );
    expect(within(dialog).getByText(/^2 ocorrências/)).toBeInTheDocument();
    // Agendar exige plano (AP4): espera os planos do cliente.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirmar atendimento" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar atendimento" }),
    );
    await screen.findByText("Horário ocupado.");
    const calls = submissions();
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toContain("/appointments/recurring");
    expect(JSON.parse(calls[0]![1]!.body as string)).toMatchObject({
      patientId: patient.id,
      occurrences: 2,
      customStartsAt: [new Date(`${chosen}T09:00`).toISOString()],
    });
  });
});
