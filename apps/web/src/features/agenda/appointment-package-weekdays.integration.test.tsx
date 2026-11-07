import { packageScheduleStarts } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { localIsoDate } from "../../shared/lib/formatting";
import {
  appointmentPricingWithPlan,
  fillAppointmentForm,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("appointment package on fixed weekdays", () => {
  function response(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }

  it("schedules the package sessions on the chosen weekdays until it ends", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Admin",
        email: "a@test.local",
        role: "admin",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
      tags: [],
    };
    const serviceId = "77777777-7777-4777-8777-777777777777";
    const today = localIsoDate();
    const plan = {
      id: "88888888-8888-4888-8888-888888888888",
      patientId: patient.id,
      status: "active",
      validFrom: today,
      remainingSessions: 10,
      services: [
        {
          serviceId,
          serviceName: "Pilates",
          totalSessions: 10,
          remainingSessions: 10,
          totalValueInCents: 100000,
        },
      ],
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const pricing = appointmentPricingWithPlan(url);
      if (pricing) return pricing;
      if (init?.method === "POST")
        return response({ code: "CONFLICT", message: "Horário ocupado." }, 409);
      return response(
        url.includes("/plans")
          ? [plan]
          : url.includes("/patients")
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
                  ? [{ id: serviceId, name: "Pilates" }]
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
    fireEvent.click(within(dialog).getByLabelText("Repetir este atendimento"));
    fireEvent.change(within(dialog).getByLabelText("Intervalo"), {
      target: { value: "package" },
    });
    // O número de sessões vem do saldo do pacote do cliente.
    expect(
      await within(dialog).findByLabelText("Número de sessões"),
    ).toHaveValue(10);
    expect(
      within(dialog).getByText("Saldo do pacote neste serviço: 10 sessões."),
    ).toBeInTheDocument();
    const days = within(dialog)
      .getByRole("heading", { name: "Dias e horários fixos" })
      .closest<HTMLElement>(".recurrence-dates")!;
    // O primeiro dia fixo é o dia e o horário escolhidos para o atendimento.
    expect(within(days).getByLabelText("Horário do 1º dia")).toHaveValue(
      "09:00",
    );
    // Rótulo diz que é um dia da semana, não a 1ª data do pacote.
    expect(within(days).queryByLabelText("Dia 1")).not.toBeInTheDocument();
    const firstWeekday = Number(
      (within(days).getByLabelText("1º dia da semana") as HTMLSelectElement)
        .value,
    );
    fireEvent.click(
      within(days).getByRole("button", { name: "Adicionar dia" }),
    );
    const secondWeekday = (firstWeekday + 2) % 7;
    expect(within(days).getByLabelText("2º dia da semana")).toHaveValue(
      String(secondWeekday),
    );
    fireEvent.change(within(days).getByLabelText("Horário do 2º dia"), {
      target: { value: "18:00" },
    });
    expect(within(days).getByText(/^10 sessões de/)).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar atendimento" }),
    );
    await screen.findByText("Horário ocupado.");
    const call = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).includes("/appointments/recurring") &&
          init?.method === "POST",
      );
    const body = JSON.parse(call![1]!.body as string) as {
      startsAt: string;
      occurrences: number;
      customStartsAt: string[];
    };
    const expected = packageScheduleStarts({
      fromDate: localIsoDate(new Date(body.startsAt)),
      slots: [
        { weekday: firstWeekday, time: "09:00" },
        { weekday: secondWeekday, time: "18:00" },
      ],
      count: 10,
    }).map((value) => new Date(value).toISOString());
    expect(body).toMatchObject({
      patientId: patient.id,
      serviceId,
      occurrences: 10,
      startsAt: expected[0],
      customStartsAt: expected.slice(1),
    });
  });
});
