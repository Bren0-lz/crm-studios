import type { Appointment } from "@crm/contracts";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { localIsoDate, shortDate } from "../../shared/lib/formatting";
import type { AppointmentModalProps } from "./types";

// O formulário completo tem testes próprios; aqui o modal só devolve o que foi "salvo".
let saved: Appointment[] = [];
vi.mock("./AppointmentModal", () => ({
  AppointmentModal: ({ onCreated }: AppointmentModalProps) => (
    <button type="button" onClick={() => onCreated(saved)}>
      Salvar de teste
    </button>
  ),
}));

function appointmentOn(id: string, day: Date): Appointment {
  const startsAt = new Date(day);
  startsAt.setHours(10, 0, 0, 0);
  return {
    id,
    patientId: "c1",
    patientName: `Cliente ${id}`,
    status: "scheduled",
    professionalId: "p1",
    professionalName: "Clara Mendes",
    roomId: "r1",
    roomName: "Sala 1",
    serviceId: "s1",
    serviceName: "Pilates",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
  } as Appointment;
}

function renderAgenda(view: "day" | "week" | "month") {
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
  localStorage.setItem("crm.agenda.view", view);
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    let body: unknown = [];
    if (url.pathname.endsWith("/appointments")) {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      body = saved.filter((item) => item.startsAt < to && item.endsAt > from);
    } else if (url.pathname.endsWith("/professionals")) {
      body = [{ id: "p1", fullName: "Clara Mendes", active: true }];
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  return render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("agenda após salvar (QM2)", () => {
  afterEach(() => {
    vi.useRealTimers();
    saved = [];
  });

  it("vai para a semana do atendimento salvo e destaca o bloco por 2 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const target = new Date();
    target.setHours(12, 0, 0, 0);
    target.setDate(target.getDate() + 21);
    saved = [appointmentOn("a1", target)];
    renderAgenda("week");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar de teste" }));

    const card = await screen.findByRole("button", {
      name: "Detalhes de Cliente a1",
    });
    const monday = new Date(target);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    expect(
      screen.getByText(new RegExp(`^${shortDate.format(monday)} —`)),
    ).toBeInTheDocument();
    expect(card).toHaveClass("agenda-just-saved");
    // Roda os efeitos pendentes (o relógio do destaque começa quando o bloco aparece).
    await act(async () => {});

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole("button", { name: "Detalhes de Cliente a1" }),
    ).toHaveClass("agenda-just-saved");
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(
      screen.getByRole("button", { name: "Detalhes de Cliente a1" }),
    ).not.toHaveClass("agenda-just-saved");
  });

  it("na recorrência vai para a primeira ocorrência (visão Dia)", async () => {
    const first = new Date();
    first.setHours(12, 0, 0, 0);
    first.setDate(first.getDate() + 3);
    const second = new Date(first);
    second.setDate(second.getDate() + 7);
    saved = [appointmentOn("r2", second), appointmentOn("r1", first)];
    renderAgenda("day");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar de teste" }));

    expect(
      await screen.findByRole("button", { name: "Detalhes de Cliente r1" }),
    ).toHaveClass("agenda-just-saved");
    expect(
      screen.queryByRole("button", { name: "Detalhes de Cliente r2" }),
    ).not.toBeInTheDocument();
    expect(localIsoDate(first)).not.toBe(localIsoDate());
  });

  it("no Mês destaca o atendimento salvo em outro mês", async () => {
    const target = new Date();
    target.setHours(12, 0, 0, 0);
    target.setDate(1);
    target.setMonth(target.getMonth() + 2);
    target.setDate(10);
    saved = [appointmentOn("m1", target)];
    renderAgenda("month");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar de teste" }));

    expect(
      await screen.findByRole("button", { name: /^Detalhes de Cliente m1/ }),
    ).toHaveClass("agenda-just-saved");
    expect(
      screen.getByText(
        target.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      ),
    ).toBeInTheDocument();
  });
});
