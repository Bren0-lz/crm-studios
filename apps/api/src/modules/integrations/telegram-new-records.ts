import type {
  AppointmentsCreatedEvent,
  CreatedAppointmentSummary,
  PatientCreatedEvent,
  PatientsImportedEvent,
} from "../../infrastructure/domain-events.js";
import type { ClinicRepository } from "../../repository.js";
import { DEFAULT_CLINIC_TIMEZONE } from "../finance/daily-cash.js";
import {
  telegramAppointmentCpfs,
  telegramClock,
  telegramCpf,
  telegramMessagePages,
} from "./telegram-messages.js";
import type { TelegramService } from "./telegram.js";

type Repository = Pick<
  ClinicRepository,
  "findUserById" | "getClinicSettings" | "getPatient" | "listLeads"
>;
type AppointmentWithCpf = CreatedAppointmentSummary & {
  cpf?: string | undefined;
};

export function formatAppointmentsCreatedMessages(
  appointments: readonly AppointmentWithCpf[],
  actorName: string | undefined,
  timeZone: string,
) {
  const clock = telegramClock(timeZone);
  const groups = new Map<string, AppointmentWithCpf[]>();
  for (const item of appointments) {
    const key = JSON.stringify([
      item.patientId,
      item.leadId,
      item.patientName,
      item.serviceName,
      item.professionalName,
    ]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const title =
    appointments.length === 1 ? "Novo agendamento" : "Novos agendamentos";
  return telegramMessagePages(
    actorName ? `${title}\nMarcado por ${actorName}.` : title,
    [...groups.values()].map((group) => {
      const item = group[0]!;
      const clientLabel = item.leadId ? "Pessoa interessada" : "Cliente";
      const heading = [
        `${clientLabel}: ${item.patientName}`,
        telegramCpf(item.cpf),
        `Serviço: ${item.serviceName}`,
        `Profissional: ${item.professionalName}`,
      ].join("\n");
      const lines = group
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
        .map(({ startsAt }) => {
          const when = clock.dateTime(new Date(startsAt));
          return group.length === 1 ? `Quando: ${when}` : `• ${when}`;
        });
      return { heading, lines };
    }),
  );
}

async function actorName(
  repository: Pick<Repository, "findUserById">,
  clinicId: string,
  userId: string,
) {
  return (await repository.findUserById(clinicId, userId))?.fullName;
}

/** Consumidor de `appointments.created`: só roda depois do commit da criação. */
export function createAppointmentsCreatedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Repository;
  telegram: TelegramService;
}) {
  return async (event: AppointmentsCreatedEvent) => {
    if (!telegram.enabled || event.appointments.length === 0) return;
    const [actor, settings, cpfOf] = await Promise.all([
      actorName(repository, event.clinicId, event.actorUserId),
      repository.getClinicSettings(event.clinicId),
      telegramAppointmentCpfs(repository, event.clinicId, event.appointments),
    ]);
    await telegram.notifyLinkedChats(
      event.clinicId,
      "appointments",
      formatAppointmentsCreatedMessages(
        event.appointments.map((item) => ({ ...item, cpf: cpfOf(item) })),
        actor,
        settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
      ),
    );
  };
}

/** Consumidor de `patient.created`: só roda depois do commit do cadastro. */
export function createPatientCreatedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Pick<Repository, "findUserById">;
  telegram: TelegramService;
}) {
  return async (event: PatientCreatedEvent) => {
    if (!telegram.enabled) return;
    const actor = await actorName(
      repository,
      event.clinicId,
      event.actorUserId,
    );
    await telegram.notifyLinkedChats(event.clinicId, "patients", [
      [
        "Novo cadastro de cliente",
        "",
        `Cliente: ${event.fullName}`,
        telegramCpf(event.cpf),
        ...(actor ? [`Cadastro feito por ${actor}.`] : []),
      ].join("\n"),
    ]);
  };
}

/** Consumidor de `patients.imported`: lista os novos cadastros em um aviso por lote. */
export function createPatientsImportedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Pick<Repository, "findUserById">;
  telegram: TelegramService;
}) {
  return async (event: PatientsImportedEvent) => {
    const count = event.patients.length;
    if (!telegram.enabled || count === 0) return;
    const actor = await actorName(
      repository,
      event.clinicId,
      event.actorUserId,
    );
    const summary =
      count === 1 ? "1 novo cadastro" : `${count} novos cadastros`;
    await telegram.notifyLinkedChats(
      event.clinicId,
      "patients",
      telegramMessagePages(
        `Importação de clientes\n${summary}${actor ? ` por ${actor}` : ""}.`,
        [
          {
            lines: event.patients.map(
              ({ fullName, cpf }) => `• ${fullName} (${telegramCpf(cpf)})`,
            ),
          },
        ],
      ),
    );
  };
}
