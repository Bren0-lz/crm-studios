import type {
  Appointment,
  GroupSession,
  Holiday,
  ScheduleBlock,
} from "@crm/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { api } from "../../api";
import { computeFloatingPosition } from "./calendar-position";

vi.mock("../../api", () => ({
  api: {
    appointments: vi.fn(),
    groupSessions: vi.fn(),
    scheduleBlocks: vi.fn(),
    holidays: vi.fn(),
  },
}));

const stamp = "2026-10-01T12:00:00.000Z";
function at(day: string, time: string) {
  return new Date(`${day}T${time}`).toISOString();
}
function appointment(
  id: string,
  time: string,
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id,
    clinicId: "clinic",
    patientId: "patient",
    patientName: "Nome confidencial",
    professionalId: "ana",
    professionalName: "Ana",
    professionalColor: "#184f43",
    roomId: "one",
    roomName: "Sala 1",
    serviceId: "service",
    serviceName: "Serviço",
    startsAt: at("2026-10-07", time),
    endsAt: at("2026-10-07", `${Number(time.slice(0, 2)) + 1}:00`),
    visitType: "regular",
    notes: "",
    status: "scheduled",
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}
function group(overrides: Partial<GroupSession> = {}): GroupSession {
  return {
    id: "group",
    clinicId: "clinic",
    groupId: "class",
    groupName: "Nome da turma",
    professionalId: "ana",
    professionalName: "Ana",
    roomId: "one",
    roomName: "Sala 1",
    startsAt: at("2026-10-07", "08:00"),
    endsAt: at("2026-10-07", "09:00"),
    status: "scheduled",
    attendanceCount: 0,
    createdAt: stamp,
    ...overrides,
  };
}
function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: "block",
    clinicId: "clinic",
    professionalId: "ana",
    professionalName: "Ana",
    reason: "Motivo privado",
    startsAt: at("2026-10-07", "12:00"),
    endsAt: at("2026-10-07", "13:00"),
    status: "active",
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

function Harness({
  initial = "2026-10-07T15:30",
  professionalId = "",
  roomId = "",
  excludeAppointmentId,
  disabled = false,
}: {
  initial?: string;
  professionalId?: string;
  roomId?: string;
  excludeAppointmentId?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form aria-label="Agendamento">
      <AppointmentDateTimePicker
        value={value}
        onChange={setValue}
        professionalId={professionalId}
        roomId={roomId}
        disabled={disabled}
        {...(excludeAppointmentId ? { excludeAppointmentId } : {})}
      />
      <output aria-label="Valor selecionado">{value}</output>
    </form>
  );
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Data" }));
}
function day(date: string) {
  return document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
}

beforeEach(() => {
  vi.mocked(api.appointments).mockResolvedValue([]);
  vi.mocked(api.groupSessions).mockResolvedValue([]);
  vi.mocked(api.scheduleBlocks).mockResolvedValue([]);
  vi.mocked(api.holidays).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("appointment calendar", () => {
  it("edits time in the panel while keeping occupied intervals visible and both fields synchronized", async () => {
    vi.mocked(api.appointments).mockResolvedValue([
      appointment("visit", "10:00"),
    ]);
    render(<Harness />);
    open();
    const list = await screen.findByRole("list", { name: "Horários ocupados" });
    const inside = screen.getByLabelText("Horário");
    const outside = screen.getByLabelText("Horário");
    expect(inside).toHaveValue("15:30");
    fireEvent.pointerDown(inside);
    act(() => inside.focus());
    fireEvent.change(inside, { target: { value: "16:45" } });
    expect(inside).toHaveFocus();
    expect(outside).toHaveValue("16:45");
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
      "2026-10-07T16:45",
    );
    expect(list).toBeInTheDocument();
    expect(screen.getByText("10:00–11:00")).toBeInTheDocument();
    fireEvent.pointerDown(outside);
    act(() => outside.focus());
    fireEvent.change(outside, { target: { value: "17:15" } });
    expect(outside).toHaveFocus();
    expect(inside).toHaveValue("17:15");
    expect(list).toBeInTheDocument();
    expect(api.appointments).toHaveBeenCalledTimes(1);
    fireEvent.click(day("2026-10-08"));
    expect(inside).toHaveValue("17:15");
    expect(outside).toHaveValue("17:15");
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
      "2026-10-08T17:15",
    );
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(outside).toHaveValue("17:15");
  });

  it("validates synchronized time while open and after closing the panel", async () => {
    render(<Harness initial="2026-10-07T" />);
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(false);
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(form.checkValidity()).toBe(false);
    const inside = screen.getByLabelText("Horário");
    fireEvent.change(inside, { target: { value: "09:30" } });
    expect(form.checkValidity()).toBe(true);
    fireEvent.change(inside, { target: { value: "" } });
    expect(form.checkValidity()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Fechar calendário" }));
    expect(form.checkValidity()).toBe(false);
    fireEvent.change(screen.getByLabelText("Horário"), {
      target: { value: "09:30" },
    });
    expect(form.checkValidity()).toBe(true);
  });

  it("preserves the time when choosing a date and keeps time editable", async () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Data" })).toHaveTextContent(
      "07/10/2026",
    );
    expect(api.appointments).not.toHaveBeenCalled();
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    fireEvent.click(day("2026-10-08"));
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
      "2026-10-08T15:30",
    );
    fireEvent.change(screen.getByLabelText("Horário"), {
      target: { value: "16:45" },
    });
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
      "2026-10-08T16:45",
    );
    expect(day("2026-10-08")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Quinta, 8 de outubro")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum compromisso registrado."),
    ).toBeInTheDocument();
  });

  it("requires both date and time without assigning a default time", async () => {
    render(<Harness initial="" />);
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(false);
    fireEvent.change(screen.getByLabelText("Horário"), {
      target: { value: "09:00" },
    });
    expect(form.checkValidity()).toBe(false);
    open();
    fireEvent.click(
      document.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!,
    );
    expect(form.checkValidity()).toBe(true);
    fireEvent.change(screen.getByLabelText("Horário"), {
      target: { value: "" },
    });
    expect(form.checkValidity()).toBe(false);
    await waitFor(() =>
      expect(screen.queryByText("Consultando agenda…")).not.toBeInTheDocument(),
    );
  });

  it("shows chronological intervals with activity, professional and room, without client names or block reasons", async () => {
    vi.mocked(api.appointments).mockResolvedValue([
      appointment("visit", "10:00"),
    ]);
    vi.mocked(api.groupSessions).mockResolvedValue([group()]);
    vi.mocked(api.scheduleBlocks).mockResolvedValue([block()]);
    vi.mocked(api.holidays).mockResolvedValue([
      {
        id: "holiday",
        clinicId: "clinic",
        date: "2026-10-07",
        name: "Feriado local",
        createdAt: stamp,
      } as Holiday,
    ]);
    render(<Harness />);
    open();
    const list = await screen.findByRole("list", { name: "Horários ocupados" });
    expect(screen.getByText("Outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText("Quarta, 7 de outubro")).toBeInTheDocument();
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "08:00–09:00Nome da turmaAna · Sala 1Turma",
      "10:00–11:00ServiçoAna · Sala 1Atendimento",
      "12:00–13:00Horário bloqueadoAnaBloqueio",
    ]);
    expect(day("2026-10-07")).toHaveAccessibleName(
      /3 compromissos, feriado: Feriado local/,
    );
    expect(screen.getByText("Feriado: Feriado local")).toBeInTheDocument();
    expect(screen.queryByText("Nome confidencial")).not.toBeInTheDocument();
    expect(screen.queryByText("Motivo privado")).not.toBeInTheDocument();
  });

  it("filters by professional OR room and updates selection without fetching again", async () => {
    vi.mocked(api.appointments).mockResolvedValue([
      appointment("professional", "09:00", { roomId: "two" }),
      appointment("room", "10:00", { professionalId: "bia" }),
      appointment("neither", "11:00", { professionalId: "bia", roomId: "two" }),
    ]);
    const view = render(<Harness professionalId="ana" roomId="one" />);
    open();
    await screen.findByRole("list");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    view.rerender(<Harness professionalId="ana" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("09:00–10:00")).toBeInTheDocument();
    view.rerender(<Harness roomId="one" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("10:00–11:00")).toBeInTheDocument();
    view.rerender(<Harness />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(api.appointments).toHaveBeenCalledTimes(1);
  });

  it("ignores cancellations, inactive blocks and the appointment being rescheduled", async () => {
    vi.mocked(api.appointments).mockResolvedValue([
      appointment("self", "10:00"),
      appointment("cancelled", "11:00", { status: "cancelled" }),
    ]);
    vi.mocked(api.groupSessions).mockResolvedValue([
      group({ status: "cancelled" }),
    ]);
    vi.mocked(api.scheduleBlocks).mockResolvedValue([
      block({ status: "cancelled" }),
    ]);
    render(<Harness excludeAppointmentId="self" />);
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(day("2026-10-07")).not.toHaveAccessibleName(/compromisso/);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("includes overnight occupancy on both days, excluding an exact midnight end", async () => {
    vi.mocked(api.scheduleBlocks).mockResolvedValue([
      block({
        startsAt: at("2026-10-06", "23:00"),
        endsAt: at("2026-10-08", "01:00"),
      }),
    ]);
    render(<Harness />);
    open();
    await screen.findByText("00:00–24:00");
    expect(day("2026-10-06")).toHaveAccessibleName(/1 compromisso/);
    expect(day("2026-10-08")).toHaveAccessibleName(/1 compromisso/);
    fireEvent.click(day("2026-10-08"));
    expect(screen.getByText("00:00–01:00")).toBeInTheDocument();
    vi.mocked(api.scheduleBlocks).mockResolvedValue([
      block({
        startsAt: at("2026-10-06", "23:00"),
        endsAt: at("2026-10-07", "00:00"),
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Fechar calendário" }));
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(day("2026-10-07")).not.toHaveAccessibleName(/compromisso/);
  });

  it("loads the complete visible grid when navigating to another month", async () => {
    render(<Harness />);
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(api.appointments).toHaveBeenLastCalledWith(
      at("2026-09-28", "00:00"),
      at("2026-11-02", "00:00"),
    );
    expect(api.holidays).toHaveBeenLastCalledWith("2026-09-28", "2026-11-01");
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    await waitFor(() =>
      expect(api.appointments).toHaveBeenLastCalledWith(
        at("2026-10-26", "00:00"),
        at("2026-12-07", "00:00"),
      ),
    );
    expect(
      screen.queryByText("Nenhum compromisso registrado."),
    ).not.toBeInTheDocument();
    fireEvent.click(day("2026-11-15"));
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
      "2026-11-15T15:30",
    );
    expect(screen.getByRole("table")).toHaveAccessibleName("novembro de 2026");
    await screen.findByText("Nenhum compromisso registrado.");
  });

  it("shows loading and retryable errors without suggesting an empty agenda", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.appointments).mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<Harness />);
    open();
    expect(screen.getByText("Consultando agenda…")).toBeInTheDocument();
    expect(
      screen.queryByText("Nenhum compromisso registrado."),
    ).not.toBeInTheDocument();
    await act(async () => reject(new Error("Consulta indisponível")));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Consulta indisponível",
    );
    expect(
      screen.queryByText("Nenhum compromisso registrado."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Nenhum compromisso registrado.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores responses from a previously visible month", async () => {
    let resolve!: (items: Appointment[]) => void;
    vi.mocked(api.appointments).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    // 28/10 aparece tanto na grade de outubro quanto na de novembro.
    render(<Harness initial="2026-10-28T15:30" />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    await screen.findByText("Nenhum compromisso registrado.");
    await act(async () =>
      resolve([
        appointment("old", "10:00", {
          startsAt: at("2026-10-28", "10:00"),
          endsAt: at("2026-10-28", "11:00"),
        }),
      ]),
    );
    expect(
      screen.getByText("Nenhum compromisso registrado."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation across months and Escape only closes the calendar", async () => {
    const outerEscape = vi.fn();
    render(
      <div onKeyDown={outerEscape}>
        <Harness initial="2026-10-31T15:30" />
      </div>,
    );
    open();
    expect(day("2026-10-31")).toHaveFocus();
    fireEvent.keyDown(day("2026-10-31"), { key: "ArrowRight" });
    expect(day("2026-11-01")).toHaveFocus();
    expect(screen.getByRole("table")).toHaveAccessibleName("novembro de 2026");
    fireEvent.keyDown(day("2026-11-01"), { key: "Home" });
    expect(day("2026-10-26")).toHaveFocus();
    fireEvent.keyDown(day("2026-10-26"), { key: "PageDown" });
    expect(day("2026-11-26")).toHaveFocus();
    outerEscape.mockClear();
    fireEvent.keyDown(day("2026-11-26"), { key: "Escape" });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data" })).toHaveFocus();
    expect(outerEscape).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it("disables both controls and hides an open calendar during saving", async () => {
    const view = render(<Harness />);
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    view.rerender(<Harness disabled />);
    expect(screen.getByRole("button", { name: "Data" })).toBeDisabled();
    expect(screen.getByLabelText("Horário")).toBeDisabled();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("stays open when selecting a day to show its agenda and dismisses on outside pointer interaction", async () => {
    render(
      <>
        <Harness />
        <button type="button">Outro campo</button>
      </>,
    );
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    fireEvent.pointerDown(day("2026-10-08"));
    fireEvent.click(day("2026-10-08"));
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.getByText("Quinta, 8 de outubro")).toBeInTheDocument();
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
      "2026-10-08T15:30",
    );
    expect(screen.getByRole("button", { name: "Data" })).toHaveTextContent(
      "08/10/2026",
    );
    expect(screen.getByLabelText("Horário")).toHaveValue("15:30");
    // Dia de outro mês na grade leva o calendário para aquele mês.
    fireEvent.click(day("2026-11-01"));
    expect(screen.getByRole("table")).toHaveAccessibleName("novembro de 2026");
    expect(day("2026-11-01")).toHaveAttribute("aria-pressed", "true");
    await screen.findByText("Nenhum compromisso registrado.");
    const outside = screen.getByRole("button", { name: "Outro campo" });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it("opens inside the form, without the browser top layer, and closes with the X", async () => {
    render(<Harness />);
    open();
    const panel = screen.getByRole("region", {
      name: "Calendário de agendamento",
    });
    expect(panel).not.toHaveAttribute("popover");
    expect(screen.getByRole("form")).toContainElement(panel);
    await screen.findByText("Nenhum compromisso registrado.");
    fireEvent.click(screen.getByRole("button", { name: "Fechar calendário" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data" })).toHaveFocus();
  });

  it("has a single time field that does not open the calendar on focus", async () => {
    render(<Harness />);
    const time = screen.getByLabelText("Horário");
    act(() => time.focus());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(screen.getAllByLabelText(/Horário/)).toHaveLength(1);
  });

  it("marks past days with their own style and description, keeping them selectable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T12:00:00"));
    try {
      render(<Harness />);
      open();
      await screen.findByText("Nenhum compromisso registrado.");
      expect(day("2026-10-09")).toHaveClass("past");
      expect(day("2026-10-09")).toHaveAccessibleName(/dia passado/);
      expect(day("2026-10-10")).not.toHaveClass("past");
      expect(day("2026-10-10")).toHaveAttribute("aria-current", "date");
      expect(day("2026-10-11")).not.toHaveClass("past");
      expect(day("2026-10-11")).not.toHaveAccessibleName(/dia passado/);
      expect(day("2026-10-09")).toBeEnabled();
      fireEvent.click(day("2026-10-09"));
      expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent(
        "2026-10-09T15:30",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes only the calendar on Escape even when focus is outside the picker", async () => {
    const modalEscape = vi.fn();
    window.addEventListener("keydown", modalEscape);
    try {
      render(<Harness />);
      open();
      await screen.findByText("Nenhum compromisso registrado.");
      act(() => (document.activeElement as HTMLElement | null)?.blur());
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
      expect(modalEscape).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(modalEscape).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", modalEscape);
    }
  });

  it("floats the panel with coordinates computed against the viewport", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Data" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 700,
      bottom: 740,
      left: 900,
      right: 1000,
      width: 100,
      height: 40,
      x: 900,
      y: 700,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const rect = { top: 0, left: 0, width: 360, height: 480 };
        return {
          ...rect,
          bottom: rect.height,
          right: rect.width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);
    open();
    const panel = screen.getByRole("region");
    expect(panel.dataset.placement).toBe("above");
    expect(panel.dataset.align).toBe("end");
    expect(panel.style.getPropertyValue("--calendar-top")).toBe("216px");
    expect(panel.style.getPropertyValue("--calendar-left")).toBe("640px");
    await screen.findByText("Nenhum compromisso registrado.");
  });
});

describe("computeFloatingPosition", () => {
  const viewport = { top: 0, left: 0, width: 1000, height: 800 };
  const panel = { width: 360, height: 400 };
  function trigger(top: number, left: number, width = 200, height = 40) {
    return { top, bottom: top + height, left, right: left + width };
  }

  it("opens below and aligned to the trigger start when there is room", () => {
    expect(
      computeFloatingPosition({ trigger: trigger(100, 50), panel, viewport }),
    ).toEqual({
      top: 144,
      left: 50,
      width: 360,
      maxHeight: 648,
      placement: "below",
      align: "start",
    });
  });

  it("opens above when there is no room below", () => {
    const position = computeFloatingPosition({
      trigger: trigger(600, 50),
      panel,
      viewport,
    });
    expect(position.placement).toBe("above");
    expect(position.top).toBe(600 - 4 - 400);
    expect(position.top + 400).toBeLessThanOrEqual(600);
  });

  it("aligns to the trigger end when it does not fit from the left", () => {
    const position = computeFloatingPosition({
      trigger: trigger(100, 760),
      panel,
      viewport,
    });
    expect(position.align).toBe("end");
    expect(position.left).toBe(960 - 360);
  });

  it("stays inside the viewport and limits height when neither side fits", () => {
    const small = { top: 0, left: 0, width: 320, height: 500 };
    const position = computeFloatingPosition({
      trigger: trigger(200, 100, 200, 40),
      panel: { width: 360, height: 700 },
      viewport: small,
    });
    expect(position.width).toBe(320 - 16);
    expect(position.left).toBe(8);
    expect(position.placement).toBe("below");
    expect(position.maxHeight).toBe(500 - 8 - 240 - 4);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(500 - 8);
  });

  it("respects the visual viewport offset", () => {
    const position = computeFloatingPosition({
      trigger: trigger(150, 120),
      panel,
      viewport: { top: 100, left: 100, width: 400, height: 600 },
    });
    expect(position.left).toBeGreaterThanOrEqual(108);
    expect(position.left + position.width).toBeLessThanOrEqual(492);
    expect(position.top).toBeGreaterThanOrEqual(108);
  });
});
