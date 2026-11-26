import type { CommercialEvent } from "@crm/contracts";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
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
          <Link className="commercial-agenda-event" to={`/eventos/${event.id}`}>
            <span className="commercial-agenda-event-content">
              <time dateTime={event.startsAt}>
                <CalendarDays size={14} aria-hidden="true" />
                {timeLabel.format(new Date(event.startsAt))}
              </time>
              <strong>{event.name}</strong>
              {event.location && (
                <small>
                  <MapPin size={14} aria-hidden="true" />
                  {event.location}
                </small>
              )}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
