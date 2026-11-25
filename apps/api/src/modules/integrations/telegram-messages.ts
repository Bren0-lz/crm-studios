import { formatCpf } from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";

export const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

export function telegramCpf(cpf: string | undefined) {
  return cpf ? `CPF: ${formatCpf(cpf)}` : "CPF não informado";
}

export function telegramClock(timeZone: string) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
  });
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const day = (value: Date) =>
    `${date.format(value)} (${weekday.format(value)})`;
  return {
    day,
    time: (value: Date) => time.format(value),
    dateTime: (value: Date) => `${day(value)} às ${time.format(value)}`,
  };
}

type AppointmentClient = {
  patientId?: string | undefined;
  leadId?: string | undefined;
};

export async function telegramAppointmentCpfs(
  repository: Pick<ClinicRepository, "getPatient" | "listLeads">,
  clinicId: string,
  appointments: readonly AppointmentClient[],
) {
  const patientIds = new Set(
    appointments.flatMap(({ patientId }) => (patientId ? [patientId] : [])),
  );
  const [patients, leads] = await Promise.all([
    Promise.all(
      [...patientIds].map(
        async (id) =>
          [id, (await repository.getPatient(clinicId, id))?.cpf] as const,
      ),
    ),
    appointments.some((item) => item.leadId)
      ? repository.listLeads(clinicId)
      : [],
  ]);
  const cpfs = new Map(patients);
  const leadCpfs = new Map(leads.map((lead) => [lead.id, lead.cpf]));
  return (item: AppointmentClient) =>
    item.patientId ? cpfs.get(item.patientId) : leadCpfs.get(item.leadId ?? "");
}

type TelegramMessageSection = { lines: readonly string[]; heading?: string };

/** Mantém cada item inteiro e repete o cabeçalho do grupo quando ele continua em outra mensagem. */
export function telegramMessagePages(
  title: string,
  sections: readonly TelegramMessageSection[],
): string[] {
  const pages: string[] = [];
  let body = "";
  const total = sections.reduce(
    (count, section) => count + section.lines.length,
    0,
  );
  const budget =
    MAX_TELEGRAM_MESSAGE_LENGTH -
    title.length -
    `\nParte ${total} de ${total}`.length;
  for (const { heading, lines } of sections) {
    const sectionStart = heading ? `\n\n${heading}\n` : "\n\n";
    let separator = sectionStart;
    for (const line of lines) {
      if (body && body.length + separator.length + line.length > budget) {
        pages.push(body);
        body = "";
        separator = sectionStart;
      }
      body += separator + line;
      separator = "\n";
    }
  }
  pages.push(body);
  return pages.map((page, index) =>
    pages.length === 1
      ? `${title}${page}`
      : `${title}\nParte ${index + 1} de ${pages.length}${page}`,
  );
}
