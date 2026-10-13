import type { Appointment } from "@crm/contracts";
import { visitTypeBadgeText } from "../lib/formatting";

export function VisitTypeBadge({ appointment }: { appointment: Appointment }) {
  const text = visitTypeBadgeText(appointment);
  if (!text) return null;
  return (
    <span className={`status-pill visit-${appointment.visitType}`}>{text}</span>
  );
}
