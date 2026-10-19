import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  fillAppointmentForm,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("appointment client search and creation", () => {
  const existing = {
    id: "99999999-9999-4999-8999-999999999999",
    fullName: "Helena Almeida",
    tags: [],
  };
  const created = {
    ...existing,
    id: "88888888-8888-4888-8888-888888888888",
    fullName: "Nova Cliente",
    phone: "11999998888",
  };
  function response(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }
  async function open() {
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
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST")
        return url.endsWith("/patients")
          ? response(created, 201)
          : response({ code: "CONFLICT", message: "Horário ocupado." }, 409);
      return response(
        url.includes("/patients/options?")
          ? url.includes("search=Helena")
            ? [existing]
            : [created]
          : url.includes("/patients")
            ? [existing]
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
    return screen.getByRole("dialog", { name: "Novo atendimento" });
  }

  it("starts every field of a new appointment empty", async () => {
    const appointment = await open();
    expect(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue("");
    for (const label of [
      "Tipo",
      "Profissional",
      "Sala",
      "Serviço",
      "Horário",
      "Observação",
    ])
      expect(within(appointment).getByLabelText(label)).toHaveValue("");
    expect(
      within(appointment).getByRole("button", { name: "Data" }),
    ).toHaveTextContent("Selecionar data");
    expect(
      within(appointment).getByLabelText("Repetir este atendimento"),
    ).not.toBeChecked();
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeDisabled();
  });

  it("keeps appointment values, traps focus, and selects the saved client", async () => {
    const appointment = await open();
    await fillAppointmentForm(appointment);
    fireEvent.change(within(appointment).getByLabelText("Observação"), {
      target: { value: "Manter observação" },
    });
    fireEvent.click(
      within(appointment).getByLabelText("Repetir este atendimento"),
    );
    fireEvent.change(
      within(appointment).getByLabelText("Número de ocorrências"),
      { target: { value: "6" } },
    );
    const startsAt = within(appointment).getByLabelText(
      "Horário",
    ) as HTMLInputElement;
    const originalDate = within(appointment).getByRole("button", {
      name: "Data",
    }).textContent;
    const originalTime = startsAt.value;
    fireEvent.click(
      within(appointment).getByRole("button", { name: "Adicionar cliente" }),
    );
    const client = screen.getByRole("dialog", { name: "Novo cliente" });
    expect(appointment).toBeInTheDocument();
    expect(appointment.parentElement).toHaveAttribute("inert");
    expect(client.closest("form")).toBeNull();
    await within(client).findByText(/Nenhuma etiqueta configurada/);
    const save = within(client).getByRole("button", { name: "Salvar cliente" });
    save.focus();
    expect(save).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(client.contains(document.activeElement)).toBe(true);
    expect(save).not.toHaveFocus();
    fireEvent.change(within(client).getByLabelText("Nome completo"), {
      target: { value: created.fullName },
    });
    fireEvent.change(
      within(
        within(client).getByRole("group", { name: /^Contato$/ }),
      ).getByLabelText("Telefone"),
      { target: { value: created.phone } },
    );
    fireEvent.submit(client.querySelector("form")!);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo cliente" }),
      ).not.toBeInTheDocument(),
    );
    const picker = within(appointment).getByRole("combobox", {
      name: "Cliente",
    });
    expect(picker).toHaveValue(created.fullName);
    await waitFor(() => expect(picker).toHaveFocus());
    expect(within(appointment).getByLabelText("Observação")).toHaveValue(
      "Manter observação",
    );
    expect(startsAt).toHaveValue(originalTime);
    expect(
      within(appointment).getByRole("button", { name: "Data" }),
    ).toHaveTextContent(originalDate!);
    expect(
      within(appointment).getByLabelText("Número de ocorrências"),
    ).toHaveValue(6);
    fireEvent.click(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    );
    await screen.findByText("Horário ocupado.");
    const call = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).includes("/appointments") && init?.method === "POST",
      );
    expect(JSON.parse(call![1]!.body as string)).toMatchObject({
      patientId: created.id,
      notes: "Manter observação",
      occurrences: 6,
    });
  });

  it("closes only the client modal on Escape and keeps the previous selection", async () => {
    const appointment = await open();
    await fillAppointmentForm(appointment, existing.fullName);
    fireEvent.click(
      within(appointment).getByRole("button", { name: "Adicionar cliente" }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(appointment).toBeInTheDocument();
    expect(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue(existing.fullName);
    expect(document.body).toHaveClass("modal-open");
  });

  it("keeps both forms and the entered data when client creation fails", async () => {
    const appointment = await open();
    await fillAppointmentForm(appointment, existing.fullName);
    fireEvent.click(
      within(appointment).getByRole("button", { name: "Adicionar cliente" }),
    );
    const client = screen.getByRole("dialog", { name: "Novo cliente" });
    fireEvent.change(within(client).getByLabelText("Nome completo"), {
      target: { value: created.fullName },
    });
    vi.mocked(fetch).mockResolvedValue(
      response({ code: "DUPLICATE", message: "CPF já cadastrado." }, 409),
    );
    fireEvent.submit(client.querySelector("form")!);
    await within(client).findByText("CPF já cadastrado.");
    expect(appointment).toBeInTheDocument();
    expect(within(client).getByLabelText("Nome completo")).toHaveValue(
      created.fullName,
    );
    fireEvent.click(within(client).getByRole("button", { name: "Cancelar" }));
    const discard = screen.getByRole("dialog", {
      name: "Descartar alterações?",
    });
    fireEvent.click(within(discard).getByRole("button", { name: "Descartar" }));
    expect(
      screen.queryByRole("dialog", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue(existing.fullName);
  });

  it("searches CPF and selects a result by keyboard, clearing selection when edited", async () => {
    const appointment = await open();
    const picker = within(appointment).getByRole("combobox", {
      name: "Cliente",
    });
    fireEvent.change(picker, { target: { value: "123.456.789-01" } });
    fireEvent.change(picker, { target: { value: "123.456.789-01 " } });
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeDisabled();
    // Sem cliente escolhido, o motivo fica visível e ligado ao botão (QM14).
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toHaveAccessibleDescription("Falta: Cliente.");
    await screen.findByRole("option", { name: created.fullName });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("search=123.456.789-01"),
        ),
    ).toBe(true);
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.keyDown(picker, { key: "Enter" });
    expect(picker).toHaveValue(created.fullName);
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeEnabled();
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).not.toHaveAttribute("aria-describedby");
    expect(within(appointment).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "Outro" } });
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeDisabled();
  });

  it("ignores stale searches and distinguishes empty results from errors", async () => {
    const appointment = await open();
    const picker = within(appointment).getByRole("combobox", {
      name: "Cliente",
    });
    let resolveOld: (result: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).includes("search=Antigo")
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(
            String(input).includes("search=Erro")
              ? response({ code: "FAILED", message: "Falha na consulta" }, 500)
              : response([]),
          ),
    );
    fireEvent.change(picker, { target: { value: "Antigo" } });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("search=Antigo")),
      ).toBe(true),
    );
    fireEvent.change(picker, { target: { value: "Novo" } });
    await screen.findByText("Nenhum cliente encontrado");
    resolveOld(response([existing]));
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: existing.fullName }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.change(picker, { target: { value: "Erro" } });
    await screen.findByText("Falha na consulta");
    expect(
      screen.queryByText("Nenhum cliente encontrado"),
    ).not.toBeInTheDocument();
  });
});
