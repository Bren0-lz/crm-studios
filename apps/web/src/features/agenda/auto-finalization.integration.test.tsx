import type { Appointment, AutoFinalizationSettings } from "@crm/contracts";
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
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { completedPeriodRange } from "./completed-appointments";

function appointment(
  id: string,
  patientName: string,
  startsAt: Date,
  autoCompletedAt?: string,
): Appointment {
  return {
    id,
    clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    patientId: `${id}-patient`,
    professionalId: id === "a1" ? "p1" : "p2",
    roomId: "r1",
    serviceId: "s1",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
    visitType: "regular",
    status: "completed",
    patientName,
    professionalName: id === "a1" ? "Dra. Ana Martins" : "Dr. Bruno Lima",
    professionalColor: "#2f7d6d",
    roomName: "Sala 1",
    serviceName: "Pilates",
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...(autoCompletedAt ? { autoCompletedAt } : {}),
  };
}

function setup(path: string, initial: AutoFinalizationSettings) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role: "owner",
    }),
  );
  let settings = initial;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(9, 0, 0, 0);
  const completed = [
    appointment("a1", "Paula Presente", yesterday),
    appointment(
      "a2",
      "Otávio Automático",
      new Date(yesterday.getTime() + 2 * 3600_000),
      new Date().toISOString(),
    ),
  ];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    let body: unknown = [];
    if (url.includes("/admin/auto-finalization") && init?.method === "PUT") {
      settings = {
        ...(JSON.parse(String(init.body)) as AutoFinalizationSettings),
        updatedAt: new Date().toISOString(),
      };
      body = settings;
    } else if (url.includes("/clinic/auto-finalization")) body = settings;
    else if (url.includes("/appointments/completed")) body = completed;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const calls = (part: string) =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes(part))
    .map(([url, init]) => ({ url: String(url), init }));

describe("finalização automática", () => {
  it("admin liga a finalização com um tempo de espera em horas", async () => {
    setup("/configuracoes?secao=finalizacao", {
      enabled: false,
      delayMinutes: 60,
    });
    const panel = await screen.findByRole("tabpanel", {
      name: "Finalização automática",
    });
    const toggle = await within(panel).findByLabelText(
      "Finalizar atendimentos automaticamente",
    );
    const amount = within(panel).getByLabelText(
      "Tempo de espera após o término",
    );
    expect(toggle).not.toBeChecked();
    expect(amount).toBeDisabled();
    expect(within(panel).getByText(/Desligada:/)).toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.change(amount, { target: { value: "2" } });
    expect(within(panel).getByLabelText("Unidade")).toHaveValue("hours");
    expect(
      within(panel).getByText("Finaliza 2 horas após o término."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/vira realizado às 12:00/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Salvar finalização automática",
      }),
    );
    expect(
      await within(panel).findByText("Finalização automática ligada."),
    ).toBeInTheDocument();
    const [put] = calls("/admin/auto-finalization");
    expect(JSON.parse(String(put!.init?.body))).toEqual({
      enabled: true,
      delayMinutes: 120,
    });
    expect(
      within(panel).getByRole("link", { name: "Ver atendimentos concluídos" }),
    ).toHaveAttribute("href", "/agenda/concluidos");
  });

  it("lista os concluídos do período e separa os da finalização automática", async () => {
    setup("/agenda/concluidos", { enabled: true, delayMinutes: 90 });
    const automatic = await screen.findByText("Otávio Automático");
    expect(screen.getByText("Paula Presente")).toBeInTheDocument();
    expect(
      screen.getByText(/Finalização automática 1 hora e 30 minutos após/),
    ).toBeInTheDocument();
    const summary = screen.getByLabelText("Resumo do período");
    expect(
      within(summary)
        .getAllByRole("article")
        .map((card) => card.textContent),
    ).toEqual([
      "Concluídos2",
      "Finalização automática1",
      "Registrados pela equipe1",
    ]);
    expect(
      within(automatic.closest("li")!).getByText("Finalização automática"),
    ).toBeInTheDocument();

    // Últimos 7 dias por padrão; o atalho troca o período consultado.
    const last7 = completedPeriodRange("last7");
    expect(screen.getByLabelText("De")).toHaveValue(last7.from);
    fireEvent.click(screen.getByRole("button", { name: "Este mês" }));
    expect(screen.getByLabelText("De")).toHaveValue(
      completedPeriodRange("month").from,
    );
    await waitFor(() =>
      expect(calls("/appointments/completed")).toHaveLength(2),
    );

    await screen.findByText("Otávio Automático");
    fireEvent.change(screen.getByLabelText("Origem"), {
      target: { value: "team" },
    });
    expect(screen.queryByText("Otávio Automático")).not.toBeInTheDocument();
    expect(screen.getByText("Paula Presente")).toBeInTheDocument();
    expect(screen.getByText("1 exibido com os filtros")).toBeInTheDocument();
  });

  it("recusa período invertido sem consultar a API", async () => {
    setup("/agenda/concluidos", { enabled: true, delayMinutes: 60 });
    await screen.findByText("Paula Presente");
    const before = calls("/appointments/completed").length;
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2030-01-10" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2030-01-01" },
    });
    expect(
      screen.getByText(/Escolha um período de até 1 ano/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Personalizado" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(calls("/appointments/completed")).toHaveLength(before);
  });

  it("mostra o atalho de concluídos na agenda só com a finalização ligada", async () => {
    setup("/agenda/a-finalizar", { enabled: true, delayMinutes: 30 });
    expect(
      await screen.findByRole("link", { name: "Ver concluídos" }),
    ).toHaveAttribute("href", "/agenda/concluidos");
    expect(
      screen.getByText(
        "Finalização automática ligada: viram realizados 30 minutos após o término.",
      ),
    ).toBeInTheDocument();
  });

  it("não mostra atalhos com a finalização desligada", async () => {
    setup("/agenda/a-finalizar", { enabled: false, delayMinutes: 30 });
    await screen.findByText("Nada a finalizar");
    await waitFor(() =>
      expect(calls("/clinic/auto-finalization").length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByRole("link", { name: "Ver concluídos" }),
    ).not.toBeInTheDocument();
  });
});
