import type {
  Appointment,
  GroupSession,
  Professional,
  ScheduleBlock,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import {
  initials,
  localIsoDate,
  statusLabel,
  timeLabel,
} from "../../shared/lib/formatting";
import { professionalColorStyle } from "../../tag-colors";
import { appointmentStatusClass } from "./model";
import { PendingFinalizationBadge } from "./PendingFinalizationBadge";

const SLOT_MINUTES = 30;

type GridEntry =
  | {
      kind: "appointment";
      id: string;
      start: number;
      end: number;
      item: Appointment;
    }
  | {
      kind: "group";
      id: string;
      start: number;
      end: number;
      item: GroupSession;
    }
  | {
      kind: "block";
      id: string;
      start: number;
      end: number;
      item: ScheduleBlock;
    };

interface Cluster {
  startSlot: number;
  span: number;
  entries: GridEntry[];
}

function two(value: number) {
  return String(value).padStart(2, "0");
}

/** Agrupa compromissos que se sobrepõem numa coluna e calcula as linhas que ocupam. */
function clustersFor(entries: GridEntry[], dayStart: number, slots: number) {
  const slotMs = SLOT_MINUTES * 60_000;
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  const clusters: Cluster[] = [];
  let current: { start: number; end: number; entries: GridEntry[] } | null =
    null;
  const close = () => {
    if (!current) return;
    const startSlot = Math.max(
      0,
      Math.floor((current.start - dayStart) / slotMs),
    );
    const endSlot = Math.min(
      slots,
      Math.max(startSlot + 1, Math.ceil((current.end - dayStart) / slotMs)),
    );
    clusters.push({
      startSlot,
      span: endSlot - startSlot,
      entries: current.entries,
    });
  };
  for (const entry of sorted) {
    if (current && entry.start < current.end) {
      current.end = Math.max(current.end, entry.end);
      current.entries.push(entry);
    } else {
      close();
      current = { start: entry.start, end: entry.end, entries: [entry] };
    }
  }
  close();
  return clusters;
}

/**
 * Visão Dia em grade: linhas de 30 minutos e uma coluna por profissional. Cada compromisso
 * ocupa as linhas da sua duração (rowSpan); um horário livre abre o Novo atendimento
 * com o profissional e o início preenchidos.
 */
export function DayScheduleGrid({
  day,
  professionals,
  appointments,
  groupSessions,
  blocks,
  onOpenAppointment,
  onCreate,
  highlightedIds = [],
}: {
  day: Date;
  professionals: Professional[];
  appointments: Appointment[];
  groupSessions: GroupSession[];
  blocks: ScheduleBlock[];
  onOpenAppointment: (id: string) => void;
  /** Atendimentos recém-salvos, com realce temporário. */
  highlightedIds?: string[];
  /** Sem permissão para agendar (ou feriado), os horários livres não são clicáveis. */
  onCreate?: ((professionalId: string, startsAt: string) => void) | undefined;
}) {
  const dayKey = localIsoDate(day);
  const entries: (GridEntry & {
    professionalId: string;
    professionalName: string;
  })[] = [
    ...appointments.map((item) => ({
      kind: "appointment" as const,
      id: item.id,
      start: Date.parse(item.startsAt),
      end: Date.parse(item.endsAt),
      item,
      professionalId: item.professionalId,
      professionalName: item.professionalName,
    })),
    ...groupSessions.map((item) => ({
      kind: "group" as const,
      id: item.id,
      start: Date.parse(item.startsAt),
      end: Date.parse(item.endsAt),
      item,
      professionalId: item.professionalId,
      professionalName: item.professionalName,
    })),
    ...blocks
      .filter((item) => item.professionalId && item.status === "active")
      .map((item) => ({
        kind: "block" as const,
        id: item.id,
        start: Date.parse(item.startsAt),
        end: Date.parse(item.endsAt),
        item,
        professionalId: item.professionalId!,
        professionalName: item.professionalName ?? "Profissional",
      })),
  ];
  // Colunas: profissionais ativos + quem aparece nos compromissos (ex.: já desativado).
  const columns = [
    ...professionals.map((item) => ({
      id: item.id,
      name: item.fullName,
      color: item.color as string | undefined,
    })),
    ...entries
      .filter(
        (entry) =>
          !professionals.some((item) => item.id === entry.professionalId),
      )
      .map((entry) => ({
        id: entry.professionalId,
        name: entry.professionalName,
        color:
          entry.kind === "appointment"
            ? entry.item.professionalColor
            : undefined,
      })),
  ].filter(
    (column, index, all) =>
      all.findIndex((item) => item.id === column.id) === index,
  );
  // Das 7h às 21h, ampliado para caber o que estiver fora desse horário.
  const hours = entries.flatMap((entry) => [
    new Date(entry.start).getHours(),
    Math.ceil(
      (new Date(entry.end).getHours() * 60 + new Date(entry.end).getMinutes()) /
        60,
    ),
  ]);
  const firstHour = Math.max(0, Math.min(7, ...hours));
  const lastHour = Math.min(24, Math.max(21, ...hours));
  const slots = ((lastHour - firstHour) * 60) / SLOT_MINUTES;
  const dayStart = new Date(day);
  dayStart.setHours(firstHour, 0, 0, 0);
  const columnClusters = new Map(
    columns.map((column) => [
      column.id,
      clustersFor(
        entries.filter((entry) => entry.professionalId === column.id),
        dayStart.getTime(),
        slots,
      ),
    ]),
  );
  const slotLabel = (slot: number) => {
    const minutes = firstHour * 60 + slot * SLOT_MINUTES;
    return `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
  };

  return (
    <div className="day-grid-scroll">
      {entries.length === 0 && (
        <p className="day-grid-empty">
          <strong>Dia disponível</strong>
          {onCreate ? " · clique em um horário para agendar." : ""}
        </p>
      )}
      <table className="day-grid" aria-label="Agenda do dia por profissional">
        <thead>
          <tr>
            <th scope="col" className="day-grid-time">
              <span className="sr-only">Horário</span>
            </th>
            {columns.map((column) => (
              <th scope="col" key={column.id}>
                <span
                  className="avatar pro-avatar"
                  style={professionalColorStyle(column.color)}
                  aria-hidden="true"
                >
                  {initials(column.name)}
                </span>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: slots }, (_, slot) => (
            <tr key={slot} className={slot % 2 ? "half-hour" : undefined}>
              <th scope="row" className="day-grid-time">
                {slot % 2 === 0 ? slotLabel(slot) : ""}
              </th>
              {columns.map((column) => {
                const clusters = columnClusters.get(column.id) ?? [];
                const cluster = clusters.find(
                  (item) => item.startSlot === slot,
                );
                if (cluster)
                  return (
                    <td
                      key={column.id}
                      rowSpan={cluster.span}
                      className="day-grid-busy"
                    >
                      {cluster.entries.map((entry) => (
                        <GridEvent
                          key={`${entry.kind}-${entry.id}`}
                          entry={entry}
                          highlighted={
                            entry.kind === "appointment" &&
                            highlightedIds.includes(entry.id)
                          }
                          onOpenAppointment={onOpenAppointment}
                        />
                      ))}
                    </td>
                  );
                if (
                  clusters.some(
                    (item) =>
                      slot > item.startSlot &&
                      slot < item.startSlot + item.span,
                  )
                )
                  return null;
                const startsAt = `${dayKey}T${slotLabel(slot)}`;
                return (
                  <td key={column.id} className="day-grid-free">
                    {onCreate && (
                      <button
                        type="button"
                        className="text-button day-grid-add"
                        aria-label={`Agendar com ${column.name} às ${slotLabel(slot)}`}
                        onClick={() => onCreate(column.id, startsAt)}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridEvent({
  entry,
  onOpenAppointment,
  highlighted,
}: {
  entry: GridEntry;
  onOpenAppointment: (id: string) => void;
  highlighted: boolean;
}) {
  const time = `${timeLabel.format(new Date(entry.start))}–${timeLabel.format(new Date(entry.end))}`;
  if (entry.kind === "appointment")
    return (
      <button
        type="button"
        className={`text-button day-grid-event ${appointmentStatusClass(entry.item.status)}${highlighted ? " agenda-just-saved" : ""}`}
        style={professionalColorStyle(entry.item.professionalColor)}
        aria-label={`Detalhes de ${entry.item.patientName}`}
        onClick={() => onOpenAppointment(entry.id)}
      >
        <time>{time}</time>
        <strong>{entry.item.patientName}</strong>
        <span>{entry.item.serviceName}</span>
        <span className={`status-pill ${entry.item.status}`}>
          {statusLabel(entry.item.status)}
        </span>
        <PendingFinalizationBadge compact appointment={entry.item} />
      </button>
    );
  return (
    <div className={`day-grid-event day-grid-${entry.kind}`}>
      <time>{time}</time>
      <strong
        className={entry.kind === "group" ? "group-name" : undefined}
        title={entry.kind === "group" ? entry.item.groupName : undefined}
      >
        {entry.kind === "group" ? entry.item.groupName : "Bloqueio"}
      </strong>
      <span>
        {entry.kind === "group" ? entry.item.roomName : entry.item.reason}
      </span>
    </div>
  );
}
