import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment, GroupSession, Holiday, ScheduleBlock } from "@crm/contracts";
import { AppointmentDateTimePicker } from "./AppointmentDateTimePicker";
import { api } from "./api";

vi.mock("./api", () => ({ api: {
  appointments: vi.fn(), groupSessions: vi.fn(), scheduleBlocks: vi.fn(), holidays: vi.fn(),
} }));

const stamp = "2026-10-01T12:00:00.000Z";
function at(day: string, time: string) { return new Date(`${day}T${time}`).toISOString(); }
function appointment(id: string, time: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id, clinicId: "clinic", patientId: "patient", patientName: "Nome confidencial",
    professionalId: "ana", professionalName: "Ana", professionalColor: "#184f43",
    roomId: "one", roomName: "Sala 1", serviceId: "service", serviceName: "Serviço",
    startsAt: at("2026-10-07", time), endsAt: at("2026-10-07", `${Number(time.slice(0, 2)) + 1}:00`),
    visitType: "regular", notes: "", status: "scheduled", createdAt: stamp, updatedAt: stamp,
    ...overrides,
  };
}
function group(overrides: Partial<GroupSession> = {}): GroupSession {
  return { id: "group", clinicId: "clinic", groupId: "class", groupName: "Nome da turma",
    professionalId: "ana", professionalName: "Ana", roomId: "one", roomName: "Sala 1",
    startsAt: at("2026-10-07", "08:00"), endsAt: at("2026-10-07", "09:00"),
    status: "scheduled", attendanceCount: 0, createdAt: stamp, ...overrides };
}
function block(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return { id: "block", clinicId: "clinic", professionalId: "ana", reason: "Motivo privado",
    startsAt: at("2026-10-07", "12:00"), endsAt: at("2026-10-07", "13:00"),
    status: "active", createdAt: stamp, updatedAt: stamp, ...overrides };
}

function Harness({ initial = "2026-10-07T15:30", professionalId = "", roomId = "", excludeAppointmentId, disabled = false }: {
  initial?: string; professionalId?: string; roomId?: string; excludeAppointmentId?: string; disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return <form aria-label="Agendamento"><AppointmentDateTimePicker value={value} onChange={setValue}
    professionalId={professionalId} roomId={roomId} disabled={disabled}
    {...(excludeAppointmentId ? { excludeAppointmentId } : {})} /><output aria-label="Valor selecionado">{value}</output></form>;
}

function open() { fireEvent.click(screen.getByRole("button", { name: "Data" })); }
function day(date: string) { return document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!; }

beforeEach(() => {
  vi.mocked(api.appointments).mockResolvedValue([]);
  vi.mocked(api.groupSessions).mockResolvedValue([]);
  vi.mocked(api.scheduleBlocks).mockResolvedValue([]);
  vi.mocked(api.holidays).mockResolvedValue([]);
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetAllMocks();
});

describe("appointment calendar", () => {
  it("preserves the time when choosing a date and keeps time editable", async () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Data" })).toHaveTextContent("07/10/2026");
    expect(api.appointments).not.toHaveBeenCalled();
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    fireEvent.click(day("2026-10-08"));
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent("2026-10-08T15:30");
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "16:45" } });
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent("2026-10-08T16:45");
    expect(day("2026-10-08")).toHaveAttribute("aria-pressed", "true");
  });

  it("requires both date and time without assigning a default time", async () => {
    render(<Harness initial="" />);
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(false);
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "09:00" } });
    expect(form.checkValidity()).toBe(false);
    open();
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!);
    expect(form.checkValidity()).toBe(true);
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "" } });
    expect(form.checkValidity()).toBe(false);
    await waitFor(() => expect(screen.queryByText("Consultando agenda…")).not.toBeInTheDocument());
  });

  it("shows chronological anonymous intervals, holidays and markers", async () => {
    vi.mocked(api.appointments).mockResolvedValue([appointment("visit", "10:00")]);
    vi.mocked(api.groupSessions).mockResolvedValue([group()]);
    vi.mocked(api.scheduleBlocks).mockResolvedValue([block()]);
    vi.mocked(api.holidays).mockResolvedValue([{ id: "holiday", clinicId: "clinic", date: "2026-10-07", name: "Feriado local", createdAt: stamp } as Holiday]);
    render(<Harness />); open();
    const list = await screen.findByRole("list", { name: "Horários ocupados" });
    expect(screen.getByText("Outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText("Quarta, 7 de outubro")).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "08:00–09:00Turma", "10:00–11:00Atendimento", "12:00–13:00Bloqueio",
    ]);
    expect(day("2026-10-07")).toHaveAccessibleName(/3 compromissos, feriado: Feriado local/);
    expect(screen.getByText("Feriado: Feriado local")).toBeInTheDocument();
    expect(screen.queryByText("Nome confidencial")).not.toBeInTheDocument();
    expect(screen.queryByText("Nome da turma")).not.toBeInTheDocument();
    expect(screen.queryByText("Motivo privado")).not.toBeInTheDocument();
  });

  it("filters by professional OR room and updates selection without fetching again", async () => {
    vi.mocked(api.appointments).mockResolvedValue([
      appointment("professional", "09:00", { roomId: "two" }),
      appointment("room", "10:00", { professionalId: "bia" }),
      appointment("neither", "11:00", { professionalId: "bia", roomId: "two" }),
    ]);
    const view = render(<Harness professionalId="ana" roomId="one" />); open();
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
    vi.mocked(api.appointments).mockResolvedValue([appointment("self", "10:00"), appointment("cancelled", "11:00", { status: "cancelled" })]);
    vi.mocked(api.groupSessions).mockResolvedValue([group({ status: "cancelled" })]);
    vi.mocked(api.scheduleBlocks).mockResolvedValue([block({ status: "cancelled" })]);
    render(<Harness excludeAppointmentId="self" />); open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(day("2026-10-07")).not.toHaveAccessibleName(/compromisso/);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("includes overnight occupancy on both days, excluding an exact midnight end", async () => {
    vi.mocked(api.scheduleBlocks).mockResolvedValue([block({ startsAt: at("2026-10-06", "23:00"), endsAt: at("2026-10-08", "01:00") })]);
    render(<Harness />); open();
    await screen.findByText("00:00–24:00");
    expect(day("2026-10-06")).toHaveAccessibleName(/1 compromisso/);
    expect(day("2026-10-08")).toHaveAccessibleName(/1 compromisso/);
    fireEvent.click(day("2026-10-08"));
    expect(screen.getByText("00:00–01:00")).toBeInTheDocument();
    vi.mocked(api.scheduleBlocks).mockResolvedValue([block({ startsAt: at("2026-10-06", "23:00"), endsAt: at("2026-10-07", "00:00") })]);
    fireEvent.click(screen.getByRole("button", { name: "Fechar calendário" })); open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(day("2026-10-07")).not.toHaveAccessibleName(/compromisso/);
  });

  it("loads the complete visible grid when navigating to another month", async () => {
    render(<Harness />); open(); await screen.findByText("Nenhum compromisso registrado.");
    expect(api.appointments).toHaveBeenLastCalledWith(at("2026-09-28", "00:00"), at("2026-11-02", "00:00"));
    expect(api.holidays).toHaveBeenLastCalledWith("2026-09-28", "2026-11-01");
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    await waitFor(() => expect(api.appointments).toHaveBeenLastCalledWith(at("2026-10-26", "00:00"), at("2026-12-07", "00:00")));
    expect(screen.queryByText("Nenhum compromisso registrado.")).not.toBeInTheDocument();
    fireEvent.click(day("2026-11-15"));
    await screen.findByText("Nenhum compromisso registrado.");
    expect(screen.getByLabelText("Valor selecionado")).toHaveTextContent("2026-11-15T15:30");
  });

  it("shows loading and retryable errors without suggesting an empty agenda", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.appointments).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(<Harness />); open();
    expect(screen.getByText("Consultando agenda…")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum compromisso registrado.")).not.toBeInTheDocument();
    await act(async () => reject(new Error("Consulta indisponível")));
    expect(screen.getByRole("alert")).toHaveTextContent("Consulta indisponível");
    expect(screen.queryByText("Nenhum compromisso registrado.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Nenhum compromisso registrado.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores responses from a previously visible month", async () => {
    let resolve!: (items: Appointment[]) => void;
    vi.mocked(api.appointments).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<Harness />); open();
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    fireEvent.click(day("2026-11-07"));
    await screen.findByText("Nenhum compromisso registrado.");
    await act(async () => resolve([appointment("old", "10:00", { startsAt: at("2026-11-07", "10:00"), endsAt: at("2026-11-07", "11:00") })]));
    expect(screen.getByText("Nenhum compromisso registrado.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation across months and Escape only closes the calendar", async () => {
    const outerEscape = vi.fn();
    render(<div onKeyDown={outerEscape}><Harness initial="2026-10-31T15:30" /></div>); open();
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
    const view = render(<Harness />); open();
    await screen.findByText("Nenhum compromisso registrado.");
    view.rerender(<Harness disabled />);
    expect(screen.getByRole("button", { name: "Data" })).toBeDisabled();
    expect(screen.getByLabelText("Horário")).toBeDisabled();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("opens in the native top layer within the form and toggles from the date field", async () => {
    const showPopover = vi.spyOn(HTMLElement.prototype, "showPopover");
    render(<Harness />); open();
    const panel = screen.getByRole("region", { name: "Calendário de agendamento" });
    expect(panel).toHaveAttribute("popover", "manual");
    expect(screen.getByRole("form")).toContainElement(panel);
    expect(showPopover).toHaveBeenCalledTimes(1);
    await screen.findByText("Nenhum compromisso registrado.");
    open();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data" })).toHaveFocus();
    open();
    await screen.findByText("Nenhum compromisso registrado.");
    expect(showPopover).toHaveBeenCalledTimes(2);
  });

  it("stays open when selecting a day and dismisses on outside pointer interaction", async () => {
    render(<><Harness /><button type="button">Outro campo</button></>); open();
    await screen.findByText("Nenhum compromisso registrado.");
    fireEvent.pointerDown(day("2026-10-08"));
    fireEvent.click(day("2026-10-08"));
    expect(screen.getByRole("region")).toBeInTheDocument();
    const outside = screen.getByRole("button", { name: "Outro campo" });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it("keeps the panel inside horizontal bounds and switches above a low field", async () => {
    vi.stubGlobal("innerWidth", 650);
    vi.stubGlobal("innerHeight", 600);
    let anchor = new DOMRect(600, 70, 170, 43);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("appointment-calendar")
        ? new DOMRect(0, 0, parseFloat(this.style.width), Math.min(460, parseFloat(this.style.maxHeight))) : anchor;
    });
    render(<Harness />); open();
    const panel = screen.getByRole("region");
    expect(panel).toHaveStyle({ width: "340px", left: "298px", top: "121px", maxHeight: "467px" });
    anchor = new DOMRect(600, 480, 170, 43);
    fireEvent.scroll(document);
    expect(panel).toHaveStyle({ left: "298px", top: "12px", maxHeight: "460px" });
    await screen.findByText("Nenhum compromisso registrado.");
  });

  it("constrains a long panel on mobile and repositions after viewport and content changes", async () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 360);
    let contentHeight = 460;
    let resizePanel!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resizePanel = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("appointment-calendar")
        ? new DOMRect(0, 0, parseFloat(this.style.width), Math.min(contentHeight, parseFloat(this.style.maxHeight)))
        : new DOMRect(5, 150, 170, 43);
    });
    render(<Harness />); open();
    const panel = screen.getByRole("region");
    expect(panel).toHaveStyle({ width: "296px", left: "12px", top: "201px", maxHeight: "147px" });
    vi.stubGlobal("innerHeight", 300);
    fireEvent(window, new Event("resize"));
    expect(panel).toHaveStyle({ top: "12px", maxHeight: "130px" });
    contentHeight = 70;
    act(() => resizePanel());
    expect(panel).toHaveStyle({ top: "201px", maxHeight: "87px" });
    await screen.findByText("Nenhum compromisso registrado.");
    fireEvent.click(screen.getByRole("button", { name: "Fechar calendário" }));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Data" })).toHaveFocus();
  });
});
