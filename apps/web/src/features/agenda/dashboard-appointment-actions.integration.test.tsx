import {
  type Appointment,
  type PermissionKey,
  saoPauloToday,
} from "@crm/contracts";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("dashboard appointment actions", () => {
  const permissions: PermissionKey[] = [
    "agenda.view",
    "agenda.attendance",
    "agenda.reschedule",
    "agenda.cancel",
    "patients.view",
    "reports.view",
    "reports.sales",
  ];
  function setup(
    options: {
      permissions?: PermissionKey[];
      status?: Appointment["status"];
      lead?: boolean;
      count?: number;
      failSave?: boolean;
      failRefresh?: boolean;
      failSalesRefresh?: boolean;
      failResources?: boolean;
      holdSave?: boolean;
      holdResources?: boolean;
      holdInitialSales?: boolean;
    } = {},
  ) {
    const date = saoPauloToday();
    const appointments: Appointment[] = Array.from(
      { length: options.count ?? 1 },
      (_, index) => ({
        id: `appointment-${index}`,
        clinicId: "clinic",
        ...(options.lead
          ? { leadId: "lead", leadName: "Ana Lead" }
          : { patientId: "patient" }),
        patientName: options.lead ? "Ana Lead" : `Ana ${index}`,
        professionalId: "professional",
        roomId: "room",
        serviceId: "service",
        visitType: "regular",
        professionalColor: "#26705f",
        professionalName: "Beatriz Lima",
        roomName: "Sala 1",
        serviceName: "Avaliação funcional",
        startsAt: `${date}T${String(12 + index).padStart(2, "0")}:00:00.000Z`,
        endsAt: `${date}T${String(13 + index).padStart(2, "0")}:00:00.000Z`,
        createdAt: `${date}T10:00:00.000Z`,
        updatedAt: `${date}T10:00:00.000Z`,
        status: options.status ?? "scheduled",
        notes: "Primeira consulta",
      }),
    );
    const controls = {
      ...options,
      dashboardReads: 0,
      salesReads: 0,
      resourceReads: 0,
      writes: [] as {
        url: string;
        method: string;
        body: Record<string, unknown>;
      }[],
    };
    let releaseSave!: () => void;
    let releaseResources!: () => void;
    let releaseSales!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const resourceGate = new Promise<void>((resolve) => {
      releaseResources = resolve;
    });
    const salesGate = new Promise<void>((resolve) => {
      releaseSales = resolve;
    });
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify(
        withPermissions({
          id: "user",
          fullName: "Carla Consulta",
          email: "carla@test.local",
          role: "user",
          modules: ["agenda", "patients", "reports"],
          editModules: ["agenda"],
          permissions: options.permissions ?? permissions,
        }),
      ),
    );
    const response = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as Response;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PATCH" || init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        controls.writes.push({ url, method: init.method, body });
        if (controls.holdSave) await saveGate;
        if (controls.failSave)
          return response(
            { message: "Não foi possível salvar o atendimento." },
            500,
          );
        const index = appointments.findIndex((item) =>
          url.includes(`/${item.id}/`),
        );
        const original = appointments[index]!;
        appointments[index] =
          init.method === "PATCH"
            ? { ...original, status: body.status as Appointment["status"] }
            : {
                ...original,
                ...body,
                startsAt: String(body.startsAt),
                endsAt: new Date(
                  new Date(String(body.startsAt)).getTime() + 60 * 60_000,
                ).toISOString(),
              };
        return response(appointments[index]);
      }
      if (url.includes("/dashboard")) {
        controls.dashboardReads++;
        if (controls.dashboardReads > 1 && controls.failRefresh)
          return response({ message: "Falha ao atualizar resumo." }, 500);
        const todayAppointments = appointments.filter(
          (item) => saoPauloToday(new Date(item.startsAt)) === date,
        );
        return response({
          date,
          appointmentsToday: todayAppointments.length,
          nonCancelledAppointmentsToday: todayAppointments.filter(
            (item) => item.status !== "cancelled",
          ).length,
          pendingToday: todayAppointments.filter(
            (item) =>
              item.status === "scheduled" || item.status === "confirmed",
          ).length,
          awaitingConfirmationToday: todayAppointments.filter(
            (item) => item.status === "scheduled",
          ).length,
          completedToday: todayAppointments.filter(
            (item) => item.status === "completed",
          ).length,
          patientsActive: 1,
          noShowsThisMonth: 0,
          nextAppointments: todayAppointments
            .filter(
              (item) =>
                item.status === "scheduled" || item.status === "confirmed",
            )
            .slice(0, 5),
        });
      }
      if (url.includes("/reports/sales?")) {
        controls.salesReads++;
        if (controls.salesReads > 1 && controls.failSalesRefresh)
          return response({ message: "Falha ao atualizar vendas." }, 500);
        const salesResponse = response({
          current: {
            to: date,
            netSalesInCents: controls.salesReads > 1 ? 12000 : 0,
            receivedInCents: 0,
            attendedPatients: 0,
          },
          changePercent: null,
          patientsWithoutReturn: [],
        });
        if (controls.salesReads === 1 && controls.holdInitialSales)
          await salesGate;
        return salesResponse;
      }
      if (url.includes("/services")) {
        controls.resourceReads++;
        if (controls.holdResources) await resourceGate;
        if (controls.failResources)
          return response({ message: "Falha ao carregar serviços." }, 500);
        return response([
          {
            id: "service",
            name: "Avaliação funcional",
            durationMinutes: 60,
            priceInCents: 12000,
          },
        ]);
      }
      if (url.includes("/patients"))
        return response([
          {
            id: "patient",
            fullName: "Ana Cliente",
            email: "ana@test.local",
            phone: "11987654321",
            tags: [],
            status: "active",
          },
        ]);
      if (url.includes("/professionals"))
        return response([
          { id: "professional", fullName: "Beatriz Lima", active: true },
        ]);
      if (url.includes("/rooms"))
        return response([{ id: "room", name: "Sala 1", active: true }]);
      if (url.includes("/reschedules")) return response([]);
      if (
        url.includes("/appointments?") ||
        url.includes("/appointments/options?")
      )
        return response(appointments);
      return response([]);
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    return {
      controls,
      appointments,
      releaseSave,
      releaseResources,
      releaseSales,
    };
  }

  async function openMenu(name = "Ana 0") {
    const trigger = await screen.findByRole("button", {
      name: `Ações de ${name}`,
    });
    fireEvent.click(trigger);
    return {
      trigger,
      menu: screen.getByRole("menu", { name: `Ações de ${name}` }),
    };
  }

  function metric(label: string) {
    return screen.getByText(label).closest("article")!.querySelector("strong")!;
  }

  it("opens the correct compact menu, supports keyboard navigation, and closes outside", async () => {
    setup({ count: 2 });
    const { trigger, menu } = await openMenu("Ana 1");
    expect(trigger).toHaveClass("icon-button", "button-sm");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Ver detalhes",
      "Confirmar atendimento",
      "Finalizar atendimento",
      "Remarcar atendimento",
      "Cancelar atendimento",
      "Histórico de reagendamentos",
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: "Ver detalhes" }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(
      within(menu).getByRole("menuitem", { name: "Confirmar atendimento" }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(
      within(menu).getByRole("menuitem", {
        name: "Histórico de reagendamentos",
      }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers only consultation actions for view-only access and does not fetch patient records", async () => {
    const { controls } = setup({ permissions: ["agenda.view"] });
    const { menu, trigger } = await openMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Ver detalhes", "Histórico de reagendamentos"]);
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Ver detalhes" }),
    );
    expect(
      await screen.findByText("Dados cadastrais indisponíveis no momento."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remarcar atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/patients")),
    ).toBe(false);
    expect(controls.salesReads).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("hides the actions without agenda consultation access", async () => {
    setup({ permissions: ["patients.view"] });
    await screen.findByText("Ana 0");
    expect(
      screen.queryByRole("button", { name: /Ações de/ }),
    ).not.toBeInTheDocument();
  });

  it("checks each operation permission separately", async () => {
    setup({ permissions: ["agenda.view", "agenda.cancel"] });
    const { menu } = await openMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Ver detalhes",
      "Cancelar atendimento",
      "Histórico de reagendamentos",
    ]);
  });

  it("confirms the selected appointment and updates counts even if refreshing fails", async () => {
    const { controls } = setup({ count: 2, failRefresh: true });
    const { menu } = await openMenu("Ana 1");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Confirmar atendimento" }),
    );
    expect(await screen.findByText("Confirmado")).toBeInTheDocument();
    expect(metric("Atendimentos hoje")).toHaveTextContent("2");
    expect(metric("Pendentes hoje")).toHaveTextContent("2");
    expect(metric("A confirmar")).toHaveTextContent("1");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Alteração salva, mas não foi possível atualizar o painel.",
    );
    expect(controls.writes).toEqual([
      {
        url: expect.stringContaining("/appointments/appointment-1/status"),
        method: "PATCH",
        body: { status: "confirmed" },
      },
    ]);
    const confirmed = await openMenu("Ana 1");
    expect(
      within(confirmed.menu).queryByRole("menuitem", {
        name: "Confirmar atendimento",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(confirmed.menu).getByRole("menuitem", {
        name: "Finalizar atendimento",
      }),
    ).toBeInTheDocument();
  });

  it("finalizes a pending appointment, updates metrics and sales, and fills the vacancy", async () => {
    const { controls } = setup({ count: 6, status: "confirmed" });
    expect(await screen.findByText("Ana 0")).toBeInTheDocument();
    expect(screen.queryByText("Ana 5")).not.toBeInTheDocument();
    expect(metric("Pendentes hoje")).toHaveTextContent("6");
    expect(metric("A confirmar")).toHaveTextContent("0");
    const { menu } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Finalizar atendimento" }),
    );
    expect(await screen.findByText("Ana 5")).toBeInTheDocument();
    expect(screen.queryByText("Ana 0")).not.toBeInTheDocument();
    expect(metric("Já finalizados")).toHaveTextContent("1");
    expect(metric("Atendimentos hoje")).toHaveTextContent("6");
    expect(metric("Pendentes hoje")).toHaveTextContent("5");
    expect(controls.writes[0]?.body).toEqual({ status: "completed" });
    expect(controls.dashboardReads).toBe(2);
    expect(controls.salesReads).toBe(2);
    expect(await screen.findByText(/120,00/)).toBeInTheDocument();
  });

  it("requires confirmation before cancelling and removes it from today's workload", async () => {
    const { controls } = setup();
    const { menu } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Cancelar atendimento" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Confirmar cancelamento",
    });
    expect(controls.writes).toHaveLength(0);
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
      target: { value: "Cliente desmarcou" },
    });
    fireEvent.click(confirm);
    expect(await screen.findByText("Agenda concluída")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(metric("Atendimentos hoje")).toHaveTextContent("0");
    expect(metric("Pendentes hoje")).toHaveTextContent("0");
    expect(metric("A confirmar")).toHaveTextContent("0");
    expect(metric("Já finalizados")).toHaveTextContent("0");
    expect(controls.writes[0]?.body).toEqual({
      status: "cancelled",
      absenceReason: "Cliente desmarcou",
    });
  });

  it.each([
    ["Cancelar atendimento", "Confirmar cancelamento"],
    ["Remarcar atendimento", "Confirmar reagendamento"],
  ])("keeps %s open when saving fails", async (action, confirmation) => {
    const { controls } = setup({ failSave: true });
    const { menu } = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: action! }));
    const confirm = await screen.findByRole("button", { name: confirmation! });
    if (action === "Cancelar atendimento")
      fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
        target: { value: "Cliente desmarcou" },
      });
    fireEvent.click(confirm);
    expect(
      await screen.findByText("Não foi possível salvar o atendimento."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: confirmation! })).toBeEnabled();
    expect(metric("Atendimentos hoje")).toHaveTextContent("1");
    expect(controls.dashboardReads).toBe(1);
    expect(controls.writes).toHaveLength(1);
  });

  it("opens details and reuses the rescheduling form to move an appointment to another day", async () => {
    const { controls } = setup();
    const { menu } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Ver detalhes" }),
    );
    expect(await screen.findByText("ana@test.local")).toBeInTheDocument();
    expect(screen.getByText("Primeira consulta")).toBeInTheDocument();
    expect(screen.getByText(/60 min/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Remarcar atendimento" }),
    );
    const submit = await screen.findByRole("button", {
      name: "Confirmar reagendamento",
    });
    const dialog = screen.getByRole("dialog", {
      name: "Reagendar atendimento",
    });
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue(
      "professional",
    );
    expect(within(dialog).getByLabelText("Sala")).toHaveValue("room");
    fireEvent.click(within(dialog).getByRole("button", { name: "Data" }));
    const nextDay = new Date(`${saoPauloToday()}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayLabel = nextDay.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (nextDay.getDate() === 1)
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Próximo mês" }),
      );
    fireEvent.click(within(dialog).getByRole("button", { name: dayLabel }));
    fireEvent.click(submit);
    expect(
      await screen.findByText("Nenhum atendimento hoje"),
    ).toBeInTheDocument();
    expect(metric("Atendimentos hoje")).toHaveTextContent("0");
    expect(metric("Pendentes hoje")).toHaveTextContent("0");
    expect(metric("A confirmar")).toHaveTextContent("0");
    expect(controls.writes[0]).toMatchObject({
      url: expect.stringContaining("/appointments/appointment-0/schedule"),
      method: "PUT",
    });
    expect(
      saoPauloToday(new Date(String(controls.writes[0]?.body.startsAt))),
    ).toBe(saoPauloToday(nextDay));
  });

  it("loads history for the selected appointment without loading unrelated resources", async () => {
    setup({ count: 2 });
    const { menu } = await openMenu("Ana 1");
    fireEvent.click(
      within(menu).getByRole("menuitem", {
        name: "Histórico de reagendamentos",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Histórico de reagendamentos",
    });
    expect(
      await within(dialog).findByText("Sem reagendamentos"),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Ana 1");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("/appointments/appointment-1/reschedules"),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          /\/(patients|services|professionals|rooms)/.test(String(url)),
        ),
    ).toBe(false);
  });

  it("opens lead details without requesting patient records", async () => {
    setup({ lead: true });
    const { menu } = await openMenu("Ana Lead");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Ver detalhes" }),
    );
    expect(
      await screen.findByText(
        /Prontuário, pesquisa de satisfação e histórico ficam disponíveis/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dados do cliente")).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/patients")),
    ).toBe(false);
  });

  it("keeps the appointment unchanged when saving fails and allows another attempt", async () => {
    const { controls } = setup({ failSave: true });
    const { menu } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Finalizar atendimento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar o atendimento.",
    );
    expect(screen.getByText("Ana 0")).toBeInTheDocument();
    expect(metric("Já finalizados")).toHaveTextContent("0");
    expect(controls.dashboardReads).toBe(1);
    controls.failSave = false;
    const retry = await openMenu();
    fireEvent.click(
      within(retry.menu).getByRole("menuitem", {
        name: "Finalizar atendimento",
      }),
    );
    expect(await screen.findByText("Agenda concluída")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["failRefresh", "failSalesRefresh"] as const)(
    "retries %s after a saved change without sending it again",
    async (failure) => {
      const { controls } = setup({ [failure]: true });
      const { menu } = await openMenu();
      fireEvent.click(
        within(menu).getByRole("menuitem", { name: "Finalizar atendimento" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Alteração salva, mas não foi possível atualizar o painel.",
      );
      expect(metric("Já finalizados")).toHaveTextContent("1");
      expect(metric("Pendentes hoje")).toHaveTextContent("0");
      expect(metric("A confirmar")).toHaveTextContent("0");
      expect(screen.queryByText("Ana 0")).not.toBeInTheDocument();
      controls[failure] = false;
      fireEvent.click(screen.getByRole("button", { name: "Atualizar painel" }));
      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
      );
      expect(controls.writes).toHaveLength(1);
      expect(controls.dashboardReads).toBe(3);
    },
  );

  it("keeps refreshed sales when the initial report arrives after the saved change", async () => {
    const { releaseSales } = setup({ holdInitialSales: true });
    const { menu } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Finalizar atendimento" }),
    );
    expect(await screen.findByText(/120,00/)).toBeInTheDocument();
    await act(async () => {
      releaseSales();
    });
    expect(screen.getByText(/120,00/)).toBeInTheDocument();
  });

  it("blocks actions and duplicate submissions until saving finishes", async () => {
    const { controls, releaseSave } = setup({ holdSave: true, count: 2 });
    const { menu, trigger } = await openMenu();
    const finalize = within(menu).getByRole("menuitem", {
      name: "Finalizar atendimento",
    });
    fireEvent.click(finalize);
    fireEvent.click(finalize);
    expect(trigger).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Ações de Ana 1" }),
    ).toBeDisabled();
    expect(controls.writes).toHaveLength(1);
    releaseSave();
    await waitFor(() =>
      expect(screen.queryByText("Ana 0")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("button", { name: "Ações de Ana 1" }),
    ).toBeEnabled();
  });

  it("retries resource loading before opening details", async () => {
    const { controls } = setup({ failResources: true });
    const { menu } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Ver detalhes" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar serviços.",
    );
    expect(
      screen.queryByRole("button", { name: "Cancelar atendimento" }),
    ).not.toBeInTheDocument();
    controls.failResources = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("ana@test.local")).toBeInTheDocument();
    expect(controls.resourceReads).toBe(2);
    expect(controls.writes).toHaveLength(0);
  });

  it("does not reopen a dialog when loading finishes after it was closed", async () => {
    const { releaseResources } = setup({ holdResources: true });
    const { menu, trigger } = await openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Ver detalhes" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    releaseResources();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the existing agenda and new appointment links working", async () => {
    setup({ permissions: ["agenda.view", "agenda.create"] });
    const agenda = await screen.findByRole("link", { name: /Ver agenda/ });
    expect(agenda).toHaveAttribute("href", "/agenda");
    expect(
      screen.getByRole("link", { name: /Novo atendimento/ }),
    ).toHaveAttribute("href", "/agenda");
    fireEvent.click(agenda);
    expect(
      await screen.findByRole("heading", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Detalhes de Ana 0" }),
    ).toBeInTheDocument();
  });
});
