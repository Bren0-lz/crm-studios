import type { Appointment, UserSummary } from "@crm/contracts";
import { Bell, CalendarClock, LogOut, Settings } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuthorization } from "../authorization-context";
import {
  initials,
  localIsoDate,
  roleLabels,
  timeLabel,
} from "../shared/lib/formatting";

/** Painel suspenso do cabeçalho: fecha com Esc, clique fora ou ao escolher um item. */
function HeaderPopover({
  label,
  trigger,
  triggerClassName,
  children,
}: {
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return (
    <div className="header-popover" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      {open && (
        <div className="header-popover-panel" role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function NotificationsMenu({
  onNavigate,
}: {
  onNavigate: (to: string) => void;
}) {
  return (
    <HeaderPopover
      label="Notificações"
      triggerClassName="icon-button"
      trigger={<Bell size={19} />}
    >
      {(close) => (
        <NotificationsList
          onOpen={(to) => {
            close();
            onNavigate(to);
          }}
        />
      )}
    </HeaderPopover>
  );
}

function NotificationsList({ onOpen }: { onOpen: (to: string) => void }) {
  const { canView } = useAuthorization();
  const canSeeAgenda = canView("agenda");
  const [pending, setPending] = useState<Appointment[] | null>(
    canSeeAgenda ? null : [],
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!canSeeAgenda) return;
    let active = true;
    api
      .dashboard(localIsoDate())
      .then((data) => active && setPending(data.nextAppointments ?? []))
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar as notificações.");
        setPending([]);
      });
    return () => {
      active = false;
    };
  }, [canSeeAgenda]);
  return (
    <>
      <strong className="header-popover-title">Notificações</strong>
      {pending === null ? (
        <p className="muted-copy">Carregando…</p>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : pending.length === 0 ? (
        <p className="muted-copy">Nenhuma notificação.</p>
      ) : (
        <ul className="header-notifications">
          {pending.slice(0, 5).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="text-button header-notification-item"
                onClick={() => onOpen("/agenda")}
              >
                <CalendarClock size={16} aria-hidden="true" />
                <span>
                  <strong>{item.patientName}</strong>
                  <small>
                    Pendente hoje às {timeLabel.format(new Date(item.startsAt))}{" "}
                    · {item.serviceName}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {pending.length > 5 && (
            <li>
              <button
                type="button"
                className="text-button header-notification-item"
                onClick={() => onOpen("/")}
              >
                Ver todos os {pending.length} pendentes de hoje
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

export function UserMenu({
  user,
  onNavigate,
  onLogout,
}: {
  user: UserSummary;
  onNavigate: (to: string) => void;
  onLogout: () => void;
}) {
  const { canView } = useAuthorization();
  return (
    <HeaderPopover
      label="Menu do usuário"
      triggerClassName="top-avatar"
      trigger={initials(user.fullName)}
    >
      {(close) => (
        <>
          <div className="header-user">
            <strong>{user.fullName}</strong>
            <small>{user.email}</small>
            <small>{user.jobTitle ?? roleLabels[user.role]}</small>
          </div>
          <div className="header-user-actions">
            {canView("settings") && (
              <button
                type="button"
                className="action-menu-item"
                onClick={() => {
                  close();
                  onNavigate("/configuracoes");
                }}
              >
                <Settings size={16} /> Configurações
              </button>
            )}
            <button
              type="button"
              className="action-menu-item"
              onClick={() => {
                close();
                onLogout();
              }}
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </>
      )}
    </HeaderPopover>
  );
}
