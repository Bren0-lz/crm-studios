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
                      priceInCents: 10000,
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
  it("shows the order summary with each session, the campaign discount and the total", async () => {
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
    const serviceId = "77777777-7777-4777-8777-777777777777";
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/appointments/promotions"))
        return response([
          {
            campaignId: "a1111111-1111-4111-8111-111111111111",
            occurrenceKey: `${patient.id}:2026`,
            campaignName: "Aniversariantes",
            validUntil: "2026-11-03",
            discount: { type: "percentage", percent: 10 },
            planTemplateIds: [],
          },
        ]);
      if (url.includes("/appointments/pricing"))
        return response({
          serviceId,
          plans: [
            {
              planId: "p1",
              planTemplateId: "t1",
              planName: "Pilates 8 sessões",
              remainingSessions: 1,
              sessionValueInCents: 6000,
            },
          ],
          single: {
            planTemplateId: "t2",
            planName: "Pilates (avulso)",
            sessionValueInCents: 9000,
          },
        });
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
    const summary = await within(dialog).findByRole("list", {
      name: "Atendimentos do resumo",
    });
    expect(within(summary).getByText("Pilates")).toBeInTheDocument();
    expect(
      within(summary).getByText(/Saldo do plano Pilates 8 sessões/),
    ).toBeInTheDocument();

    fireEvent.click(
      await within(dialog).findByRole("checkbox", {
        name: /campanha “Aniversariantes”/,
      }),
    );
    expect(
      within(summary).getByText("Desconto da campanha “Aniversariantes”"),
    ).toBeInTheDocument();
    expect(within(summary).getByText(/− R\$\s*6,00/)).toBeInTheDocument();
    const totals = dialog.querySelector(".order-totals") as HTMLElement;
    expect(within(totals).getByText(/R\$\s*54,00/)).toBeInTheDocument();

    // Repetir: cada sessão aparece com o próprio valor; o desconto fica na 1ª.
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Repetir este atendimento",
      }),
    );
    fireEvent.change(within(dialog).getByLabelText("Número de ocorrências"), {
      target: { value: "3" },
    });
    const items = within(summary).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(
      within(items[0]!).getByText("Pilates · 1ª sessão"),
    ).toBeInTheDocument();
    expect(
      within(items[0]!).getByText("Desconto da campanha “Aniversariantes”"),
    ).toBeInTheDocument();
    expect(
      within(items[1]!).getByText(/Avulso: Pilates \(avulso\)/),
    ).toBeInTheDocument();
    expect(within(items[1]!).getByText(/R\$\s*90,00/)).toBeInTheDocument();
    expect(
      within(items[2]!).queryByText(/Desconto da campanha/),
    ).not.toBeInTheDocument();
    // 60 + 90 + 90 − 6.
    expect(within(totals).getByText(/R\$\s*234,00/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/A campanha vale só na 1ª sessão/),
    ).toBeInTheDocument();
  });
});
