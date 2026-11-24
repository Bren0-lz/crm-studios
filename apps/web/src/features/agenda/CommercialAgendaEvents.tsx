import type { CommercialEvent } from "@crm/contracts";
import { Link } from "react-router-dom";
import { timeLabel } from "../../shared/lib/formatting";

export function CommercialAgendaEvents({
  events,
}: {
  events: CommercialEvent[];
}) {
  if (!events.length) return null;
  return (
    <ul className="day-events-list" aria-label="Eventos comerciais">
      {events.map((event) => (
        <li key={event.id}>
          <Link to={`/eventos/${event.id}`}>
            <time dateTime={event.startsAt}>
              {timeLabel.format(new Date(event.startsAt))}
            </time>
            {" · "}
            {event.name}
          </Link>
          {event.location && <small>{event.location}</small>}
        </li>
      ))}
    </ul>
  );
}
