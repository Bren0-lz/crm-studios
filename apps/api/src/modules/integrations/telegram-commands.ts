import {
  groupEnrollmentCoversSession,
  isReceiptReminderDue,
  resolveReceiptReminderSettings,
  unsignedReceiptPatientIds,
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
import {
  telegramAppointmentCpfs,
  telegramClock,
  telegramCpf,
  telegramMessagePages,
} from "./telegram-messages.js";

/** Comandos de agenda do bot (TG4): período no fuso da clínica. */
export const telegramAgendaCommands = ["/hoje", "/semana", "/mes"] as const;
export type TelegramAgendaCommand = (typeof telegramAgendaCommands)[number];

export const telegramCommandsHelp = [
  "Quer consultar a agenda? Toque em uma opção:",
  "",
  "/hoje — Agenda de hoje",
  "/semana — Agenda desta semana",
  "/mes — Agenda deste mês",
].join("\n");

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
  text: string;
  kind: "appointment" | "class";
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const fullDate = (date: string) => `${shortDate(date)}/${date.slice(0, 4)}`;
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
  dayLabel: string,
) {
  if (command === "/hoje") return `Agenda de hoje — ${dayLabel}`;
  if (command === "/semana")
    return `Agenda da semana — ${fullDate(period.first)} a ${fullDate(period.last)}`;
  return `Agenda de ${MONTHS[Number(period.first.slice(5, 7)) - 1]} de ${period.first.slice(0, 4)}`;
}

/**
 * Resposta com os itens agrupados por dia. Agendas longas continuam em outras mensagens.
 */
export function formatTelegramAgendaMessages(
  command: TelegramAgendaCommand,
  period: { first: string; last: string },
  items: readonly TelegramAgendaItem[],
  timeZone: string,
) {
  const clock = telegramClock(timeZone);
  const dayLabel = clock.day(zonedTimeToUtc(period.first, "12:00", timeZone));
  const title = periodTitle(command, period, dayLabel);
  if (items.length === 0)
    return [`${title}\n\nNenhum atendimento ou aula marcado nesse período.`];
  const appointments = items.filter(
    (item) => item.kind === "appointment",
  ).length;
  const classes = items.length - appointments;
  const sorted = [...items].sort(
    (a, b) =>
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.text.localeCompare(b.text, "pt-BR"),
  );
  const total = `${plural(appointments, "atendimento", "atendimentos")} e ${plural(classes, "aula", "aulas")}`;
  const days = new Map<string | undefined, string[]>();
  for (const { startsAt, text } of sorted) {
    const start = new Date(startsAt);
    const day = command === "/hoje" ? undefined : clock.day(start);
    const lines = days.get(day) ?? [];
    lines.push(`• ${clock.time(start)} — ${text}`);
    days.set(day, lines);
  }
  return telegramMessagePages(
    `${title}\n${total}`,
    [...days].map(([heading, lines]) =>
      heading ? { heading, lines } : { lines },
    ),
  );
}

type Repository = Pick<
  ClinicRepository,
  | "findTelegramLinksByChat"
  | "findTelegramGroupLinksByChat"
  | "findUserById"
  | "getClinicSettings"
  | "getOwnProfile"
  | "listAppointments"
  | "listGroupSessions"
  | "getGroupWorkspace"
  | "getPatient"
  | "listLeads"
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
  const visibleAppointments = appointments.filter(
    (item) => item.status !== "cancelled" && visible(item.professionalId),
  );
  const cpfOf = await telegramAppointmentCpfs(
    repository,
    user.clinicId,
    visibleAppointments,
  );
  return [
    ...visibleAppointments.map((item) => ({
      kind: "appointment" as const,
      startsAt: item.startsAt,
      text: `${item.patientName}${item.leadId ? " (pessoa interessada)" : ""} (${telegramCpf(cpfOf(item))}) — ${item.serviceName} com ${item.professionalName}`,
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
          ? ` (${enrolled} de ${group.capacity} ${group.capacity === 1 ? "vaga ocupada" : "vagas ocupadas"})`
          : "";
        return {
          kind: "class" as const,
          startsAt: session.startsAt,
          text: `${withPrefix("Turma", session.groupName)} com ${session.professionalName}${occupancy}`,
        };
      }),
  ];
}

/**
 * Comandos de agenda e aviso periódico de recibos (TG4). O chat diz a clínica e o usuário
 * (vínculo mais recente, se houver mais de um); chat sem vínculo só recebe a orientação.
 */
export function createTelegramCommands({
  repository,
  telegram,
  accessibleBranches,
  log,
  unlinkedReply,
}: {
  repository: Repository;
  telegram: TelegramService;
  accessibleBranches: (
    user: AuthenticatedUser,
  ) => Promise<{ id: string; isDefault: boolean }[]>;
  log: FastifyBaseLogger;
  unlinkedReply: string;
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
      await telegram.enqueue(null, [{ chatId, message: unlinkedReply }]);
      return;
    }
    const reply = (...messages: string[]) =>
      telegram.enqueue(
        link.clinicId,
        messages.map((message) => ({ chatId, message })),
      );
    const user = await repository.findUserById(link.clinicId, link.userId);
    if (!user) {
      await reply(unlinkedReply);
      return;
    }
    if (!user.modules.includes("agenda") && !user.modules.includes("groups")) {
      await reply(
        "Para consultar a agenda aqui, peça acesso à Agenda ou a Turmas à pessoa responsável pelo CRM.",
      );
      return;
    }
    const scope = await branchScopeOf(user);
    if (!scope) {
      await reply(
        "Para consultar a agenda aqui, peça acesso a uma filial à pessoa responsável pelo CRM.",
      );
      return;
    }
    const timeZone = await timeZoneOf(link.clinicId);
    const period = telegramAgendaPeriod(command, telegram.now(), timeZone);
    const items = await repository.branchScope.run(scope, () =>
      agendaItems(repository, user, period, timeZone),
    );
    await reply(
      ...formatTelegramAgendaMessages(command, period, items, timeZone),
    );
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
    const { receivables } = await repository.getFinancialSummary(clinicId);
    const pending = unsignedReceiptPatientIds(receivables);
    const count = pending.size;
    if (count === 0) return;
    const names = new Map(
      receivables.map(({ patientId, patientName }) => [patientId, patientName]),
    );
    const clients = await Promise.all(
      [...pending].map(async (id) => {
        const patient = await repository.getPatient(clinicId, id);
        return {
          name: patient?.fullName ?? names.get(id)!,
          cpf: patient?.cpf,
        };
      }),
    );
    if (!(await repository.claimTelegramReceiptReminder(clinicId, today)))
      return;
    await telegram.notifyLinkedChats(
      clinicId,
      "receipts",
      telegramMessagePages(
        count === 1
          ? "Recibos para assinar\n1 cliente ainda precisa assinar."
          : `Recibos para assinar\n${count} clientes ainda precisam assinar.`,
        [
          {
            lines: clients
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              .map(({ name, cpf }) => `• ${name} (${telegramCpf(cpf)})`),
          },
        ],
      ),
    );
  }

  return {
    agenda,
    /** Vínculo do chat (o mais recente), para escolher a ajuda certa. */
    linkOf,
    /** Grupo vinculado com este chat (o mais recente), se houver. */
    async groupOf(chatId: string) {
      return (await repository.findTelegramGroupLinksByChat(chatId))[0];
    },
    /**
     * Depois de cada webhook: aviso de recibos das clínicas do chat (pessoal ou grupo).
     * Nunca lança.
     */
    async receiptReminderSafely(chatId: string) {
      try {
        const [links, groups] = await Promise.all([
          repository.findTelegramLinksByChat(chatId),
          repository.findTelegramGroupLinksByChat(chatId),
        ]);
        const clinics = new Set(
          [...links, ...groups].map((link) => link.clinicId),
        );
        for (const clinicId of clinics) await receiptReminder(clinicId);
      } catch (error) {
        log.error({ err: error }, "telegram receipt reminder");
      }
    },
  };
}
