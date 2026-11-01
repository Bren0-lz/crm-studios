import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  fillAppointmentForm,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("promoção de campanha automática ao agendar", () => {
  function response(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }

  it("asks whether the appointment uses the campaign promotion and sends it", async () => {
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
    const promotion = {
      campaignId: "a1111111-1111-4111-8111-111111111111",
      occurrenceKey: `${patient.id}:2026`,
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST")
        return response({ code: "CONFLICT", message: "Horário ocupado." }, 409);
      if (url.includes("/appointments/promotions"))
        return response(
          url.includes(patient.id)
            ? [
                {
                  ...promotion,
                  campaignName: "Aniversariantes",
                  validUntil: "2026-11-03",
                },
              ]
            : [],
        );
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
    const question = await within(dialog).findByRole("checkbox", {
      name: /Esse atendimento é referente à campanha “Aniversariantes”\?/,
    });
    expect(
      within(dialog).getByText(/Promoção válida para agendar até 03 de nov/),
    ).toBeInTheDocument();
    expect(question).not.toBeChecked();
    fireEvent.click(question);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar atendimento" }),
    );
    await screen.findByText("Horário ocupado.");
    const call = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/appointments") && init?.method === "POST",
      );
    expect(JSON.parse(call![1]!.body as string)).toMatchObject({
      patientId: patient.id,
      promotion,
    });
  });
});
