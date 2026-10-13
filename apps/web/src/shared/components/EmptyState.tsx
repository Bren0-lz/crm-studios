import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CalendarDays size={30} />
      <strong>{title}</strong>
      <span>{copy}</span>
      {action}
    </div>
  );
}
