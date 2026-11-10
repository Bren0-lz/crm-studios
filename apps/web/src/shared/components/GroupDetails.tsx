import {
  type GroupClass,
  describeGroupSchedule,
  withPrefix,
} from "@crm/contracts";
import { CalendarClock } from "lucide-react";

const weekdayNames = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** Resumo da turma escolhida, para o atendente repassar dias e horários ao cliente. */
export function GroupDetails({ group }: { group: GroupClass }) {
  const slots = [...(group.weeklySlots ?? [])].sort(
    (a, b) =>
      (a.weekday + 6) % 7 - (b.weekday + 6) % 7 ||
      a.startTime.localeCompare(b.startTime),
  );
  const free = group.capacity - group.activeEnrollments;
  return (
    <section
      className="group-details"
      aria-label={`Detalhes da ${withPrefix("turma", group.name)}`}
    >
      <header>
        <CalendarClock size={16} aria-hidden="true" />
        <div>
          <strong>{group.name}</strong>
          <small>{describeGroupSchedule(slots)}</small>
        </div>
      </header>
      {slots.length > 0 && (
        <ul className="group-details-slots">
          {slots.map((slot) => (
            <li key={`${slot.weekday}-${slot.startTime}`}>
              <span>{weekdayNames[slot.weekday]}</span>
              <span>{`${slot.startTime} às ${slot.endTime}`}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="group-details-info">
        <div>
          <dt>Profissional</dt>
          <dd>{group.professionalName}</dd>
        </div>
        {group.roomName && (
          <div>
            <dt>Sala</dt>
            <dd>{group.roomName}</dd>
          </div>
        )}
        <div>
          <dt>Vagas</dt>
          <dd>
            {free > 0
              ? `${free} de ${group.capacity}`
              : `Turma cheia · ${group.waitlistCount} na lista de espera`}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        Informe ao cliente os dias e horários acima antes de confirmar.
      </p>
    </section>
  );
}
