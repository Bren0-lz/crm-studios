import {
  groupEnrollmentCoversSession,
  isReceiptReminderDue,
  resolveReceiptReminderSettings,
  unsignedReceiptPatientCount,
  withPrefix,
  type Appointment,
  type BranchScope,
  type GroupClass,
  type GroupEnrollment,
  type GroupSession,
} from "@crm/contracts";
import type { FastifyBaseLogger } from "fastify";
import type {
  AuthenticatedUser,
  ClinicRepository,
  TelegramLink,
} from "../../repository.js";
import { zonedTimeToUtc } from "../groups/group-schedule.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";
import type { TelegramService } from "./telegram.js";

/** Comandos de agenda do bot (TG4): período no fuso da clínica. */
export const telegramAgendaCommands = ["/hoje", "/semana", "/mes"] as const;
export type TelegramAgendaCommand = (typeof telegramAgendaCommands)[number];

/** Limite de texto de uma mensagem do Telegram. */
const MAX_MESSAGE_LENGTH = 4096;

export const telegramCommandsHelp =
  "Comandos: /hoje (agenda de hoje), /semana (desta semana) e /mes (deste mês).";

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

/** 0 = domingo, de uma data aaaa-mm-dd. */
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Dias (aaaa-mm-dd, fuso da clínica) do período do comando: hoje, segunda a domingo, mês. */
export function telegramAgendaPeriod(
  command: TelegramAgendaCommand,
  now: Date,
  timeZone: string,
) {
  const today = clinicDateOf(now, timeZone);
  let first = today;
  let last = today;
  if (command === "/semana") {
    first = addDays(today, -((weekdayOf(today) + 6) % 7));
    last = addDays(first, 6);
  } else if (command === "/mes") {
    first = `${today.slice(0, 7)}-01`;
    const nextMonth = new Date(`${first}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    last = addDays(nextMonth.toISOString().slice(0, 10), -1);
  }
  return {
    first,
    last,
    from: zonedTimeToUtc(first, "00:00", timeZone).toISOString(),
    to: zonedTimeToUtc(addDays(last, 1), "00:00", timeZone).toISOString(),
  };
}

export interface TelegramAgendaItem {
  startsAt: string;
  /** Linha sem o horário: "Cliente · Serviço · com Profissional". */
  text: string;
  kind: "appointment" | "class";
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const fullDate = (date: string) => `${shortDate(date)}/${date.slice(0, 4)}`;
const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function periodTitle(
  command: TelegramAgendaCommand,
  period: { first: string; last: string },
) {
  if (command === "/hoje")
    return `Agenda de hoje (${WEEKDAYS[weekdayOf(period.first)]!.toLowerCase()}, ${fullDate(period.first)})`;
  if (command === "/semana")
    return `Agenda da semana (${shortDate(period.first)} a ${fullDate(period.last)})`;
  return `Agenda de ${MONTHS[Number(period.first.slice(5, 7)) - 1]} de ${period.first.slice(0, 4)}`;
}

/**
 * Texto da resposta: título, totais e os itens agrupados por dia (dias vazios não aparecem).
 * Acima do limite do Telegram, corta no último item que cabe e diz quantos ficaram de fora.
 */
export function formatTelegramAgenda(
  command: TelegramAgendaCommand,
  period: { first: string; last: string },
  items: readonly TelegramAgendaItem[],
  timeZone: string,
  maxLength = MAX_MESSAGE_LENGTH,
) {
  const appointments = items.filter((item) => item.kind === "appointment");
  const classes = items.length - appointments.length;
  const header = [
    periodTitle(command, period),
    `${plural(appointments.length, "atendimento", "atendimentos")} · ${plural(classes, "aula", "aulas")}`,
  ];
  if (items.length === 0)
    return [...header, "", "Nada marcado no período."].join("\n");
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const sorted = [...items].sort(
    (a, b) =>
      a.startsAt.localeCompare(b.startsAt) || a.text.localeCompare(b.text),
  );
  const lines: { text: string; item: boolean }[] = [];
  let day = "";
  for (const item of sorted) {
    const date = clinicDateOf(item.startsAt, timeZone);
    if (date !== day) {
      day = date;
      lines.push({ text: "", item: false });
      lines.push({
        text: `${WEEKDAYS[weekdayOf(date)]}, ${shortDate(date)}`,
        item: false,
      });
    }
    lines.push({
      text: `${time.format(new Date(item.startsAt))} · ${item.text}`,
      item: true,
    });
  }
  const full = [...header, ...lines.map((line) => line.text)].join("\n");
  if (full.length <= maxLength) return full;
  // Reserva espaço para "… e mais N" e corta no último item que cabe.
  const budget = maxLength - `\n… e mais ${sorted.length}`.length;
  const output = [...header];
  let length = output.join("\n").length;
  let shown = 0;
  for (const line of lines) {
    if (length + 1 + line.text.length > budget) break;
    output.push(line.text);
    length += 1 + line.text.length;
    if (line.item) shown++;
  }
  // Dia sem nenhum item embaixo (cabeçalho ou linha em branco) não fica sozinho no fim.
  while (
    output.length > header.length &&
    !/^\d{2}:\d{2} · /.test(output.at(-1)!)
  )
    output.pop();
  output.push(`… e mais ${sorted.length - shown}`);
  return output.join("\n");
}

type Repository = Pick<
  ClinicRepository,
  | "findTelegramLinksByChat"
  | "findUserById"
  | "getClinicSettings"
  | "getOwnProfile"
  | "listAppointments"
  | "listGroupSessions"
  | "getGroupWorkspace"
  | "getFinancialSummary"
  | "getTelegramReceiptReminderSentOn"
  | "claimTelegramReceiptReminder"
  | "branchScope"
>;

/**
 * O que o usuário vinculado enxerga, como na agenda do CRM: atendimentos com o módulo
 * Agenda, aulas de turma com Agenda ou Turmas; sem "Ver agenda de todos os profissionais",
 * só os itens do profissional ligado a ele; e só nas filiais a que tem acesso.
 */
async function agendaItems(
  repository: Repository,
  user: AuthenticatedUser,
  period: { from: string; to: string },
  timeZone: string,
): Promise<TelegramAgendaItem[]> {
  const showAppointments = user.modules.includes("agenda");
  const showClasses = showAppointments || user.modules.includes("groups");
  const scope = user.permissions.includes("agenda.view_all")
    ? undefined
    : [
        (await repository.getOwnProfile(user.clinicId, user.id))?.professional
          ?.id,
      ].filter((id): id is string => Boolean(id));
  const visible = (professionalId: string | undefined) =>
    !scope || !professionalId || scope.includes(professionalId);
  const [appointments, sessions, workspace] = await Promise.all([
    showAppointments
      ? repository.listAppointments(user.clinicId, period.from, period.to)
      : ([] as Appointment[]),
    showClasses
      ? repository.listGroupSessions(user.clinicId, period.from, period.to)
      : ([] as GroupSession[]),
    // Só turmas e matrículas (período vazio: nenhum encontro), para a ocupação.
    showClasses
      ? repository.getGroupWorkspace(user.clinicId, period.from, period.from)
      : { groups: [] as GroupClass[], enrollments: [] as GroupEnrollment[] },
  ]);
  const groups = new Map(workspace.groups.map((group) => [group.id, group]));
  return [
    ...appointments
      .filter(
        (item) => item.status !== "cancelled" && visible(item.professionalId),
      )
      .map((item) => ({
        kind: "appointment" as const,
        startsAt: item.startsAt,
        text: `${item.patientName}${item.leadId ? " (lead)" : ""} · ${item.serviceName} · com ${item.professionalName}`,
      })),
    ...sessions
      .filter(
        (item) => item.status !== "cancelled" && visible(item.professionalId),
      )
      .map((session) => {
        const group = groups.get(session.groupId);
        const enrolled = workspace.enrollments.filter(
          (enrollment) =>
            enrollment.groupId === session.groupId &&
            groupEnrollmentCoversSession(enrollment, session, timeZone),
        ).length;
        const occupancy = group
          ? ` · ${enrolled}/${group.capacity} ${group.capacity === 1 ? "vaga ocupada" : "vagas ocupadas"}`
          : "";
        return {
          kind: "class" as const,
          startsAt: session.startsAt,
          text: `${withPrefix("Turma", session.groupName)} · com ${session.professionalName}${occupancy}`,
        };
      }),
  ];
}

const unlinkedReply = (settingsPath: string, linkCommand: string) =>
  `Este chat ainda não está vinculado ao CRM. Gere um código em ${settingsPath} e envie ${linkCommand} <código>.`;

/**
 * Comandos de agenda e aviso periódico de recibos (TG4). O chat diz a clínica e o usuário
 * (vínculo mais recente, se houver mais de um); chat sem vínculo só recebe a orientação.
 */
export function createTelegramCommands({
  repository,
  telegram,
  accessibleBranches,
  log,
  settingsPath,
  linkCommand,
}: {
  repository: Repository;
  telegram: TelegramService;
  accessibleBranches: (
    user: AuthenticatedUser,
  ) => Promise<{ id: string; isDefault: boolean }[]>;
  log: FastifyBaseLogger;
  settingsPath: string;
  linkCommand: string;
}) {
  async function linkOf(chatId: string): Promise<TelegramLink | undefined> {
    return (await repository.findTelegramLinksByChat(chatId))[0];
  }

  async function timeZoneOf(clinicId: string) {
    return (
      (await repository.getClinicSettings(clinicId))?.timezone ??
      DEFAULT_CLINIC_TIMEZONE
    );
  }

  /** Mesmo escopo de filial de uma requisição sem `X-Branch-Id`. */
  async function branchScopeOf(
    user: AuthenticatedUser,
  ): Promise<BranchScope | null> {
    const branches = await accessibleBranches(user);
    if (branches.length === 0) return null;
    const everything = user.role === "admin" || (user.allBranches ?? true);
    const write = branches.find((branch) => branch.isDefault) ?? branches[0]!;
    return {
      branchIds: everything ? null : branches.map((branch) => branch.id),
      writeBranchId: write.id,
    };
  }

  async function agenda(command: TelegramAgendaCommand, chatId: string) {
    const link = await linkOf(chatId);
    if (!link) {
      await telegram.enqueue(null, [
        { chatId, message: unlinkedReply(settingsPath, linkCommand) },
      ]);
      return;
    }
    const reply = (message: string) =>
      telegram.enqueue(link.clinicId, [{ chatId, message }]);
    const user = await repository.findUserById(link.clinicId, link.userId);
    if (!user) {
      await reply(unlinkedReply(settingsPath, linkCommand));
      return;
    }
    if (!user.modules.includes("agenda") && !user.modules.includes("groups")) {
      await reply("Seu perfil não tem acesso à agenda nem às turmas do CRM.");
      return;
    }
    const scope = await branchScopeOf(user);
    if (!scope) {
      await reply("Seu usuário não tem acesso a nenhuma filial ativa.");
      return;
    }
    const timeZone = await timeZoneOf(link.clinicId);
    const period = telegramAgendaPeriod(command, telegram.now(), timeZone);
    const items = await repository.branchScope.run(scope, () =>
      agendaItems(repository, user, period, timeZone),
    );
    await reply(formatTelegramAgenda(command, period, items, timeZone));
  }

  /**
   * Aviso "X clientes ainda não assinaram o recibo" (RC5): sem agendador, sai no primeiro
   * comando ou webhook depois do horário configurado na clínica (padrão provisório da RC6:
   * diário, 18:00), no máximo uma vez por dia, para todos os chats vinculados (como o aviso
   * de recibo assinado). Sem pendência, nada sai e o dia continua livre.
   */
  async function receiptReminder(clinicId: string) {
    const settings = await repository.getClinicSettings(clinicId);
    const timeZone = settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE;
    const now = telegram.now();
    if (
      !isReceiptReminderDue(
        resolveReceiptReminderSettings(settings?.receiptReminder),
        now,
        timeZone,
      )
    )
      return;
    const today = clinicDateOf(now, timeZone);
    if ((await repository.getTelegramReceiptReminderSentOn(clinicId)) === today)
      return;
    // Fora do escopo de filial do usuário: consolidado, como o aviso de recibo assinado.
    const count = unsignedReceiptPatientCount(
      (await repository.getFinancialSummary(clinicId)).receivables,
    );
    if (count === 0) return;
    if (!(await repository.claimTelegramReceiptReminder(clinicId, today)))
      return;
    await telegram.notifyLinkedChats(
      clinicId,
      count === 1
        ? "Recibos: 1 cliente ainda não assinou o recibo."
        : `Recibos: ${count} clientes ainda não assinaram o recibo.`,
    );
  }

  return {
    agenda,
    /** Vínculo do chat (o mais recente), para escolher a ajuda certa. */
    linkOf,
    /** Depois de cada webhook: aviso de recibos das clínicas do chat. Nunca lança. */
    async receiptReminderSafely(chatId: string) {
      try {
        const clinics = new Set(
          (await repository.findTelegramLinksByChat(chatId)).map(
            (link) => link.clinicId,
          ),
        );
        for (const clinicId of clinics) await receiptReminder(clinicId);
      } catch (error) {
        log.error({ err: error }, "telegram receipt reminder");
      }
    },
  };
}
