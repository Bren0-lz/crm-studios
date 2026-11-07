import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change } from "../../test-support/workflow-ui";
import { localIsoDate, shortDate } from "../../shared/lib/formatting";

/** 1ª terça-feira a partir de daqui a 7 dias (AAAA-MM-DD local), mais `days` dias. */
function tuesday(days = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 7);
  while (date.getDay() !== 2) date.setDate(date.getDate() + 1);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}
const day = (iso: string) => shortDate.format(new Date(`${iso}T12:00`));

async function openSinglePlan(totalSessions: number) {
  const { repository } = await setupApi();
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Cliente do pacote avulso",
    phone: "11977776666",
    tags: [],
  });
  const [service] = await repository.listServices(clinicId);
  const [professional] = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const template = await repository.createPlanTemplate(clinicId, actorId, {
    name: `Massoterapia ${totalSessions} sessões`,
    kind: "single",
    totalValueInCents: totalSessions * 10000,
    services: [
      {
        serviceId: service!.id,
        totalSessions,
        totalValueInCents: totalSessions * 10000,
      },
    ],
  });
  open(`/planos?patientId=${patient.id}`);
  await screen.findByText("Nenhum plano cadastrado", { exact: true });
  fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
  const dialog = screen.getByRole("dialog", { name: "Novo plano" });
  change("Modelo", "single", dialog);
  await within(dialog).findByRole("option", {
    name: new RegExp(template.name),
  });
  change("Plano cadastrado", template.id, dialog);
  // Plano avulso: os horários da contratação já abrem, com os dias fixos de cada serviço.
  const schedule = await within(dialog).findByRole("group", {
    name: new RegExp(`${totalSessions} sessões$`),
  });
  return { repository, patient, service, professional, room, dialog, schedule };
}

function fillFixedDays(
  schedule: HTMLElement,
  ids: { professional: string; room: string },
  slots: { weekday: number; time: string }[],
) {
  change("Profissional", ids.professional, schedule);
  change("Sala", ids.room, schedule);
  change("Primeira data", tuesday(), schedule);
  slots.forEach((slot, index) => {
    if (index > 0)
      fireEvent.click(
        within(schedule).getByRole("button", { name: "Adicionar dia" }),
      );
    change(`${index + 1}º dia da semana`, String(slot.weekday), schedule);
    change(`Horário do ${index + 1}º dia`, slot.time, schedule);
  });
}

function summaryRows(dialog: HTMLElement) {
  return within(
    within(dialog).getByRole("region", { name: "Resumo das sessões" }),
  ).getAllByRole("listitem");
}

describe("single plan purchase with fixed weekdays", () => {
  it("books exactly the plan sessions, flags conflicts and changes only one session", async () => {
    const {
      repository,
      patient,
      service,
      professional,
      room,
      dialog,
      schedule,
    } = await openSinglePlan(10);
    const other = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Outra cliente",
      phone: "11966665555",
      tags: [],
    });
    // A 3ª terça às 14:00 já tem atendimento com o mesmo profissional.
    await repository.createAppointment(clinicId, {
      patientId: other.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: new Date(`${tuesday(14)}T14:00`).toISOString(),
      notes: "",
      visitType: "regular",
    });
    fillFixedDays(
      schedule,
      { professional: professional!.id, room: room!.id },
      [{ weekday: 2, time: "14:00" }],
    );
    const rows = summaryRows(dialog);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent(day(tuesday()));
    expect(rows[9]).toHaveTextContent(day(tuesday(63)));
    // Sem adicionar nem remover horários: a quantidade é sempre a do plano.
    expect(
      within(dialog).queryByRole("button", {
        name: "Adicionar horários à contratação",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Remover horário" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(summaryRows(dialog)[2]).toHaveTextContent(
        "Horário indisponível · Profissional ou sala com outro atendimento",
      ),
    );
    expect(dialog).not.toHaveTextContent("Conflito:");
    expect(summaryRows(dialog)[1]).toHaveTextContent("Livre");
    const create = within(dialog).getByRole("button", {
      name: "Criar plano e parcelas",
    });
    expect(create).toBeDisabled();
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "1 sessão está em conflito",
      ),
    );

    // Exceção: só a 3ª sessão vai para as 16:00.
    fireEvent.click(
      within(summaryRows(dialog)[2]!).getByRole("button", {
        name: "Alterar esta sessão",
      }),
    );
    const editing = screen.getByRole("dialog", { name: "Alterar a sessão 3" });
    fireEvent.change(within(editing).getByLabelText("Horário"), {
      target: { value: "16:00" },
    });
    fireEvent.click(
      within(editing).getByRole("button", { name: "Salvar esta sessão" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Alterar a sessão 3" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(create).toBeEnabled());
    const updated = summaryRows(dialog);
    expect(updated[2]).toHaveTextContent("16:00");
    expect(updated[2]).toHaveTextContent("Exceção");
    expect(updated[1]).toHaveTextContent("14:00");
    expect(updated[3]).toHaveTextContent("14:00");

    fireEvent.click(create);
    // Contratação salva: o último passo manda todas as sessões pelo WhatsApp do cliente.
    const whatsapp = await within(dialog).findByRole("link", {
      name: "Enviar sessões pelo WhatsApp",
    });
    await waitFor(() =>
      expect(whatsapp.getAttribute("href")).toContain("wa.me/5511977776666"),
    );
    const text = decodeURIComponent(whatsapp.getAttribute("href")!);
    expect(text).toContain("Massoterapia 10 sessões");
    expect(text).toContain("10. ");
    const booked = (
      await repository.listAppointments(
        clinicId,
        new Date(`${tuesday(-1)}T00:00`).toISOString(),
        new Date(`${tuesday(70)}T00:00`).toISOString(),
      )
    ).filter((item) => item.patientId === patient.id);
    expect(booked).toHaveLength(10);
    expect(
      booked.filter((item) => new Date(item.startsAt).getHours() === 16),
    ).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo plano" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("saves session changes without creating the plan and books the changed dates", async () => {
    const { repository, patient, professional, room, dialog, schedule } =
      await openSinglePlan(4);
    fillFixedDays(
      schedule,
      { professional: professional!.id, room: room!.id },
      [{ weekday: 2, time: "14:00" }],
    );
    const create = within(dialog).getByRole("button", {
      name: "Criar plano e parcelas",
    });
    await waitFor(() => expect(create).toBeEnabled());

    // Sem conflito: salvar a sessão não pode enviar a contratação.
    async function changeSession(row: number, date: string, time: string) {
      fireEvent.click(
        within(summaryRows(dialog)[row]!).getByRole("button", {
          name: "Alterar esta sessão",
        }),
      );
      const editing = screen.getByRole("dialog", {
        name: `Alterar a sessão ${row + 1}`,
      });
      fireEvent.click(
        editing.querySelector<HTMLButtonElement>(".appointment-date-trigger")!,
      );
      let target = editing.querySelector<HTMLButtonElement>(
        `[data-date="${date}"]`,
      );
      if (!target) {
        fireEvent.click(
          within(editing).getByRole("button", { name: "Próximo mês" }),
        );
        target = editing.querySelector<HTMLButtonElement>(
          `[data-date="${date}"]`,
        );
      }
      fireEvent.click(target!);
      fireEvent.change(within(editing).getByLabelText("Horário"), {
        target: { value: time },
      });
      fireEvent.click(
        within(editing).getByRole("button", { name: "Salvar esta sessão" }),
      );
      expect(
        screen.queryByRole("dialog", { name: `Alterar a sessão ${row + 1}` }),
      ).not.toBeInTheDocument();
    }

    await changeSession(1, tuesday(10), "10:00");
    await waitFor(() =>
      expect(summaryRows(dialog)[1]).toHaveTextContent(
        `${day(tuesday(10))} · 10:00`,
      ),
    );
    expect(summaryRows(dialog)[1]).toHaveTextContent("Exceção");
    // A contratação continua aberta e nada foi gravado: dá para seguir alterando.
    expect(screen.getByRole("dialog", { name: "Novo plano" })).toBe(dialog);
    expect(
      within(dialog).queryByRole("link", {
        name: "Enviar sessões pelo WhatsApp",
      }),
    ).not.toBeInTheDocument();
    expect(await repository.listPatientPlans(clinicId, patient.id)).toEqual(
      [],
    );

    await changeSession(3, tuesday(22), "18:00");
    await waitFor(() =>
      expect(summaryRows(dialog)[3]).toHaveTextContent(
        `${day(tuesday(22))} · 18:00`,
      ),
    );
    expect(await repository.listPatientPlans(clinicId, patient.id)).toEqual(
      [],
    );

    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    const whatsapp = await within(dialog).findByRole("link", {
      name: "Enviar sessões pelo WhatsApp",
    });
    const text = decodeURIComponent(whatsapp.getAttribute("href")!);
    expect(text).toContain(`${day(tuesday(10))} · 10:00`);
    expect(text).toContain(`${day(tuesday(22))} · 18:00`);
    expect(text).not.toContain(`${day(tuesday(7))} · 14:00`);
    expect(text).not.toContain(`${day(tuesday(21))} · 14:00`);
    expect(await repository.listPatientPlans(clinicId, patient.id)).toHaveLength(
      1,
    );
    const booked = (
      await repository.listAppointments(
        clinicId,
        new Date(`${tuesday(-1)}T00:00`).toISOString(),
        new Date(`${tuesday(40)}T00:00`).toISOString(),
      )
    )
      .filter((item) => item.patientId === patient.id)
      .map((item) => new Date(item.startsAt).getTime())
      .sort((a, b) => a - b);
    expect(booked).toEqual(
      [
        `${tuesday()}T14:00`,
        `${tuesday(10)}T10:00`,
        `${tuesday(14)}T14:00`,
        `${tuesday(22)}T18:00`,
      ].map((local) => new Date(local).getTime()),
    );
  });

  it("spreads the sessions over more than one weekday without passing the plan total", async () => {
    const { professional, room, dialog, schedule } = await openSinglePlan(5);
    fillFixedDays(
      schedule,
      { professional: professional!.id, room: room!.id },
      [
        { weekday: 2, time: "09:00" },
        { weekday: 4, time: "18:00" },
      ],
    );
    const rows = summaryRows(dialog);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(`${day(tuesday())} · 09:00`),
      expect.stringContaining(`${day(tuesday(2))} · 18:00`),
      expect.stringContaining(`${day(tuesday(7))} · 09:00`),
      expect.stringContaining(`${day(tuesday(9))} · 18:00`),
      expect.stringContaining(`${day(tuesday(14))} · 09:00`),
    ]);
  });
});
