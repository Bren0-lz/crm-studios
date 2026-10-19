import { CalendarDays, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Estado vazio com ilustração (ícone grande) e, quando houver, a ação principal (V11). */
export function EmptyState({
  title,
  copy,
  action,
  icon: Icon = CalendarDays,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon size={32} />
      </span>
      <strong>{title}</strong>
      <span>{copy}</span>
      {action}
    </div>
  );
}
