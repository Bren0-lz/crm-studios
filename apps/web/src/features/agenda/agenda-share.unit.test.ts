import type { Appointment, GroupSession } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { agendaShareDays, agendaShareMessage } from "./model";

const local = (date: string, time: string) =>
  new Date(`${date}T${time}:00`).toISOString();
const appointment = (
  id: string,
  date: string,
  time: string,
  extra: Partial<Appointment> = {},
) =>
  ({
    id,
    professionalId: "p1",
    patientName: `Cliente ${id}`,
    serviceName: "Pilates",
    roomName: "Estúdio",
    status: "scheduled",
    startsAt: local(date, time),
    endsAt: local(
      date,
      `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`,
    ),
    ...extra,
  }) as Appointment;

describe("agendaShareMessage", () => {
  const professional = { id: "p1", fullName: "Clara Mendes" };

  it("agrupa por dia em ordem de horário e ignora o que está fora do período", () => {
    const text = agendaShareMessage({
      professional,
      from: "2026-10-05",
      to: "2026-10-06",
      appointments: [
        appointment("b", "2026-10-06", "08:00"),
        appointment("a", "2026-10-05", "10:00"),
        appointment("fora", "2026-10-07", "10:00"),
        appointment("outro", "2026-10-05", "11:00", { professionalId: "p2" }),
      ],
      groupSessions: [
        {
          id: "g",
          professionalId: "p1",
          groupName: "Dança",
          roomName: "Sala 2",
          status: "scheduled",
          startsAt: local("2026-10-05", "07:00"),
          endsAt: local("2026-10-05", "08:00"),
        } as GroupSession,
      ],
    });
    expect(text.split("\n")).toEqual([
      "*Agenda de Clara Mendes*",
      "05/10/2026 a 06/10/2026",
      "",
      "*seg., 05/10*",
      "07:00–08:00 · Turma Dança (Sala 2)",
      "10:00–11:00 · Cliente a — Pilates (Estúdio)",
      "",
      "*ter., 06/10*",
      "08:00–09:00 · Cliente b — Pilates (Estúdio)",
    ]);
  });

  it("não repete 'Turma' quando o nome da turma já começa com ela (QV5)", () => {
    const text = agendaShareMessage({
      professional,
      from: "2026-10-05",
      to: "2026-10-05",
      appointments: [],
      groupSessions: [
        {
          id: "g",
          professionalId: "p1",
          groupName: "Turma da manhã",
          roomName: "Sala de Dança",
          status: "scheduled",
          startsAt: local("2026-10-05", "07:00"),
          endsAt: local("2026-10-05", "08:00"),
        } as GroupSession,
      ],
    });
    expect(text).toContain("07:00–08:00 · Turma da manhã (Sala de Dança)");
    expect(text).not.toMatch(/Turma Turma/i);
  });

  it("avisa quando não há atendimentos e usa uma só data para um dia", () => {
    expect(
      agendaShareMessage({
        professional,
        from: "2026-10-05",
        to: "2026-10-05",
        appointments: [
          appointment("x", "2026-10-05", "09:00", { status: "cancelled" }),
        ],
        groupSessions: [],
      }),
    ).toBe(
      "*Agenda de Clara Mendes*\n05/10/2026\n\nNenhum atendimento agendado no período.",
    );
  });

  it("conta os dias do período com as duas pontas", () => {
    expect(agendaShareDays("2026-10-01", "2026-10-01")).toBe(1);
    expect(agendaShareDays("2026-10-01", "2026-10-31")).toBe(31);
    expect(agendaShareDays("2026-10-10", "2026-10-01")).toBeLessThan(1);
  });
});
